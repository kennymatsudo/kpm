/**
 * Tool activity tracking for Claude SDK.
 *
 * Generates structured activity data for UI display when Claude uses tools.
 * Used by main chat sessions.
 */

import { randomUUID } from 'crypto';
import { isContextFile } from '../../shared/contextFile';
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

  // Check if Claude is updating the project context file
  if ((toolName === 'Edit' || toolName === 'Write') && typeof input.file_path === 'string') {
    const filePath = input.file_path;
    const filename = filePath.split('/').pop() ?? filePath;
    if (isContextFile(filename)) {
      if (log) console.log(`[Claude]    Updating project context file`);
      return { id, type: 'edit' as ActivityType, label: 'Project Context', detail: 'Updating learnings' };
    }
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

  if (toolName === 'ToolSearch' && typeof input.query === 'string') {
    if (log) console.log(`[Claude]    ToolSearch: ${input.query}`);
    return { id, type: 'search' as ActivityType, label: input.query };
  }

  if (toolName === 'Task') {
    const subagentType = typeof input.subagent_type === 'string' ? input.subagent_type : 'agent';
    const detail = typeof input.description === 'string'
      ? input.description
      : typeof input.prompt === 'string'
        ? input.prompt.slice(0, 120)
        : undefined;
    if (log) console.log(`[Claude]    Task: ${subagentType}`);
    return { id, type: 'other' as ActivityType, label: subagentType, detail };
  }

  if (toolName === 'WebSearch' && typeof input.query === 'string') {
    if (log) console.log(`[Claude]    WebSearch: ${input.query}`);
    return { id, type: 'search' as ActivityType, label: input.query };
  }

  if (toolName === 'WebFetch' && typeof input.url === 'string') {
    let domain: string;
    try {
      domain = new URL(input.url).hostname;
    } catch {
      domain = input.url;
    }
    const detail = typeof input.prompt === 'string' ? input.prompt.slice(0, 120) : undefined;
    if (log) console.log(`[Claude]    WebFetch: ${domain}`);
    return { id, type: 'other' as ActivityType, label: domain, detail };
  }

  if (toolName.startsWith('mcp__kpm__')) {
    const mcpToolName = toolName.replace('mcp__kpm__', '');
    if (log) console.log(`[Claude]    Tool: ${toolName}`);
    return { id, type: 'other' as ActivityType, label: mcpToolName };
  }

  const mcpPattern = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/;
  const mcpMatch = mcpPattern.exec(toolName);
  if (mcpMatch) {
    const mcpToolLabel = mcpMatch[2].replace(/_/g, ' ');
    const detail = Object.keys(input).length > 0
      ? Object.entries(input)
          .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
          .map(([k, v]) => {
            const val = String(v);
            return `${k}=${val.length > 40 ? val.slice(0, 40) + '...' : val}`;
          })
          .join(', ')
          .slice(0, 120) || undefined
      : undefined;
    if (log) console.log(`[Claude]    MCP: ${toolName}`);
    return { id, type: 'other' as ActivityType, label: mcpToolLabel, detail };
  }

  // Unknown tools
  if (log) console.log(`[Claude]    Tool: ${toolName}`);
  return { id, type: 'other' as ActivityType, label: toolName };
}
