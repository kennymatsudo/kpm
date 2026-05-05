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

    if (subagentType.startsWith('codex:')) {
      const codexAgent = subagentType.slice('codex:'.length).replace(/[-_]/g, ' ');
      if (log) console.log(`[Claude]    Delegating to Codex: ${codexAgent}`);
      return {
        id,
        type: 'other' as ActivityType,
        label: 'Delegating to Codex',
        detail: codexAgent && detail
          ? `${codexAgent}: ${detail}`
          : codexAgent || detail,
      };
    }

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

  // KPM MCP tools
  if (toolName.startsWith('mcp__kpm__')) {
    const mcpToolName = toolName.replace('mcp__kpm__', '');
    if (log) console.log(`[Claude]    Tool: ${toolName}`);
    return { id, type: 'other' as ActivityType, label: mcpToolName };
  }

  // Non-KPM MCP tools (e.g. mcp__server__tool_name)
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

/** Patch hunk shape exported by the SDK for FileEditOutput / FileWriteOutput. */
interface StructuredPatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * Extract diff stats and inline hunk lines from an SDK tool_use_result for
 * Edit/Write tools. Returns null when the result lacks any diff info we can
 * use (non-edit tool, or unexpected shape).
 *
 * Prefers `gitDiff` line counts (computed by git) and falls back to
 * `structuredPatch` hunk math when the file isn't tracked.
 */
export function extractDiffFromToolResult(
  toolResult: unknown,
): { additions: number; deletions: number; hunks: string[] } | null {
  if (!toolResult || typeof toolResult !== 'object') return null;
  const result = toolResult as Record<string, unknown>;

  // gitDiff is preferred — pre-computed line counts from git itself
  const gitDiff = result.gitDiff as { additions?: unknown; deletions?: unknown } | undefined;
  let additions: number | null = null;
  let deletions: number | null = null;
  if (gitDiff && typeof gitDiff === 'object') {
    if (typeof gitDiff.additions === 'number') additions = gitDiff.additions;
    if (typeof gitDiff.deletions === 'number') deletions = gitDiff.deletions;
  }

  // structuredPatch carries the actual `+`/`-` lines and is our fallback
  // for line counts when gitDiff isn't available.
  const patches = Array.isArray(result.structuredPatch)
    ? (result.structuredPatch as StructuredPatchHunk[])
    : [];

  const hunks: string[] = [];
  for (const hunk of patches) {
    if (!hunk || !Array.isArray(hunk.lines)) continue;
    hunks.push(...hunk.lines);
  }

  if (additions === null || deletions === null) {
    let plus = 0;
    let minus = 0;
    for (const line of hunks) {
      if (line.startsWith('+')) plus++;
      else if (line.startsWith('-')) minus++;
    }
    additions = additions ?? plus;
    deletions = deletions ?? minus;
  }

  if (additions === 0 && deletions === 0 && hunks.length === 0) return null;

  return { additions, deletions, hunks };
}
