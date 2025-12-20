/**
 * Tool activity tracking for Claude SDK.
 *
 * Generates structured activity data for UI display when Claude uses tools.
 */

import { randomUUID } from 'crypto';
import type { Activity, ActivityType } from '../../shared/types';

export interface ToolActivityOptions {
  /** Whether to log tool usage to console. Default: false */
  log?: boolean;
}

/**
 * Generate structured activity data for a tool use event.
 * Returns Activity object for UI display, or null if no activity should be shown.
 */
export function getToolActivity(
  toolName: string,
  input: Record<string, unknown>,
  options: ToolActivityOptions = {}
): Activity | null {
  const { log = false } = options;
  const id = randomUUID();

  if ((toolName === 'Edit' || toolName === 'Write') && typeof input.file_path === 'string') {
    const filePath = input.file_path;
    const filename = filePath.split('/').pop() ?? filePath;
    if (log) console.log(`[Claude]    Editing: ${filePath}`);
    return { id, type: 'edit' as ActivityType, label: filename, detail: filePath };
  }

  if (toolName === 'Read' && typeof input.file_path === 'string') {
    const filePath = input.file_path;
    const filename = filePath.split('/').pop() ?? filePath;
    if (log) console.log(`[Claude]    Reading: ${filePath}`);
    return { id, type: 'read' as ActivityType, label: filename, detail: filePath };
  }

  if (toolName === 'Grep' && typeof input.pattern === 'string') {
    const pattern = input.pattern;
    const path = typeof input.path === 'string' ? input.path : 'cwd';
    // Extract repo name from path for cleaner label
    const repoName = path.split('/').pop() ?? path;
    if (log) console.log(`[Claude]    Searching: "${pattern}" in ${path}`);
    return { id, type: 'search' as ActivityType, label: repoName, detail: pattern };
  }

  if (toolName === 'Glob' && typeof input.pattern === 'string') {
    const pattern = input.pattern;
    if (log) console.log(`[Claude]    Globbing: ${pattern}`);
    return { id, type: 'glob' as ActivityType, label: pattern };
  }

  if (toolName === 'Bash' && typeof input.command === 'string') {
    const command = input.command;
    const firstWord = command.split(' ')[0];
    if (log) console.log(`[Claude]    Command: ${command}`);
    return { id, type: 'command' as ActivityType, label: firstWord, detail: command };
  }

  if (toolName.startsWith('mcp__kpm__')) {
    const mcpToolName = toolName.replace('mcp__kpm__', '');
    if (log) console.log(`[Claude]    Tool: ${toolName}`);
    return { id, type: 'other' as ActivityType, label: mcpToolName };
  }

  // Unknown tools
  if (log) console.log(`[Claude]    Tool: ${toolName}`);
  return { id, type: 'other' as ActivityType, label: toolName };
}
