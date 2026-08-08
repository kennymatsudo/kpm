import { describe, expect, it, vi } from 'vitest';
import type { ThreadOptions } from '@openai/codex-sdk';
import { CodexSdkAgentSession } from './CodexSdkAgentSession';
import type { AgentEffortLevel } from '../../../shared/types';
import type { AgentActivity } from '../../../shared/agent-types';

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(function Codex() {
    return { startThread: vi.fn() };
  }),
}));

vi.mock('../../codex/binary', () => ({
  findCodexBinaryPath: () => '/tmp/codex',
}));

interface SessionTestHarness {
  lastAssistantMessage: string;
}

function testHarness(session: CodexSdkAgentSession): SessionTestHarness {
  return session as unknown as SessionTestHarness;
}

function makeSession(role: 'implement' | 'review'): CodexSdkAgentSession {
  return new CodexSdkAgentSession({ id: 'test-codex-session', role });
}

describe('CodexSdkAgentSession.getResult', () => {
  it('returns only finalText for an implementation-role session', () => {
    const session = makeSession('implement');
    testHarness(session).lastAssistantMessage = 'Implemented the task.';

    expect(session.getResult()).toEqual({ finalText: 'Implemented the task.' });
  });

  it('parses valid findings JSON from a review-role session', () => {
    const session = makeSession('review');
    testHarness(session).lastAssistantMessage = '{"findings":[{"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}]}';

    expect(session.getResult()).toEqual({
      finalText: '{"findings":[{"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}]}',
      review: {
        findings: [
          {
            severity: 'warning',
            file: 'src/app.ts',
            line: 12,
            description: 'Handle null input.',
            agent: 'codex',
            source: 'agent',
          },
        ],
      },
      reviewRawOutput: '{"findings":[{"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}]}',
    });
  });

  it('classifies malformed review output as an error while keeping the raw text', () => {
    const session = makeSession('review');
    testHarness(session).lastAssistantMessage = 'All done. Looks good.';

    expect(session.getResult()).toEqual({
      finalText: 'All done. Looks good.',
      review: { error: 'Review agent returned output that did not match the required findings JSON schema' },
      reviewRawOutput: 'All done. Looks good.',
    });
  });

  it('classifies missing output as an error for a review-role session', () => {
    const session = makeSession('review');

    expect(session.getResult()).toEqual({
      finalText: null,
      review: { error: 'Review agent completed without findings output' },
      reviewRawOutput: null,
    });
  });
});

describe('CodexSdkAgentSession reasoning effort', () => {
  function threadOptions(effort?: AgentEffortLevel): ThreadOptions {
    const session = new CodexSdkAgentSession({ id: 'test-codex-session', role: 'implement', effort });
    return (session as unknown as { buildThreadOptions: (path: string) => ThreadOptions })
      .buildThreadOptions('/tmp/worktree');
  }

  it('forwards an effort level Codex accepts', () => {
    expect(threadOptions('high').modelReasoningEffort).toBe('high');
  });

  it('clamps max to xhigh, the highest level Codex accepts', () => {
    expect(threadOptions('max').modelReasoningEffort).toBe('xhigh');
  });

  it('omits the field when no effort is configured', () => {
    expect(threadOptions()).not.toHaveProperty('modelReasoningEffort');
  });
});

describe('CodexSdkAgentSession activity kind + call id', () => {
  interface ItemHarness {
    handleItemStarted(item: unknown): void;
    handleItemCompleted(item: unknown): void;
  }

  function itemHarness(session: CodexSdkAgentSession): ItemHarness {
    return session as unknown as ItemHarness;
  }

  it('classifies command_execution as kind "run" and threads the thread item id as callId through start and completion', () => {
    const session = makeSession('implement');
    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

    itemHarness(session).handleItemStarted({
      id: 'item-1', type: 'command_execution', command: 'npm test', aggregated_output: '', status: 'in_progress',
    });
    itemHarness(session).handleItemCompleted({
      id: 'item-1', type: 'command_execution', command: 'npm test', aggregated_output: 'ok', exit_code: 0, status: 'completed',
    });

    expect(activities).toEqual([
      expect.objectContaining({ type: 'tool_use', kind: 'run', callId: 'item-1' }),
      expect.objectContaining({ type: 'tool_result', kind: 'run', callId: 'item-1', status: 'success' }),
    ]);
  });

  it('pairs two parallel command_execution items by item id rather than by name', () => {
    const session = makeSession('implement');
    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

    itemHarness(session).handleItemStarted({ id: 'a', type: 'command_execution', command: 'npm test -- a', aggregated_output: '', status: 'in_progress' });
    itemHarness(session).handleItemStarted({ id: 'b', type: 'command_execution', command: 'npm test -- b', aggregated_output: '', status: 'in_progress' });
    // b finishes first, and it failed.
    itemHarness(session).handleItemCompleted({ id: 'b', type: 'command_execution', command: 'npm test -- b', aggregated_output: '', exit_code: 1, status: 'failed' });
    itemHarness(session).handleItemCompleted({ id: 'a', type: 'command_execution', command: 'npm test -- a', aggregated_output: '', exit_code: 0, status: 'completed' });

    const results = activities.filter((activity) => activity.type === 'tool_result');
    expect(results).toEqual([
      expect.objectContaining({ callId: 'b', status: 'failed' }),
      expect.objectContaining({ callId: 'a', status: 'success' }),
    ]);
  });

  it('classifies file_change as kind "edit"', () => {
    const session = makeSession('implement');
    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

    itemHarness(session).handleItemCompleted({ id: 'patch-1', type: 'file_change', changes: [], status: 'completed' });

    expect(activities).toEqual([
      expect.objectContaining({ type: 'tool_result', kind: 'edit', callId: 'patch-1' }),
    ]);
  });
});
