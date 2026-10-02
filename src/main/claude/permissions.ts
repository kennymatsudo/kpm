/**
 * KPM's part of Claude tool permissions. What may run is the user's own Claude
 * Code settings: their permission mode, allow and deny rules, and sandbox.
 * KPM adds document capture and disabled MCP servers on top, and asks the user
 * whenever those settings say to ask.
 */

import type { CanUseTool, HookCallbackMatcher, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionRequest } from '../../shared/types';
import { promises as fs } from 'fs';
import { normalize, relative } from 'path';
import { isContextFile, CONTEXT_FILE_PENDING_CACHE_KEY } from '../../shared/contextFile';
import { getConfig } from '../config';

/**
 * Per-tool-call permission tracing. Silent unless `claude.debug` is on — this
 * runs on every tool the agent invokes, so it would otherwise flood the console
 * (and echo tool inputs) during any normal chat.
 */
function permLog(...args: unknown[]): void {
  if (getConfig().claude.debug) {
    console.log(...args);
  }
}

/** Function to prompt user for permission */
export type PromptUserFn = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal?: AbortSignal;
    chatSessionId?: string;
    kind?: PermissionRequest['kind'];
    title?: string;
  }
) => Promise<PermissionResult>;

/** Callback for intercepted project context file edits */
export type ContextFileInterceptFn = (
  projectId: string,
  newContent: string
) => void;

/** Callback for intercepted project file writes */
export type ProjectFileInterceptFn = (
  projectId: string,
  filePath: string,
  content: string
) => void;

/** Context for permission checks */
export interface PermissionContext {
  projectPath: string;
  projectId: string;
  /** The chat session to ask in. A run without one (an action run) is denied wherever it would ask. */
  chatSessionId?: string;
  /** Optional callback to intercept project context file edits */
  onContextFileEdit?: ContextFileInterceptFn;
  /** Optional callback to intercept project file writes for approval */
  onProjectFileWrite?: ProjectFileInterceptFn;
  /**
   * Reads a file from disk so Edit-tool interception can compute the post-edit
   * content. Defaults to fs.readFile; tests inject a fake.
   */
  readProjectFile?: (absolutePath: string) => Promise<string>;
  /**
   * Returns proposed-but-unapproved content for a project-relative path (or
   * CONTEXT_FILE_PENDING_CACHE_KEY for the project context file) from the
   * current turn's pending cache, or undefined when nothing is pending. Lets
   * successive Edit/Write calls to the same file accumulate instead of each
   * computing against stale on-disk content (interception denies the write, so
   * disk never reflects earlier edits in the turn).
   */
  peekPendingFile?: (relativeFilePath: string) => string | undefined;
  /** External MCP servers disabled in KPM settings. */
  disabledMcpServerNames?: string[];
}

/**
 * Extract target path from tool input.
 * Returns null if tool doesn't operate on a specific path.
 */
function extractPath(toolName: string, input: Record<string, unknown>): string | null {
  // File operation tools
  if (toolName === 'Read' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write') {
    return typeof input.file_path === 'string' ? input.file_path : null;
  }

  // Notebook edits target notebook_path instead of file_path
  if (toolName === 'NotebookEdit') {
    return typeof input.notebook_path === 'string' ? input.notebook_path : null;
  }

  // Search tools
  if (toolName === 'Grep' || toolName === 'Glob') {
    return typeof input.path === 'string' ? input.path : null;
  }

  // Bash commands - extract from command string if possible
  if (toolName === 'Bash' && typeof input.command === 'string') {
    const command = input.command;
    // Try to extract file paths from common commands
    // This is a heuristic - we can't perfectly parse all bash commands
    const match = /(?:^|\s)(?:\.\/|\/|~\/)?([^\s;|&<>]+(?:\/[^\s;|&<>]+)+)/.exec(command);
    return match ? match[0].trim() : null;
  }

  return null;
}

/**
 * Check if a path is within a directory.
 * Handles symlinks and relative paths.
 */
function isWithinDirectory(targetPath: string, baseDir: string): boolean {
  try {
    const normalizedTarget = normalize(targetPath);
    const normalizedBase = normalize(baseDir);
    const rel = relative(normalizedBase, normalizedTarget);

    // Path is within directory if relative path doesn't start with '..'
    return !rel.startsWith('..') && !normalize(rel).startsWith('..');
  } catch {
    return false;
  }
}

/**
 * Check if a path targets CLAUDE.md in the project directory.
 */
function isContextFilePath(targetPath: string, projectPath: string): boolean {
  if (!targetPath) return false;
  try {
    const normalizedTarget = normalize(targetPath);
    const normalizedBase = normalize(projectPath);
    const rel = relative(normalizedBase, normalizedTarget);
    return isContextFile(rel);
  } catch {
    return false;
  }
}

/**
 * Generate preview text for permission prompt.
 */
function getToolPreview(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Edit' && typeof input.file_path === 'string') {
    return `Edit ${input.file_path}`;
  }
  if (toolName === 'Write' && typeof input.file_path === 'string') {
    return `Write ${input.file_path}`;
  }
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return `Run: ${input.command}`;
  }
  if (toolName === 'git_push' && typeof input.remote === 'string' && typeof input.branch === 'string') {
    return `git push ${input.remote} ${input.branch}`;
  }
  if (toolName === 'create_pull_request' && typeof input.target === 'string') {
    return `Open a pull request for ${input.target}`;
  }
  if (toolName === 'update_pull_request' && typeof input.target === 'string') {
    return `Edit pull request ${input.target}`;
  }
  return toolName;
}

const KPM_TOOL_PREFIX = 'mcp__kpm__';

function extractMcpServerName(toolName: string): string | null {
  const match = /^mcp__(.+?)__/.exec(toolName);
  return match?.[1] ?? null;
}

function mcpServerNameVariants(value: string): Set<string> {
  const lower = value.trim().toLowerCase();
  const withoutManagedPrefix = lower.replace(/^claude\.ai\s+/, '');
  const variants = new Set<string>();

  for (const candidate of [lower, withoutManagedPrefix]) {
    if (!candidate) continue;
    variants.add(candidate);
    variants.add(candidate.replace(/[^a-z0-9]/g, ''));
  }

  return variants;
}

function mcpServerNamesMatch(disabledServerName: string, toolServerName: string): boolean {
  const disabledVariants = mcpServerNameVariants(disabledServerName);
  const toolVariants = mcpServerNameVariants(toolServerName);

  for (const variant of toolVariants) {
    if (disabledVariants.has(variant)) return true;
  }
  return false;
}

/**
 * KPM's own rules for a Claude tool call, applied before the user's Claude Code
 * permissions decide whether it may run. Returns a deny message, or null to
 * leave the call to those permissions.
 *
 * - Intercept: project context file and project file edits are captured and
 *   sent to the approval queue instead of written.
 * - Deny: tools from MCP servers the user turned off in KPM settings.
 */
export async function evaluateKpmToolCall(
  context: PermissionContext,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  const targetPath = extractPath(toolName, input);

  // Rule 0: Intercept project context file edits (AGENTS.md / CLAUDE.md) for user approval
  if (targetPath && isContextFilePath(targetPath, context.projectPath)) {
    if (toolName === 'Write' && context.onContextFileEdit && typeof input.content === 'string') {
      const newContent = input.content;
      permLog(`[Permissions] Context file Write intercepted - capturing for approval (${newContent.length} chars)`);
      context.onContextFileEdit(context.projectId, newContent);
      return 'Project context file update captured by KPM.';
    }
    // Edit tool on the context file: read the file, apply old_string ->
    // new_string ourselves, and route the full new content through
    // onContextFileEdit so it lands in the same approval flow as Write.
    // Mirrors Rule 0.5's Edit interception for regular project files.
    if (toolName === 'Edit' && context.onContextFileEdit) {
      const oldString = typeof input.old_string === 'string' ? input.old_string : null;
      const newString = typeof input.new_string === 'string' ? input.new_string : null;

      if (!oldString || newString === null) {
        return 'Edit requires old_string and new_string. Pass exact text from the file (whitespace-sensitive).';
      }
      if (oldString === newString) {
        return 'old_string and new_string are identical. No change would be made.';
      }

      // Prefer pending content from earlier edits this turn so multiple
      // edits to the context file accumulate. The interception denies the
      // write, so disk never reflects prior edits — reading it would
      // silently drop them. Shares the cache with the propose_context_edit
      // tool via CONTEXT_FILE_PENDING_CACHE_KEY.
      let currentContent: string;
      const pending = context.peekPendingFile?.(CONTEXT_FILE_PENDING_CACHE_KEY);
      if (pending !== undefined) {
        currentContent = pending;
      } else {
        const reader = context.readProjectFile ?? ((p) => fs.readFile(p, 'utf-8'));
        try {
          currentContent = await reader(targetPath);
        } catch (error) {
          return `Could not read the project context file for editing: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      const firstIndex = currentContent.indexOf(oldString);
      if (firstIndex === -1) {
        return 'old_string not found in the project context file. Read the file first and copy exact text including whitespace.';
      }
      const secondIndex = currentContent.indexOf(oldString, firstIndex + 1);
      if (secondIndex !== -1) {
        return 'old_string appears multiple times in the project context file. Include more surrounding context to make the match unique.';
      }

      const newContent =
        currentContent.slice(0, firstIndex) + newString + currentContent.slice(firstIndex + oldString.length);
      permLog(`[Permissions] Context file Edit intercepted - capturing for approval (${newContent.length} chars)`);
      context.onContextFileEdit(context.projectId, newContent);
      return 'Project context file update captured by KPM.';
    }
  }

  // Rule 0.5: Intercept project file writes for user approval
  // IMPORTANT: Bash path extraction is heuristic and can miss secondary paths
  // in compound commands. Never auto-allow Bash based on extracted path.
  if (targetPath && toolName !== 'Bash' && toolName !== 'NotebookEdit' && isWithinDirectory(targetPath, context.projectPath)) {
    if (toolName === 'Write' && context.onProjectFileWrite && typeof input.content === 'string') {
      // Compute relative path from project folder
      const relativePath = relative(normalize(context.projectPath), normalize(targetPath));
      permLog(`[Permissions] Project file Write intercepted - capturing for approval: ${relativePath}`);
      context.onProjectFileWrite(context.projectId, relativePath, input.content);
      return 'File update captured by KPM.';
    }
    // Edit tool on project files: read the file, apply old_string -> new_string
    // ourselves, and route the full new content through onProjectFileWrite so
    // it lands in the same approval queue as Write. Avoids relying on Claude
    // following a prose hint to use propose_document_edit.
    if (toolName === 'Edit' && context.onProjectFileWrite) {
      const relativePath = relative(normalize(context.projectPath), normalize(targetPath));
      const oldString = typeof input.old_string === 'string' ? input.old_string : null;
      const newString = typeof input.new_string === 'string' ? input.new_string : null;

      if (!oldString || newString === null) {
        return 'Edit requires old_string and new_string. Pass exact text from the file (whitespace-sensitive).';
      }
      if (oldString === newString) {
        return 'old_string and new_string are identical. No change would be made.';
      }

      // Prefer pending content from earlier edits this turn so multiple edits
      // to the same file accumulate. The interception denies the write, so
      // disk never reflects prior edits — reading it would silently drop them.
      let currentContent: string;
      const pending = context.peekPendingFile?.(relativePath);
      if (pending !== undefined) {
        currentContent = pending;
      } else {
        const reader = context.readProjectFile ?? ((p) => fs.readFile(p, 'utf-8'));
        try {
          currentContent = await reader(targetPath);
        } catch (error) {
          return `Could not read "${relativePath}" for editing: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      const firstIndex = currentContent.indexOf(oldString);
      if (firstIndex === -1) {
        return `old_string not found in "${relativePath}". Read the file first and copy exact text including whitespace.`;
      }
      const secondIndex = currentContent.indexOf(oldString, firstIndex + 1);
      if (secondIndex !== -1) {
        return `old_string appears multiple times in "${relativePath}". Include more surrounding context to make the match unique.`;
      }

      const newContent =
        currentContent.slice(0, firstIndex) + newString + currentContent.slice(firstIndex + oldString.length);
      permLog(`[Permissions] Project file Edit intercepted - capturing for approval: ${relativePath}`);
      context.onProjectFileWrite(context.projectId, relativePath, newContent);
      return 'File update captured by KPM.';
    }
  }

  const toolServerName = toolName.startsWith('mcp__') ? extractMcpServerName(toolName) : null;
  const disabledServer = toolServerName
    ? context.disabledMcpServerNames?.find(serverName => mcpServerNamesMatch(serverName, toolServerName))
    : undefined;
  if (disabledServer) return `The ${disabledServer} MCP server is disabled in KPM settings.`;

  return null;
}

/**
 * Runs `evaluateKpmToolCall` as a PreToolUse hook. Hooks fire in every
 * permission mode, including bypassPermissions where `canUseTool` is never
 * called, so document capture and disabled servers hold whatever mode the
 * user runs Claude Code in.
 *
 * KPM's own tools are allowed here. Claude Code otherwise asks before every
 * MCP call in default mode, read-only ones included, and an action run has no
 * chat to ask in. They only propose changes, and the publishing tools ask for
 * their own grant.
 */
export function createKpmToolHook(context: PermissionContext): HookCallbackMatcher {
  return {
    hooks: [async (hookInput) => {
      if (hookInput.hook_event_name !== 'PreToolUse') return { continue: true };
      const toolInput = (hookInput.tool_input ?? {}) as Record<string, unknown>;
      const denial = await evaluateKpmToolCall(context, hookInput.tool_name, toolInput);
      if (!denial) {
        if (!hookInput.tool_name.startsWith(KPM_TOOL_PREFIX)) return { continue: true };
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
      }
      permLog(`[Permissions] ${hookInput.tool_name} handled by KPM: ${denial}`);
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denial,
        },
      };
    }],
  };
}

/**
 * Claude Code only calls this for a tool its permission settings say to ask
 * about, so the user answers each one, as they would in the Claude Code CLI.
 * A run with no chat (an action run) has nowhere to ask and is denied.
 */
export function createPermissionPrompt(context: PermissionContext, promptUser: PromptUserFn): CanUseTool {
  return async (toolName, input, options) => {
    if (!context.chatSessionId) {
      return {
        behavior: 'deny',
        message: `Your Claude Code permission settings ask before ${toolName}, and this background run has no chat to ask in. Do not retry; report what you would have done instead.`,
      };
    }
    const result = await promptUser(toolName, input, {
      signal: options.signal,
      title: options.title,
      chatSessionId: context.chatSessionId,
      kind: 'elicitation',
    });
    return result.behavior === 'allow' ? { behavior: 'allow', updatedInput: input } : result;
  };
}

/**
 * Export for testing/debugging.
 */
export { extractPath, isWithinDirectory, getToolPreview };
