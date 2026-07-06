/**
 * Shared presentation of Codex SDK ThreadItems. Both Codex surfaces — the
 * board agent session and the chat session — translate the same vendor
 * taxonomy into user-facing text; this module is the single owner of that
 * translation so an SDK item-type change lands in one place.
 */

import type { McpToolCallItem, ThreadItem, TodoListItem } from '@openai/codex-sdk';

export function truncateCodexText(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

export function summarizeMcpToolCall(item: McpToolCallItem): string {
  return `Tool ${item.server}.${item.tool}`;
}

export function todoListProgress(item: TodoListItem): { completed: number; total: number } {
  return {
    completed: item.items.filter((todo) => todo.completed).length,
    total: item.items.length,
  };
}

export function summarizeThreadItem(item: ThreadItem): string {
  switch (item.type) {
    case 'command_execution':
      return `Run ${truncateCodexText(item.command || 'command')}`;
    case 'mcp_tool_call':
      return summarizeMcpToolCall(item);
    case 'web_search':
      return `Search ${truncateCodexText(item.query)}`;
    case 'file_change': {
      const first = item.changes[0];
      return first && item.changes.length === 1
        ? `${first.kind} ${first.path}`
        : `${item.changes.length} file changes`;
    }
    case 'todo_list': {
      const { completed, total } = todoListProgress(item);
      return `Checklist ${completed}/${total}`;
    }
    case 'error':
      return truncateCodexText(item.message);
    case 'agent_message':
      return truncateCodexText(item.text);
    case 'reasoning':
      return item.type;
  }
}

export function threadItemErrorMessage(item: ThreadItem): string | null {
  if (item.type === 'error') {
    return item.message;
  }
  if (item.type === 'mcp_tool_call' && item.error?.message) {
    return item.error.message;
  }
  return null;
}
