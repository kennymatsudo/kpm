/**
 * Permission control for Claude SDK tool usage.
 *
 * Implements fine-grained permission rules:
 * - Auto-allow: All tools in project directory, read tools anywhere, MCP tools
 * - Prompt: Write tools outside project directory (Edit, Write, Bash)
 * - Session cache: "Allow Always" decisions persist per session (via clientManager)
 */

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { clientManager } from './clientManager';
const READ_TOOLS = ['Read', 'Grep', 'Glob'];
const WRITE_TOOLS = ['Edit', 'Write', 'Bash'];

/** Function to prompt user for permission */
export type PromptUserFn = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionResult>;

/** Context for permission checks */
export interface PermissionContext {
  projectPath: string;
  projectId: string;
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
    // Try to extract file paths from common commands
    // This is a heuristic - we can't perfectly parse all bash commands
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

/**
 * Create permission handler for Claude SDK.
 *
 * Rules:
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

    const targetPath = extractPath(toolName, input);

      return { behavior: 'allow', updatedInput: input };
    }

    if (READ_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    if (toolName.startsWith('mcp__kpm__')) {
      console.log(`[Permissions] MCP tool auto-allowed: ${toolName}`);
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 4: Check "Allow Always" cache (stored in clientManager)
    const cacheKey = `${toolName}:${targetPath || 'no-path'}`;
    if (clientManager.hasPermissionCached(context.projectId, cacheKey)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Rule 5: Prompt for writes outside project directory
    if (WRITE_TOOLS.includes(toolName)) {
      const result = await promptUser(toolName, input, options);

      // If "Allow Always" was selected, cache it via clientManager
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
