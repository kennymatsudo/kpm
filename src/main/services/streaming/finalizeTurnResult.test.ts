import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BrowserWindow } from 'electron';
import { finalizeTurnResult } from './StreamingSessionService';
import { createFollowUpQueue, type FollowUpQueue } from './followUpQueue';
import { createTurnLifecycle } from './turnLifecycle';
import { createTurnReport } from './turnReport';

/**
 * finalizeTurnResult was extracted out of the 700+ line SDK-message handler
 * so turn-finalization behavior (persistence, usage recording, banners,
 * auth teardown) can be exercised directly with plain fakes — no SDK mock,
 * no MCP server, no real Electron window.
 */

type ManagedSessionArg = Parameters<typeof finalizeTurnResult>[3];

function makeFollowUps(queuedClientMessageIds: string[] = []): FollowUpQueue {
  const queue = createFollowUpQueue();
  for (const clientMessageId of queuedClientMessageIds) queue.enqueue(clientMessageId);
  return queue;
}

/**
 * The window a session reports to is resolved at emit time, so each test's
 * `fakeWindow()` binds itself here and the managed session picks it up.
 */
const activeWindow: { current: BrowserWindow | null } = { current: null };

function makeManaged(overrides: Partial<ManagedSessionArg> = {}): ManagedSessionArg {
  const turn = overrides.turn ?? createTurnLifecycle();
  return {
    key: 'chat:project-1:session-1',
    projectId: 'project-1',
    session: { pendingQueuedCount: () => 0 } as unknown as ManagedSessionArg['session'],
    state: 'processing',
    provider: 'claude',
    model: 'sonnet',
    lastActivity: Date.now(),
    mcpHealthStatus: 'healthy',
    mcpRecoveryAttempts: 0,
    segmentState: { currentSegmentId: 0, hasTextInCurrentSegment: false, pendingActivities: [] },
    toolUseActivities: new Map(),
    chatSessionId: 'session-1',
    persistHistory: true,
    forceApprovalReview: false,
    accumulatedResponse: 'Here is the answer.',
    hasStreamedResponseText: false,
    turn,
    report: createTurnReport({
      turn,
      projectId: 'project-1',
      getChatSessionId: () => 'session-1',
      getMainWindow: () => activeWindow.current,
    }),
    suppressLifecycleEventsOnEnd: false,
    followUps: makeFollowUps(),
    unsubscribeToolProposals: () => {},
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Parameters<typeof finalizeTurnResult>[6]> = {}) {
  return {
    chatMessageRepository: { addMessage: vi.fn(), getMessagesByChatSession: vi.fn(() => []) },
    chatSessionRepository: {
      get: vi.fn(),
      create: vi.fn(),
      updateClaudeSessionId: vi.fn(),
      updateTitle: vi.fn(),
      clearClaudeSessionIdsByProject: vi.fn(),
    },
    toolCallLogger: { logToolCall: vi.fn(), finalizeTurn: vi.fn(), getCurrentTurnIndex: vi.fn(() => 0) },
    recordUsage: vi.fn(),
    projectRepository: { get: vi.fn(), updateTokens: vi.fn() },
    disconnectSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Parameters<typeof finalizeTurnResult>[6];
}

function fakeWindow(): { sent: { channel: string; payload: unknown }[]; window: BrowserWindow } {
  const sent: { channel: string; payload: unknown }[] = [];
  const window = {
    webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
  } as unknown as BrowserWindow;
  activeWindow.current = window;
  return { sent, window };
}

describe('finalizeTurnResult', () => {
  it('persists the assistant response, resets turn state, and emits chat:done', () => {
    const managed = makeManaged({ persistHistory: true, sessionId: undefined });
    const deps = makeDeps();
    const { sent, window } = fakeWindow();

    finalizeTurnResult('chat:project-1:session-1', 'project-1', 'session-1', managed, { type: 'result', usage: { input_tokens: 10, output_tokens: 20 } }, window, deps);

    expect(deps.chatMessageRepository.addMessage).toHaveBeenCalledWith(
      'project-1', 'assistant', 'Here is the answer.', 'session-1', undefined, 'claude', 'sonnet',
    );
    expect(managed.accumulatedResponse).toBe('');
    expect(managed.turn.settled).toBe(true);
    expect(managed.turn.settledCause).toBe('result');
    expect(managed.turnErrorSurfaced).toBe(false);
    expect(managed.toolUseActivities.size).toBe(0);
    expect(deps.toolCallLogger!.finalizeTurn).toHaveBeenCalledWith('project-1', 'session-1');
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', model: 'sonnet' }));

    const doneEvent = sent.find((e) => e.channel === 'chat:done');
    expect(doneEvent).toBeTruthy();
    expect(sent.some((e) => e.channel === 'chat:session-ready')).toBe(true);
  });

  it('tears down the session and surfaces a banner on an auth-error response', async () => {
    const managed = makeManaged({ accumulatedResponse: 'Not logged in to Claude Code. Run /login to continue.' });
    const deps = makeDeps();
    const { sent, window } = fakeWindow();

    finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: undefined }, window, deps);

    expect(deps.disconnectSession).toHaveBeenCalledWith('key', { silent: true });
    const errorEvent = sent.find((e) => e.channel === 'chat:error');
    expect(errorEvent).toBeTruthy();
    expect((errorEvent!.payload as { error: string }).error).toMatch(/not signed in.*\/login/i);
  });

  it('stays processing and skips chat:session-ready when a follow-up is already queued', () => {
    const managed = makeManaged({
      session: { pendingQueuedCount: () => 1 } as unknown as ManagedSessionArg['session'],
      followUps: makeFollowUps(['client-msg-1']),
    });
    const deps = makeDeps();
    const { sent, window } = fakeWindow();

    finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: undefined }, window, deps);

    expect(sent.some((e) => e.channel === 'chat:session-ready')).toBe(false);
    const doneEvent = sent.find((e) => e.channel === 'chat:done');
    expect((doneEvent!.payload as { hasQueuedFollowUp: boolean }).hasQueuedFollowUp).toBe(true);
    expect(managed.turn.settled).toBe(false);
    expect(managed.turn.inFlight).toBe(true);
  });

  describe('context window', () => {
    function doneContextWindow(managed: ManagedSessionArg, sdkMsg: unknown): number | undefined {
      const deps = makeDeps();
      const { sent, window } = fakeWindow();
      finalizeTurnResult('key', 'project-1', 'session-1', managed, sdkMsg, window, deps);
      const doneEvent = sent.find((e) => e.channel === 'chat:done');
      return (doneEvent!.payload as { contextWindow?: number }).contextWindow;
    }

    it('reports the capacity the SDK gave for the turn model', () => {
      const contextWindow = doneContextWindow(makeManaged({ resolvedModel: 'claude-sonnet-5' }), {
        type: 'result',
        usage: { input_tokens: 10, output_tokens: 20 },
        modelUsage: { 'claude-sonnet-5': { contextWindow: 1_000_000 } },
      });

      expect(contextWindow).toBe(1_000_000);
    });

    it('ignores a subagent entry and reports the main model capacity', () => {
      const contextWindow = doneContextWindow(makeManaged({ resolvedModel: 'claude-sonnet-5' }), {
        type: 'result',
        usage: { input_tokens: 10, output_tokens: 20 },
        modelUsage: {
          'claude-sonnet-5': { contextWindow: 1_000_000 },
          'claude-haiku-4-5': { contextWindow: 200_000 },
        },
      });

      expect(contextWindow).toBe(1_000_000);
    });

    it('uses a lone entry when the turn produced no resolved model', () => {
      const contextWindow = doneContextWindow(makeManaged({ resolvedModel: undefined }), {
        type: 'result',
        usage: undefined,
        modelUsage: { 'claude-opus-5': { contextWindow: 1_000_000 } },
      });

      expect(contextWindow).toBe(1_000_000);
    });

    it('declines to guess between models when the turn produced no resolved model', () => {
      const contextWindow = doneContextWindow(makeManaged({ resolvedModel: undefined }), {
        type: 'result',
        usage: undefined,
        modelUsage: {
          'claude-sonnet-5': { contextWindow: 1_000_000 },
          'claude-haiku-4-5': { contextWindow: 200_000 },
        },
      });

      expect(contextWindow).toBeUndefined();
    });

    it('reports a context window from an adapter-built provider result', () => {
      const contextWindow = doneContextWindow(makeManaged({ provider: 'codex', resolvedModel: undefined }), {
        type: 'result',
        usage: { input_tokens: 10, output_tokens: 20 },
        contextWindow: 1_050_000,
      });

      expect(contextWindow).toBe(1_050_000);
    });

    it('rejects a zero capacity rather than dividing by it', () => {
      const contextWindow = doneContextWindow(makeManaged({ resolvedModel: 'claude-sonnet-5' }), {
        type: 'result',
        usage: undefined,
        modelUsage: { 'claude-sonnet-5': { contextWindow: 0 } },
      });

      expect(contextWindow).toBeUndefined();
    });
  });

  describe('cost basis', () => {
    it('records a Claude result as a cumulative snapshot to be differenced', () => {
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', makeManaged(), {
        type: 'result',
        usage: { input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.22,
        session_id: 'sdk-session',
      }, window, deps);

      expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
        totalCostUsd: 0.22,
        isCumulativeCostSnapshot: true,
      }));
    });

    it('records an adapter per-turn cost as-is, so it is not differenced against the last turn', () => {
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', makeManaged(), {
        type: 'result',
        usage: { input_tokens: 10, output_tokens: 20 },
        cost: { usd: 0.12, basis: 'per-turn' },
        session_id: 'pi-session',
      }, window, deps);

      expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
        totalCostUsd: 0.12,
        isCumulativeCostSnapshot: false,
      }));
    });
  });

  describe('turn latency', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('records ttft_ms and duration_ms on the primary usage event from known turn timestamps', () => {
      vi.spyOn(Date, 'now').mockReturnValue(15_200);
      const managed = makeManaged({ turnStartedAt: 1_000, firstContentAt: 1_800 });
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: { input_tokens: 10, output_tokens: 20 } }, window, deps);

      expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
        ttftMs: 800,
        durationMs: 14_200,
      }));
    });

    it('records a null ttft_ms when no content event fired for the turn', () => {
      vi.spyOn(Date, 'now').mockReturnValue(9_000);
      const managed = makeManaged({ turnStartedAt: 5_000, firstContentAt: undefined });
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: { input_tokens: 5, output_tokens: 5 } }, window, deps);

      expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
        ttftMs: null,
        durationMs: 4_000,
      }));
    });

    it('records null ttft_ms/duration_ms when the turn never recorded a start time', () => {
      const managed = makeManaged({ turnStartedAt: undefined, firstContentAt: undefined });
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: { input_tokens: 5, output_tokens: 5 } }, window, deps);

      expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
        ttftMs: null,
        durationMs: null,
      }));
    });

    it('resets turn timestamps after finalizing so the next turn measures fresh', () => {
      const managed = makeManaged({ turnStartedAt: 1_000, firstContentAt: 1_500 });
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: { input_tokens: 1, output_tokens: 1 } }, window, deps);

      expect(managed.turnStartedAt).toBeUndefined();
      expect(managed.firstContentAt).toBeUndefined();
    });

    it('preserves turnStartedAt for an already-queued next turn instead of resetting it', () => {
      const managed = makeManaged({
        session: { pendingQueuedCount: () => 1 } as unknown as ManagedSessionArg['session'],
        followUps: makeFollowUps(['client-msg-1']),
        turnStartedAt: 1_000,
        firstContentAt: 1_500,
      });
      const deps = makeDeps();
      const { window } = fakeWindow();

      finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: undefined }, window, deps);

      expect(managed.turnStartedAt).toBe(1_000);
      expect(managed.firstContentAt).toBeUndefined();
    });
  });
});
