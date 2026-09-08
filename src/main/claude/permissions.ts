/**
 * Permission control for Claude SDK tool usage.
 *
 * - Deny: reads that resolve into a credential/secret root. Not overridable.
 * - Intercept: project file and context file edits, routed to the approval queue.
 * - Consent: direct writes need the project's write grant, asked once per
 *   project and persisted.
 * - Auto-allow: everything else — reads anywhere, network reads, MCP tools.
 */

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionRequest } from '../../shared/types';
import { promises as fs } from 'fs';
import os from 'os';
import { join, normalize, relative } from 'path';
import { isContextFile, CONTEXT_FILE_PENDING_CACHE_KEY } from '../../shared/contextFile';
import {
  checkRealpathAccess,
  pathCanTraverseDeniedRoot,
} from '../services/files/pathSecurity';
import { shellCommandNeedsWriteGrant } from '../chat/shellWritePolicy';
import { getConfig } from '../config';
import {
  projectWriteGrants,
  type ProjectWriteGrants,
} from '../chat/writeGrants';

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
const READ_TOOLS = ['Read', 'Grep', 'Glob'];
const WRITE_TOOLS = ['Edit', 'MultiEdit', 'Write', 'Bash', 'NotebookEdit'];
const NETWORK_READ_TOOLS = ['WebFetch', 'WebSearch'];

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
  /**
   * The chat session to surface a prompt in. The write grant itself is
   * project-scoped, so a run without a session (an action run) still inherits
   * the project's grant — it just has nowhere to ask if there is none.
  */
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
// realpathSync does not expand a leading ~, so an attacker's `~/.ssh/id_rsa`
// would otherwise never match a denied home-relative root.
function expandHomePath(targetPath: string): string {
  const trimmedPath = targetPath.trim();
  if (trimmedPath === '~') return os.homedir();
  if (trimmedPath.startsWith('~/') || trimmedPath.startsWith('~\\')) {
    return join(os.homedir(), trimmedPath.slice(2));
  }
  return trimmedPath;
}

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
  return toolName;
}

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
 * Create permission handler for Claude SDK.
 *
 * There is one question this handler ever asks the user: may this project
 * write? Everything else it decides on its own.
 *
 * Rules:
 * -1. Git in Bash: read-only invocations are allowed; anything else needs the
 *     project's write grant
 * 0. Intercept: Context file (AGENTS.md/CLAUDE.md) edits are captured and sent for user approval
 * 0.5. Intercept: Project file writes are captured and sent for user approval
 * 1. Gate: every remaining write tool needs the project's write grant
 * 1.5. Deny: Reads that resolve into a credential/secret root
 * 2. Auto-allow: Read tools anywhere; network reads (WebFetch/WebSearch)
 * 3. Auto-allow: MCP tools, except servers disabled in settings
 * 4. Auto-allow: anything else
 */
export function createPermissionHandler(
  context: PermissionContext,
  promptUser: PromptUserFn,
  writeGrants: ProjectWriteGrants = projectWriteGrants,
): CanUseTool {
  return async (toolName, input, options) => {
    // Debug logging for MCP tools
    if (toolName.startsWith('mcp__kpm__')) {
      permLog(`[Permissions] ========== MCP TOOL PERMISSION CHECK ==========`);
      permLog(`[Permissions] Tool: ${toolName}`);
      permLog(`[Permissions] Input keys: ${Object.keys(input).join(', ')}`);
      permLog(`[Permissions] Input: ${JSON.stringify(input).slice(0, 500)}`);
    }

    const gateWrites = async (): Promise<PermissionResult> => {
      const decision = await writeGrants.request(context.projectId, async () => {
        permLog(`[Permissions] Requesting write access for project ${context.projectId}`);
        const result = await promptUser(toolName, input, {
          signal: options.signal,
          title: options.title,
          chatSessionId: context.chatSessionId,
          kind: 'write-access',
        });
        return result.behavior === 'allow';
      });

      if (!decision.allowed) return { behavior: 'deny', message: decision.reason };
      return { behavior: 'allow', updatedInput: input };
    };

    if (toolName === 'Bash' && typeof input.command === 'string') {
      if (!shellCommandNeedsWriteGrant(input.command)) {
        return { behavior: 'allow', updatedInput: input };
      }
      return gateWrites();
    }

    const targetPath = extractPath(toolName, input);

    // Debug logging for Write/Edit tools targeting files
    if ((toolName === 'Write' || toolName === 'Edit') && targetPath) {
      permLog(`[Permissions] ${toolName} tool called for: ${targetPath}`);
    }

    const traversesDirectories = toolName === 'Grep' || toolName === 'Glob';
    const pathToCheck = targetPath ?? (traversesDirectories ? context.projectPath : null);
    if (pathToCheck && [...READ_TOOLS, ...WRITE_TOOLS].includes(toolName)) {
      const expandedPath = expandHomePath(pathToCheck);
      const access = await checkRealpathAccess(expandedPath, context.projectPath);
      if (!access.allowed) {
        return {
          behavior: 'deny',
          message: access.reason ?? 'Access denied: path resolves inside a protected credential location.',
        };
      }
      if (traversesDirectories && await pathCanTraverseDeniedRoot(expandedPath, context.projectPath)) {
        return {
          behavior: 'deny',
          message: 'Access denied: recursive search would traverse a protected credential location.',
        };
      }
    }

    // Rule 0: Intercept project context file edits (AGENTS.md / CLAUDE.md) for user approval
    if (targetPath && isContextFilePath(targetPath, context.projectPath)) {
      if (toolName === 'Write' && context.onContextFileEdit && typeof input.content === 'string') {
        const newContent = input.content;
        permLog(`[Permissions] Context file Write intercepted - capturing for approval (${newContent.length} chars)`);
        context.onContextFileEdit(context.projectId, newContent);
        return {
          behavior: 'deny',
          message: 'Project context file update captured by KPM.',
        };
      }
      // Edit tool on the context file: read the file, apply old_string ->
      // new_string ourselves, and route the full new content through
      // onContextFileEdit so it lands in the same approval flow as Write.
      // Mirrors Rule 0.5's Edit interception for regular project files.
      if (toolName === 'Edit' && context.onContextFileEdit) {
        const oldString = typeof input.old_string === 'string' ? input.old_string : null;
        const newString = typeof input.new_string === 'string' ? input.new_string : null;

        if (!oldString || newString === null) {
          return {
            behavior: 'deny',
            message: 'Edit requires old_string and new_string. Pass exact text from the file (whitespace-sensitive).',
          };
        }
        if (oldString === newString) {
          return {
            behavior: 'deny',
            message: 'old_string and new_string are identical. No change would be made.',
          };
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
            return {
              behavior: 'deny',
              message: `Could not read the project context file for editing: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        }

        const firstIndex = currentContent.indexOf(oldString);
        if (firstIndex === -1) {
          return {
            behavior: 'deny',
            message: 'old_string not found in the project context file. Read the file first and copy exact text including whitespace.',
          };
        }
        const secondIndex = currentContent.indexOf(oldString, firstIndex + 1);
        if (secondIndex !== -1) {
          return {
            behavior: 'deny',
            message: 'old_string appears multiple times in the project context file. Include more surrounding context to make the match unique.',
          };
        }

        const newContent =
          currentContent.slice(0, firstIndex) + newString + currentContent.slice(firstIndex + oldString.length);
        permLog(`[Permissions] Context file Edit intercepted - capturing for approval (${newContent.length} chars)`);
        context.onContextFileEdit(context.projectId, newContent);
        return {
          behavior: 'deny',
          message: 'Project context file update captured by KPM.',
        };
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
        return {
          behavior: 'deny',
          message: 'File update captured by KPM.',
        };
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
          return {
            behavior: 'deny',
            message: 'Edit requires old_string and new_string. Pass exact text from the file (whitespace-sensitive).',
          };
        }
        if (oldString === newString) {
          return {
            behavior: 'deny',
            message: 'old_string and new_string are identical. No change would be made.',
          };
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
            return {
              behavior: 'deny',
              message: `Could not read "${relativePath}" for editing: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        }

        const firstIndex = currentContent.indexOf(oldString);
        if (firstIndex === -1) {
          return {
            behavior: 'deny',
            message: `old_string not found in "${relativePath}". Read the file first and copy exact text including whitespace.`,
          };
        }
        const secondIndex = currentContent.indexOf(oldString, firstIndex + 1);
        if (secondIndex !== -1) {
          return {
            behavior: 'deny',
            message: `old_string appears multiple times in "${relativePath}". Include more surrounding context to make the match unique.`,
          };
        }

        const newContent =
          currentContent.slice(0, firstIndex) + newString + currentContent.slice(firstIndex + oldString.length);
        permLog(`[Permissions] Project file Edit intercepted - capturing for approval: ${relativePath}`);
        context.onProjectFileWrite(context.projectId, relativePath, newContent);
        return {
          behavior: 'deny',
          message: 'File update captured by KPM.',
        };
      }
      if (!WRITE_TOOLS.includes(toolName)) {
        return { behavior: 'allow', updatedInput: input };
      }
    }

    if (WRITE_TOOLS.includes(toolName)) {
      return gateWrites();
    }

    // Rule 2: Read tools (Read/Grep/Glob) are allowed anywhere on disk.
    // Reads can't mutate state, so chat isn't confined to the project folder or
    // connected repos for reading — the user can point it at any folder.
    if (READ_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Network read tools (WebFetch/WebSearch) are legitimate discovery
    // capability and cannot mutate local state. The read denylist above closes
    // credential exfiltration, so these stay frictionless.
    if (NETWORK_READ_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 3: KPM MCP tools always allowed (read-only, approval-gated by tool implementation)
    if (toolName.startsWith('mcp__kpm__')) {
      permLog(`[Permissions] MCP tool auto-allowed: ${toolName}`);
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 3.5: External MCP tools (claude.ai managed servers, user plugins).
    // Allowed unless the user turned the server off in settings — the read
    // deny-list and the write grant already cover what these can reach.
    if (toolName.startsWith('mcp__')) {
      const toolServerName = extractMcpServerName(toolName);
      const disabledServer = toolServerName
        ? context.disabledMcpServerNames?.find(serverName => mcpServerNamesMatch(serverName, toolServerName))
        : undefined;
      if (disabledServer) {
        return {
          behavior: 'deny',
          message: `The ${disabledServer} MCP server is disabled in KPM settings.`,
        };
      }
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 4: anything unrecognized. Writes were gated above and credential
    // paths denied above, so what reaches here cannot touch either.
    permLog(`[Permissions] Allowing unrecognized tool: ${toolName}`);
    return { behavior: 'allow', updatedInput: input };
  };
}

/**
 * Export for testing/debugging.
 */
export { extractPath, isWithinDirectory, getToolPreview };
