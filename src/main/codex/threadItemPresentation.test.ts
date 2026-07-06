import { describe, expect, it } from 'vitest';
import type { McpToolCallItem, ThreadItem, TodoListItem } from '@openai/codex-sdk';
import {
  summarizeThreadItem,
  threadItemErrorMessage,
  todoListProgress,
  truncateCodexText,
} from './threadItemPresentation';

describe('truncateCodexText', () => {
  it('collapses whitespace and trims', () => {
    expect(truncateCodexText('  npm   run\n  test  ')).toBe('npm run test');
  });

  it('truncates long text to the limit with an ellipsis', () => {
    const result = truncateCodexText('a'.repeat(200));
    expect(result).toHaveLength(120);
    expect(result.endsWith('...')).toBe(true);
  });

  it('honours a custom limit', () => {
    expect(truncateCodexText('abcdefghij', 8)).toBe('abcde...');
  });
});

describe('summarizeThreadItem', () => {
  it('summarizes command executions as Run <command>', () => {
    const item: ThreadItem = {
      id: 'cmd-1',
      type: 'command_execution',
      command: 'npm test',
      aggregated_output: '',
      status: 'completed',
    };
    expect(summarizeThreadItem(item)).toBe('Run npm test');
  });

  it('falls back to a placeholder for an empty command', () => {
    const item: ThreadItem = {
      id: 'cmd-2',
      type: 'command_execution',
      command: '',
      aggregated_output: '',
      status: 'completed',
    };
    expect(summarizeThreadItem(item)).toBe('Run command');
  });

  it('summarizes MCP tool calls as Tool <server>.<tool>', () => {
    const item: ThreadItem = {
      id: 'mcp-1',
      type: 'mcp_tool_call',
      server: 'kpm',
      tool: 'get_plan',
      arguments: {},
      status: 'completed',
    };
    expect(summarizeThreadItem(item)).toBe('Tool kpm.get_plan');
  });

  it('summarizes web searches as Search <query>', () => {
    const item: ThreadItem = { id: 'ws-1', type: 'web_search', query: 'electron ipc' };
    expect(summarizeThreadItem(item)).toBe('Search electron ipc');
  });

  it('summarizes a single file change as <kind> <path>', () => {
    const item: ThreadItem = {
      id: 'fc-1',
      type: 'file_change',
      changes: [{ path: 'src/a.ts', kind: 'update' }],
      status: 'completed',
    };
    expect(summarizeThreadItem(item)).toBe('update src/a.ts');
  });

  it('summarizes multiple file changes by count', () => {
    const item: ThreadItem = {
      id: 'fc-2',
      type: 'file_change',
      changes: [
        { path: 'src/a.ts', kind: 'update' },
        { path: 'src/b.ts', kind: 'add' },
      ],
      status: 'completed',
    };
    expect(summarizeThreadItem(item)).toBe('2 file changes');
  });

  it('summarizes todo lists as Checklist <completed>/<total>', () => {
    const item: ThreadItem = {
      id: 'todo-1',
      type: 'todo_list',
      items: [
        { text: 'one', completed: true },
        { text: 'two', completed: false },
        { text: 'three', completed: true },
      ],
    };
    expect(summarizeThreadItem(item)).toBe('Checklist 2/3');
  });

  it('summarizes error items with the truncated message', () => {
    const item: ThreadItem = { id: 'err-1', type: 'error', message: 'something  broke' };
    expect(summarizeThreadItem(item)).toBe('something broke');
  });

  it('summarizes agent messages with the truncated text', () => {
    const item: ThreadItem = { id: 'msg-1', type: 'agent_message', text: 'All done here.' };
    expect(summarizeThreadItem(item)).toBe('All done here.');
  });

  it('falls back to the item type for reasoning items', () => {
    const item: ThreadItem = { id: 'r-1', type: 'reasoning', text: 'hmm' };
    expect(summarizeThreadItem(item)).toBe('reasoning');
  });
});

describe('threadItemErrorMessage', () => {
  it('returns the message for error items', () => {
    expect(threadItemErrorMessage({ id: 'e', type: 'error', message: 'boom' })).toBe('boom');
  });

  it('returns the error message for failed MCP tool calls', () => {
    const item: McpToolCallItem = {
      id: 'mcp-err',
      type: 'mcp_tool_call',
      server: 'kpm',
      tool: 'get_plan',
      arguments: {},
      error: { message: 'timed out' },
      status: 'failed',
    };
    expect(threadItemErrorMessage(item)).toBe('timed out');
  });

  it('returns null for items without an error', () => {
    expect(threadItemErrorMessage({ id: 'm', type: 'agent_message', text: 'hi' })).toBeNull();
  });
});

describe('todoListProgress', () => {
  it('counts completed and total todos', () => {
    const item: TodoListItem = {
      id: 'todo-2',
      type: 'todo_list',
      items: [
        { text: 'one', completed: true },
        { text: 'two', completed: false },
      ],
    };
    expect(todoListProgress(item)).toEqual({ completed: 1, total: 2 });
  });
});
