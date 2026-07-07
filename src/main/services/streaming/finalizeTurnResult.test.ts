import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BrowserWindow } from 'electron';
import { finalizeTurnResult } from './StreamingSessionService';

/**
 * finalizeTurnResult was extracted out of the 700+ line SDK-message handler
 * so turn-finalization behavior (persistence, usage recording, banners,
 * auth teardown) can be exercised directly with plain fakes — no SDK mock,
 * no MCP server, no real Electron window.
 */

type ManagedSessionArg = Parameters<typeof finalizeTurnResult>[3];

function makeManaged(overrides: Partial<ManagedSessionArg> = {}): ManagedSessionArg {
  return {
    key: 'chat:project-1:session-1',
    type: 'chat',
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
    lastTurnFinalized: false,
    suppressLifecycleEventsOnEnd: false,
    interruptInProgress: false,
    pendingFollowUpClientMessageIds: [],
    acceptedFollowUpClientMessageIds: [],
    promotedFollowUpClientMessageIds: new Set(),
    unsubscribePlanActions: () => {},
    unsubscribeClaudeMdUpdate: () => {},
    unsubscribeDocumentUpdate: () => {},
    unsubscribeFileDelete: () => {},
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
  return { sent, window };
}

describe('finalizeTurnResult', () => {
  it('persists the assistant response, resets turn state, and emits chat:done', () => {
    const managed = makeManaged({ persistHistory: true, sessionId: undefined });
    const deps = makeDeps();
    const { sent, window } = fakeWindow();

    finalizeTurnResult('chat:project-1:session-1', 'project-1', 'session-1', managed, { type: 'result', usage: { input_tokens: 10, output_tokens: 20 } }, window, deps);

    expect(deps.chatMessageRepository.addMessage).toHaveBeenCalledWith(
      'project-1', 'assistant', 'Here is the answer.', 'session-1', undefined, 'claude',
    );
    expect(managed.accumulatedResponse).toBe('');
    expect(managed.lastTurnFinalized).toBe(true);
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
    expect((errorEvent!.payload as { error: string }).error).toMatch(/Not logged in/);
  });

  it('stays processing and skips chat:session-ready when a follow-up is already queued', () => {
    const managed = makeManaged({
      session: { pendingQueuedCount: () => 1 } as unknown as ManagedSessionArg['session'],
      pendingFollowUpClientMessageIds: ['client-msg-1'],
    });
    const deps = makeDeps();
    const { sent, window } = fakeWindow();

    finalizeTurnResult('key', 'project-1', 'session-1', managed, { type: 'result', usage: undefined }, window, deps);

    expect(sent.some((e) => e.channel === 'chat:session-ready')).toBe(false);
    const doneEvent = sent.find((e) => e.channel === 'chat:done');
    expect((doneEvent!.payload as { hasQueuedFollowUp: boolean }).hasQueuedFollowUp).toBe(true);
    expect(managed.lastTurnFinalized).toBe(false);
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
        pendingFollowUpClientMessageIds: ['client-msg-1'],
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
