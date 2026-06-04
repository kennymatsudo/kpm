/**
 * Permission control for Claude SDK tool usage.
 *
 * Implements fine-grained permission rules:
 * - Auto-allow: All tools in project directory, read tools anywhere, MCP tools
 * - Prompt: Write tools outside project directory (Edit, Write, Bash)
 * - Session cache: "Allow Always" decisions persist per session (via clientManager)
 */

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { promises as fs } from 'fs';
import { normalize, relative, resolve } from 'path';
import { isContextFile } from '../../shared/contextFile';
import { clientManager } from './clientManager';
const READ_TOOLS = ['Read', 'Grep', 'Glob'];
const WRITE_TOOLS = ['Edit', 'Write', 'Bash'];

/**
 */
}

/** Function to prompt user for permission */
export type PromptUserFn = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal?: AbortSignal;
    title?: string;
    displayName?: string;
    description?: string;
  }
) => Promise<PermissionResult>;

/** Callback for intercepted CLAUDE.md edits */
export type ClaudeMdInterceptFn = (
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
  /** Connected repository paths (read-only, writes are denied) */
  repoPaths?: string[];
  /** Optional callback to intercept CLAUDE.md edits */
  onClaudeMdEdit?: ClaudeMdInterceptFn;
  /** Optional callback to intercept project file writes for approval */
  onProjectFileWrite?: ProjectFileInterceptFn;
  /**
   * Reads a file from disk so Edit-tool interception can compute the post-edit
   * content. Defaults to fs.readFile; tests inject a fake.
   */
  readProjectFile?: (absolutePath: string) => Promise<string>;
  /**
   * Returns proposed-but-unapproved content for a project-relative path from the
   * current turn's pending cache, or undefined when nothing is pending. Lets
   * successive Edit/Write calls to the same file accumulate instead of each
   * computing against stale on-disk content (interception denies the write, so
   * disk never reflects earlier edits in the turn).
   */
  peekPendingFile?: (relativeFilePath: string) => string | undefined;
  /** External MCP servers disabled in KPM settings. */
  disabledMcpServerNames?: string[];
  /** When true, skip permission prompts and auto-allow all non-denied tool calls */
  autoApprove?: boolean;
}

/**
 * Extract target path from tool input.
 * Returns null if tool doesn't operate on a specific path.
 */
function extractPath(toolName: string, input: Record<string, unknown>): string | null {
  // File operation tools
  if (toolName === 'Read' || toolName === 'Edit' || toolName === 'Write') {
    return typeof input.file_path === 'string' ? input.file_path : null;
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
function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

function resolvePathForScope(targetPath: string, projectPath: string): string {
  const trimmedPath = targetPath.trim();
  if (!trimmedPath || trimmedPath.startsWith('~')) {
    return normalize(trimmedPath);
  }
  return isAbsolutePath(trimmedPath) ? normalize(trimmedPath) : resolve(projectPath, trimmedPath);
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
 * Rules:
 * -1. Deny: Git write operations (commit, push, merge, etc.) — always blocked
 * 0. Intercept: Context file (AGENTS.md/CLAUDE.md) edits are captured and sent for user approval
 * 1. Auto-allow: All other tools in project directory
 * 2. Auto-allow: Read tools anywhere
 * 3. Auto-allow: MCP tools (read-only)
 * 4. Check session cache for "Allow Always" decisions
 * 5. Prompt: Write tools outside project directory
 */
export function createPermissionHandler(
  context: PermissionContext,
  promptUser: PromptUserFn
): CanUseTool {
  return async (toolName, input, options) => {
    // Debug logging for MCP tools
    if (toolName.startsWith('mcp__kpm__')) {
      console.log(`[Permissions] ========== MCP TOOL PERMISSION CHECK ==========`);
      console.log(`[Permissions] Tool: ${toolName}`);
      console.log(`[Permissions] Input keys: ${Object.keys(input).join(', ')}`);
      console.log(`[Permissions] Input: ${JSON.stringify(input).slice(0, 500)}`);
    }

    }

    const targetPath = extractPath(toolName, input);

    // Debug logging for Write/Edit tools targeting files
    if ((toolName === 'Write' || toolName === 'Edit') && targetPath) {
      console.log(`[Permissions] ${toolName} tool called for: ${targetPath}`);
    }

    // Rule 0: Intercept project context file edits (AGENTS.md / CLAUDE.md) for user approval
    if (targetPath && isContextFilePath(targetPath, context.projectPath)) {
      if ((toolName === 'Write' || toolName === 'Edit') && context.onClaudeMdEdit) {
        // Extract content from Write/Edit tool input
        let newContent: string | null = null;

        if (toolName === 'Write' && typeof input.content === 'string') {
          newContent = input.content;
        } else if (toolName === 'Edit') {
          // For Edit tool, we need the new_string content
          // However, Edit is a partial replacement - we should encourage Write for full content
          // For now, log and deny, guiding Claude to use a different approach
          console.log('[Permissions] Context file Edit intercepted - guiding to use tool');
          return {
            behavior: 'deny',
            message: 'Project context file edits must use KPM change handling. Use the propose_context_edit tool.'
          };
        }

        if (newContent) {
          console.log(`[Permissions] Context file Write intercepted - capturing for approval (${newContent.length} chars)`);
          context.onClaudeMdEdit(context.projectId, newContent);
          return {
            behavior: 'deny',
            message: 'Project context file update captured by KPM.'
          };
        }
      }
    }

    // Rule 0.5: Intercept project file writes for user approval
    // IMPORTANT: Bash path extraction is heuristic and can miss secondary paths
    // in compound commands. Never auto-allow Bash based on extracted path.
    if (targetPath && toolName !== 'Bash' && isWithinDirectory(targetPath, context.projectPath)) {
      if (toolName === 'Write' && context.onProjectFileWrite && typeof input.content === 'string') {
        // Compute relative path from project folder
        const relativePath = relative(normalize(context.projectPath), normalize(targetPath));
        console.log(`[Permissions] Project file Write intercepted - capturing for approval: ${relativePath}`);
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
        console.log(`[Permissions] Project file Edit intercepted - capturing for approval: ${relativePath}`);
        context.onProjectFileWrite(context.projectId, relativePath, newContent);
        return {
          behavior: 'deny',
          message: 'File update captured by KPM.',
        };
      }
      // Allow other tools (Read, Grep, etc.) in project directory
      return { behavior: 'allow', updatedInput: input };
    }

    if (READ_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 3: KPM MCP tools always allowed (read-only, approval-gated by tool implementation)
    if (toolName.startsWith('mcp__kpm__')) {
      console.log(`[Permissions] MCP tool auto-allowed: ${toolName}`);
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 3.5: External MCP tools (e.g., Slack, GitHub) — prompt user
    // These are from claude.ai managed servers or user-loaded plugins
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

      const mcpCacheKey = `${toolName}:mcp-external`;
      if (context.autoApprove || clientManager.hasPermissionCached(context.projectId, mcpCacheKey)) {
        return { behavior: 'allow', updatedInput: input };
      }
      if (clientManager.hasAllowAllRemaining(context.projectId)) {
        console.log(`[Permissions] Auto-allowing external MCP ${toolName} (Allow All Remaining active)`);
        return { behavior: 'allow', updatedInput: input };
      }
      console.log(`[Permissions] External MCP tool requires approval: ${toolName}`);
      const result = await promptUser(toolName, input, options);
      if (result.behavior === 'allow' && 'allowAlways' in result && result.allowAlways) {
        clientManager.cachePermission(context.projectId, mcpCacheKey);
      }
      return result;
    }

    // Rule 4: Check "Allow Always" cache (stored in clientManager)
    const cacheKey = `${toolName}:${targetPath || 'no-path'}`;
    if (clientManager.hasPermissionCached(context.projectId, cacheKey)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 4.5: Check "Allow All Remaining" flag (batch approval for current response)
    if (clientManager.hasAllowAllRemaining(context.projectId)) {
      console.log(`[Permissions] Auto-allowing ${toolName} (Allow All Remaining active)`);
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 5: Prompt for writes outside project directory
    if (WRITE_TOOLS.includes(toolName)) {
      if (context.autoApprove) {
        console.log(`[Permissions] Auto-allowing ${toolName} (autoApprove active)`);
        return { behavior: 'allow', updatedInput: input };
      }
      const result = await promptUser(toolName, input, options);

      // If "Allow Always" was selected, cache it via clientManager
      if (result.behavior === 'allow' && 'allowAlways' in result && result.allowAlways) {
        clientManager.cachePermission(context.projectId, cacheKey);
      }

      return result;
    }

    // Default: allow (with logging for debugging)
    console.log(`[Permissions] Auto-allowing ${toolName} (no rule matched)`);
    return { behavior: 'allow', updatedInput: input };
  };
}

/**
 * Clear session cache when new session starts.
 * Called from chat:new-session handler.
 */
export function clearSessionCache(projectId: string): void {
  clientManager.clearPermissionCache(projectId);
}

/**
 * Export for testing/debugging.
 */
