import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeSdkSession } from './ClaudeSdkSession';
import type { AgentActivity, AgentCompletionSummary } from '../../../shared/agent-types';

/**
 * The board Claude session runs each turn as a discrete single-shot `query()`.
 * Completion is the SDK async iterator ending — not a debounce or a state-flag
 * heuristic. To exercise that path without the real SDK we mock `query()` to
 * return a controllable async stream of messages; when the stream ends, the
 * session must complete.
 *
 * Startup-readiness and activity-mapping tests still inject messages through the
 * `processMessage` seam directly, since those behaviors are independent of how
 * the turn loop terminates.
 */
const sdkMock = vi.hoisted(() => ({
  calls: [] as { prompt: unknown; options: Record<string, unknown> }[],
  impl: null as null | ((args: { prompt: unknown; options: Record<string, unknown> }) => AsyncIterable<object>),
}));

// `vi.mock` is hoisted above the imports, so the SUT binds to this mocked
// `query`. Each test sets `sdkMock.impl` to control the message stream.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: { prompt: unknown; options: Record<string, unknown> }) => {
    sdkMock.calls.push(args);
    return sdkMock.impl!(args);
  },
}));

interface SessionTestHarness {
  processMessage(msg: object): void;
  getCompletionSummary: () => Promise<AgentCompletionSummary>;
  setState(state: string): void;
}

function testHarness(session: ClaudeSdkSession): SessionTestHarness {
  return session as unknown as SessionTestHarness;
}

/** Build an async stream that yields the given messages in order, then ends. */
function streamOf(...messages: object[]): AsyncIterable<object> {
  return (async function* () {
    for (const m of messages) {
      yield m;
    }
  })();
}

/** Resolve on the next `onComplete` emission. */
function nextComplete(session: ClaudeSdkSession): Promise<AgentCompletionSummary> {
  return new Promise<AgentCompletionSummary>((resolve) => {
    session.on('onComplete', (summary) => resolve(summary));
  });
}

function makeSession(): ClaudeSdkSession {
  return new ClaudeSdkSession({
    id: 'test-session',
    role: 'implement',
    sdkOptions: { cwd: '/tmp', systemPrompt: 'test' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  sdkMock.calls.length = 0;
  sdkMock.impl = null;
});

describe('ClaudeSdkSession startup readiness', () => {
  it('marks the session working when the SDK init message arrives', () => {
    const session = makeSession();

    const states: string[] = [];
    session.on('onStateChange', (state) => {
      states.push(state);
    });

    testHarness(session).processMessage({
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-id',
    });

    expect(session.state).toBe('working');
    expect(states).toContain('working');
  });

  it('marks the session working when the first assistant message arrives before init', () => {
    const session = makeSession();

    testHarness(session).processMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'planning' }],
      },
    });

    expect(session.state).toBe('working');
  });
});

describe('ClaudeSdkSession completion', () => {
  it('completes when the turn message stream ends', async () => {
    const session = makeSession();
    testHarness(session).getCompletionSummary = vi.fn().mockResolvedValue({
      filesChanged: 2,
      additions: 10,
      deletions: 1,
    });

    sdkMock.impl = () => streamOf(
      { type: 'system', subtype: 'init', session_id: 'sdk-session-id' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } },
      { type: 'result', session_id: 'sdk-session-id', terminal_reason: 'completed' },
    );

    const completion = nextComplete(session);
    await session.start('/tmp', 'do the thing');
    const summary = await completion;

    expect(session.state).toBe('complete');
    expect(summary.filesChanged).toBe(2);
  });

  it('forwards a non-normal terminal_reason into the completion summary', async () => {
    const session = makeSession();
    testHarness(session).getCompletionSummary = async function (this: { terminalReason: string | null }) {
      return { filesChanged: 0, additions: 0, deletions: 0, terminalReason: this.terminalReason ?? undefined };
    };

    sdkMock.impl = () => streamOf(
      { type: 'system', subtype: 'init', session_id: 'sdk-session-id' },
      { type: 'result', session_id: 'sdk-session-id', terminal_reason: 'max_turns', num_turns: 40 },
    );

    const completion = nextComplete(session);
    await session.start('/tmp', 'do the thing');
    const summary = await completion;

    expect(summary.terminalReason).toBe('max_turns');
  });

  it('does not set terminalReason when the turn ended normally', async () => {
    const session = makeSession();
    testHarness(session).getCompletionSummary = async function (this: { terminalReason: string | null }) {
      return { filesChanged: 0, additions: 0, deletions: 0, terminalReason: this.terminalReason ?? undefined };
    };

    sdkMock.impl = () => streamOf(
      { type: 'system', subtype: 'init', session_id: 'sdk-session-id' },
      { type: 'result', session_id: 'sdk-session-id', terminal_reason: 'completed' },
    );

    const completion = nextComplete(session);
    await session.start('/tmp', 'do the thing');
    const summary = await completion;

    expect(summary.terminalReason).toBeUndefined();
  });

  it('completes a turn even while an SDK subagent task was started (no task-gating)', async () => {
    // Regression guard: an unbalanced task_started used to pin the session in
    // `working` forever. Completion must follow the stream ending regardless.
    const session = makeSession();
    testHarness(session).getCompletionSummary = vi.fn().mockResolvedValue({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });

    sdkMock.impl = () => streamOf(
      { type: 'system', subtype: 'init', session_id: 'sdk-session-id' },
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 'workflow-task-1',
        task_type: 'local_workflow',
        workflow_name: 'implementation-workflow',
        session_id: 'sdk-session-id',
      },
      // NOTE: no terminal task_updated/task_notification for the task above.
      { type: 'result', session_id: 'sdk-session-id', terminal_reason: 'completed' },
    );

    const completion = nextComplete(session);
    await session.start('/tmp', 'do the thing');
    await completion;

    expect(session.state).toBe('complete');
  });
});

describe('ClaudeSdkSession follow-up', () => {
  it('runs a follow-up turn that resumes the prior SDK session', async () => {
    const session = makeSession();
    testHarness(session).getCompletionSummary = vi.fn().mockResolvedValue({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });

    sdkMock.impl = () => streamOf(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      { type: 'result', session_id: 'sdk-1', terminal_reason: 'completed' },
    );

    const firstComplete = nextComplete(session);
    await session.start('/tmp', 'do the thing');
    await firstComplete;
    expect(session.state).toBe('complete');

    const secondComplete = nextComplete(session);
    await session.followUp('also do this');
    await secondComplete;
    expect(session.state).toBe('complete');

    expect(sdkMock.calls).toHaveLength(2);
    expect(sdkMock.calls[0].options.resume).toBeUndefined();
    expect(sdkMock.calls[1].options.resume).toBe('sdk-1');
    // Resume must carry the full options (incl. systemPrompt) — the SDK applies
    // these options' systemPrompt on resume, not the persisted one.
    expect(sdkMock.calls[1].options.systemPrompt).toBe('test');
  });

  it('rejects a follow-up while the session is still working', async () => {
    const session = makeSession();
    testHarness(session).setState('working');

    await expect(session.followUp('more')).rejects.toThrow(/Cannot follow up in state:/);
  });
});

describe('ClaudeSdkSession stop', () => {
  it('aborts the in-flight turn and ends stopped', async () => {
    const session = makeSession();
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');
    (session as unknown as { abortController: AbortController }).abortController = abortController;
    (session as unknown as { runPromise: Promise<void> }).runPromise = Promise.resolve();
    testHarness(session).setState('working');

    await session.stop();

    expect(abortSpy).toHaveBeenCalled();
    expect(session.state).toBe('stopped');
  });

  it('is a no-op when stop() is called on an already-stopped session', async () => {
    const session = makeSession();
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');
    (session as unknown as { abortController: AbortController }).abortController = abortController;
    testHarness(session).setState('stopped');

    await session.stop();

    expect(abortSpy).not.toHaveBeenCalled();
    expect(session.state).toBe('stopped');
  });
});

describe('ClaudeSdkSession activity mapping', () => {
  it('emits a system activity when a task_progress message includes a summary', () => {
    const session = makeSession();

    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

    testHarness(session).processMessage({
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      description: 'Running subagent',
      summary: 'Analyzing authentication module',
      usage: { total_tokens: 0, tool_uses: 0, duration_ms: 0 },
      session_id: 'sdk-session-id',
    });

    const progress = activities.find((a) => a.summary === 'Analyzing authentication module');
    expect(progress).toBeDefined();
    expect(progress?.type).toBe('system');
  });

  it('deduplicates repeated task_progress summaries within a turn', () => {
    const session = makeSession();

    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

    const payload = {
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      description: 'Running subagent',
      summary: 'Analyzing authentication module',
      usage: { total_tokens: 0, tool_uses: 0, duration_ms: 0 },
      session_id: 'sdk-session-id',
    };
    testHarness(session).processMessage(payload);
    testHarness(session).processMessage(payload);

    const matches = activities.filter((a) => a.summary === 'Analyzing authentication module');
    expect(matches).toHaveLength(1);
  });
});
