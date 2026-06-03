import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { PlanAction } from '../../../shared/types';
import type {
  PlanActionsEvent,
} from '../../claude/tools/createKpmServer';
import {
  buildContinuationHistory,
  createStreamingSessionService,
  type StreamingSessionServiceDeps,
} from './StreamingSessionService';
import type * as SdkTypeGuardsModule from '../../claude/sdkTypeGuards';

const { mockSessionInstances, mockSessionCounter, clearPendingDocumentContentCalls } = vi.hoisted(() => ({
  mockSessionInstances: [] as {
    emitMessage: (msg: unknown) => void;
    emitSessionEnd: (reason: 'completed' | 'error' | 'closed', error?: Error) => void;
    setReady: (value: boolean) => void;
    sentMessages: string[];
    interruptCallCount: { value: number };
    cancelLastQueued: () => unknown;
    pendingQueuedCount: () => number;
    steerPendingIntoCurrentTurn: () => void;
  }[],
  mockSessionCounter: { nextId: 1 },
  clearPendingDocumentContentCalls: [] as string[],
}));

const { sdkTypeGuardState } = vi.hoisted(() => ({
  sdkTypeGuardState: {
    maxTokensReached: false,
    maxTurnsReached: false,
    apiRetry: false,
    terminalReason: undefined as string | undefined,
  },
}));

vi.mock('../../claude/streaming', () => {
  type SessionEndReason = 'completed' | 'error' | 'closed';
  interface MockSessionConfig {
    onMessage: (msg: unknown) => void;
    onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
    onReady?: (sessionId: string, mcpStatus: unknown[]) => void;
  }

  class MockStreamingSession {
    private readonly config: MockSessionConfig;
    private ready = true;
    // Follow-ups pushed via send() that the (simulated) SDK input generator has
    // not yet pulled. The seed message from start() is consumed immediately, so
    // it never counts here. Mirrors AsyncMessageQueue.pendingCount.
    private pendingQueued = 0;
    readonly sentMessages: string[] = [];
    readonly interruptCallCount = { value: 0 };

    constructor(config: MockSessionConfig) {
      this.config = config;
      mockSessionInstances.push(this);
    }

    async start(initialMessage: string): Promise<void> {
      this.sentMessages.push(initialMessage);
      const sessionId = `mock-session-${mockSessionCounter.nextId++}`;
      this.config.onReady?.(sessionId, []);
    }

    send(text: string): void {
      if (!this.ready) {
        throw new Error('Session is not ready');
      }
      this.sentMessages.push(text);
      this.pendingQueued += 1;
    }

    cancelLastQueued(): unknown {
      if (this.pendingQueued <= 0) return null;
      this.pendingQueued -= 1;
      return this.sentMessages.pop() ?? null;
    }

    pendingQueuedCount(): number {
      return this.pendingQueued;
    }

    /**
     * Simulate the SDK absorbing a queued follow-up into the in-flight turn
     * (streaming-input steering) rather than deferring it to a new turn. After
     * this, pendingQueuedCount() drops, so the next `result` reports the
     * follow-up as consumed — not as a pending new turn.
     */
    steerPendingIntoCurrentTurn(): void {
      if (this.pendingQueued > 0) this.pendingQueued -= 1;
    }

    isReady(): boolean {
      return this.ready;
    }

    async interrupt(): Promise<void> {
      this.interruptCallCount.value += 1;
      return Promise.resolve();
    }

    async close(): Promise<void> {
      this.ready = false;
      this.config.onSessionEnd?.('closed');
    }

    emitMessage(msg: unknown): void {
      this.config.onMessage(msg);
    }

    emitSessionEnd(reason: SessionEndReason, error?: Error): void {
      this.ready = false;
      this.config.onSessionEnd?.(reason, error);
    }

    setReady(value: boolean): void {
      this.ready = value;
    }
  }

  return {
    StreamingSession: MockStreamingSession,
  };
});

vi.mock('../../claude/tools/createKpmServer', () => ({
  runWithToolExecutionContext: (_context: unknown, run: () => unknown) => run(),
  clearPendingDocumentContent: (chatSessionId: string) => {
    clearPendingDocumentContentCalls.push(chatSessionId);
  },
}));

vi.mock('../../claude/clientManager', () => ({
  clientManager: {
    clearAllowAllRemaining: vi.fn(),
  },
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  // The service uses getSessionInfo to fetch the SDK-derived session summary
  // for tab/history titles. Stub to a no-op so tests don't touch the JSONL store.
  getSessionInfo: vi.fn(async () => undefined),
}));

vi.mock('../../claude/sdkTypeGuards', async () => {
  // sdkTypeGuards has only type-imports from the SDK (erased at runtime), so
  // importActual is safe and lets us exercise the real describeAssistantError
  // mapping while still stubbing the stateful guards.
  const actual = await vi.importActual<typeof SdkTypeGuardsModule>('../../claude/sdkTypeGuards');
  return {
    isMaxTokensReached: () => sdkTypeGuardState.maxTokensReached,
    isMaxTurnsReached: () => sdkTypeGuardState.maxTurnsReached,
    isApiRetryMessage: () => sdkTypeGuardState.apiRetry,
    isRateLimitEvent: () => false,
    getTerminalReason: () => sdkTypeGuardState.terminalReason,
    describeAssistantError: actual.describeAssistantError,
  };
});

vi.mock('../../config', () => ({
  getConfig: () => ({
    session: {
      sessionReadyTimeoutMs: 1_000,
      cleanupIntervalMs: 60_000,
      processingIdleTimeoutMs: 60_000,
      processingTimeoutMs: 300_000,
      mainIdleTimeoutMs: 60_000,
    },
  }),
}));

function createDeps(sendSpy: (channel: string, payload: unknown) => void): StreamingSessionServiceDeps {
  const chatSessions = new Map<string, { claude_session_id: string | null; title: string | null }>();

  return {
    projectRepository: {
      get: () => ({ id: 'project-1' } as never),
      updateTokens: vi.fn(),
    },
    chatMessageRepository: {
      addMessage: vi.fn(),
      getMessagesByChatSession: vi.fn(() => []),
    },
    chatSessionRepository: {
      get: (id: string) => chatSessions.get(id),
      create: (id: string) => {
        chatSessions.set(id, { claude_session_id: null, title: null });
        return { id };
      },
      updateClaudeSessionId: (id: string, claudeSessionId: string) => {
        const prev = chatSessions.get(id) ?? { claude_session_id: null, title: null };
        chatSessions.set(id, { ...prev, claude_session_id: claudeSessionId });
      },
      updateTitle: (id: string, title: string) => {
        const prev = chatSessions.get(id) ?? { claude_session_id: null, title: null };
        chatSessions.set(id, { ...prev, title });
      },
      clearClaudeSessionIdsByProject: () => {
        for (const [key, value] of chatSessions) {
          chatSessions.set(key, { ...value, claude_session_id: null });
        }
      },
    },
    getMainWindow: () => ({
      webContents: {
        send: sendSpy,
      },
    } as BrowserWindow),
    buildContext: () => ({ projectId: 'project-1' } as never),
    buildSdkOptions: () => ({}),
    subscribeToPlanActions: () => () => {},
    subscribeToClaudeMdUpdate: () => () => {},
    subscribeToDocumentUpdate: () => () => {},
    subscribeToFileDelete: () => () => {},
    readClaudeMd: async () => ({ success: true, content: '', filename: 'AGENTS.md' }),
    readDocumentFile: async () => ({ success: true, content: '' }),
  };
}

function createDepsWithToolEvents(sendSpy: (channel: string, payload: unknown) => void) {
  const planActionSubscribers: ((event: PlanActionsEvent) => void)[] = [];
  const contextFileSubscribers: ((update: { projectId: string; chatSessionId?: string; newContent: string; oldContent: string | null; filename: string }) => void)[] = [];

  const deps = createDeps(sendSpy);
  const depsWithEvents: StreamingSessionServiceDeps = {
    ...deps,
    subscribeToPlanActions: (callback) => {
      planActionSubscribers.push(callback);
      return () => {
        const index = planActionSubscribers.indexOf(callback);
        if (index !== -1) planActionSubscribers.splice(index, 1);
      };
    },
    subscribeToClaudeMdUpdate: (callback) => {
      contextFileSubscribers.push(callback);
      return () => {
        const index = contextFileSubscribers.indexOf(callback);
        if (index !== -1) contextFileSubscribers.splice(index, 1);
      };
    },
  };

  return {
    deps: depsWithEvents,
    emitPlanActions: (event: PlanActionsEvent) => {
      for (const callback of planActionSubscribers) callback(event);
    },
    emitContextFileUpdate: (update: { projectId: string; chatSessionId?: string; newContent: string; oldContent: string | null; filename: string }) => {
      for (const callback of contextFileSubscribers) callback(update);
    },
  };
}

describe('StreamingSessionService lifecycle regression coverage', () => {
  let service: ReturnType<typeof createStreamingSessionService> | null = null;
  const sentEvents: { channel: string; payload: unknown }[] = [];
  const sendSpy = vi.fn((channel: string, payload: unknown) => {
    sentEvents.push({ channel, payload });
  });

  beforeEach(() => {
    sentEvents.length = 0;
    mockSessionInstances.length = 0;
    clearPendingDocumentContentCalls.length = 0;
    mockSessionCounter.nextId = 1;
    sdkTypeGuardState.maxTokensReached = false;
    sdkTypeGuardState.maxTurnsReached = false;
    sdkTypeGuardState.apiRetry = false;
    sdkTypeGuardState.terminalReason = undefined;
    sendSpy.mockClear();
  });

  afterEach(async () => {
    if (service) {
      await service.disposeAll();
    }
    service = null;
    sentEvents.length = 0;
    mockSessionInstances.length = 0;
  });

  it('suppresses redundant session-deactivated after a finalized turn', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitMessage({ type: 'result' });
    expect(sentEvents.some((e) => e.channel === 'chat:done')).toBe(true);

    sentEvents.length = 0;
    session.emitSessionEnd('error', new Error('post-turn teardown'));

    expect(sentEvents.some((e) => e.channel === 'chat:session-deactivated')).toBe(false);
    expect(sentEvents.some((e) => e.channel === 'chat:done')).toBe(false);
    expect(service.getActiveSessions('project-1')).toHaveLength(0);
  });

  it('still emits deactivation and done when a session ends mid-turn', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitSessionEnd('error', new Error('stream failed'));

    const deactivation = sentEvents.find((e) => e.channel === 'chat:session-deactivated');
    expect(deactivation).toBeDefined();
    expect(deactivation?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      reason: 'session_end_error',
      source: 'onSessionEnd',
      previousState: 'processing',
    });
    expect(sentEvents.some((e) => e.channel === 'chat:done')).toBe(true);
  });

  it('reconnects silently when underlying session is not ready', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);

    const firstSession = mockSessionInstances[0];
    firstSession.emitMessage({ type: 'result' });
    firstSession.setReady(false);

    sentEvents.length = 0;
    const secondSend = await service.sendChatMessage('project-1', 'follow up', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(secondSend.ok).toBe(true);

    expect(mockSessionInstances).toHaveLength(2);
    expect(sentEvents.some((e) => e.channel === 'chat:session-deactivated')).toBe(false);
  });

  it('routes tool approval events only to their originating chat session', async () => {
    const toolEvents = createDepsWithToolEvents(sendSpy);
    service = createStreamingSessionService(toolEvents.deps);

    const firstSend = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    const secondSend = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-2',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);
    expect(secondSend.ok).toBe(true);

    sentEvents.length = 0;

    const actions: PlanAction[] = [{ type: 'delete_item', item_id: 'item-1' }];
    toolEvents.emitPlanActions({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      actions,
    });

    const planActionEvents = sentEvents.filter((event) => event.channel === 'chat:plan-actions');

    expect(planActionEvents).toHaveLength(1);
    expect(planActionEvents[0]?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      actions,
    });
  });

  it('forwards the resolved context filename and pre-edit content from the tool payload', async () => {
    const toolEvents = createDepsWithToolEvents(sendSpy);
    service = createStreamingSessionService(toolEvents.deps);

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    sentEvents.length = 0;
    // The tool already read the file to validate old_string and now forwards
    // both the resolved filename and the pre-edit content; the subscriber must
    // not re-read disk.
    toolEvents.emitContextFileUpdate({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      newContent: '# Updated context',
      oldContent: '# Existing context',
      filename: 'CLAUDE.md',
    });
    await Promise.resolve();

    const fileUpdate = sentEvents.find((event) => event.channel === 'chat:file-update');
    expect(fileUpdate?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      filePath: 'CLAUDE.md',
      content: '# Updated context',
      oldContent: '# Existing context',
    });
  });

    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);
    // Initial message was delivered via start(), session is now processing.
    expect(mockSessionInstances).toHaveLength(1);
    const session = mockSessionInstances[0];
    expect(session.sentMessages).toEqual(['first prompt']);

    sentEvents.length = 0;
    const secondClientMessageId = '11111111-1111-4111-8111-111111111111';
    const secondSend = await service.sendChatMessage('project-1', 'second prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
      clientMessageId: secondClientMessageId,
    });

    expect(secondSend.ok).toBe(true);
    expect(session.interruptCallCount.value).toBe(0);
    expect(session.sentMessages).toEqual(['first prompt', 'second prompt']);
    expect(sentEvents.find((e) => e.channel === 'chat:queued')?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      clientMessageId: secondClientMessageId,
    });

    const concurrent = await service.sendChatMessage('project-1', 'third prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });

    sentEvents.length = 0;
    session.emitMessage({ type: 'result' });
    expect(sentEvents.some((e) => e.channel === 'chat:session-ready')).toBe(false);
    expect(sentEvents.find((e) => e.channel === 'chat:done')?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      hasQueuedFollowUp: true,
      queuedClientMessageId: secondClientMessageId,
    });
    expect(clearPendingDocumentContentCalls).toContain('chat-1');
    expect(service.getActiveSessions('project-1')[0]).toMatchObject({
      chatSessionId: 'chat-1',
      state: 'processing',
      isProcessing: true,
    });

    const thirdAfterTurnBoundary = await service.sendChatMessage('project-1', 'third prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
      clientMessageId: '33333333-3333-4333-8333-333333333333',
    });
    expect(thirdAfterTurnBoundary.ok).toBe(true);
    expect(mockSessionInstances).toHaveLength(1);
  });

  it('finalizes (no phantom turn) when the SDK absorbed the follow-up into this turn', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);
    const session = mockSessionInstances[0];

    const followUpClientMessageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const queued = await service.sendChatMessage('project-1', 'follow-up while streaming', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
      clientMessageId: followUpClientMessageId,
    });
    expect(queued.ok).toBe(true);

    // The SDK pulls the follow-up into the in-flight turn (steering) instead of
    // deferring it. By the time the turn's `result` lands, nothing is pending.
    session.steerPendingIntoCurrentTurn();

    sentEvents.length = 0;
    session.emitMessage({ type: 'result' });

    const donePayload = sentEvents.find((e) => e.channel === 'chat:done')?.payload as {
      hasQueuedFollowUp?: boolean;
      queuedClientMessageId?: string;
      consumedQueuedClientMessageId?: string;
    };
    // No phantom follow-up turn is promised — the turn is finalized normally.
    expect(donePayload.hasQueuedFollowUp).toBe(false);
    expect(donePayload.queuedClientMessageId).toBeUndefined();
    // The absorbed follow-up is surfaced so the renderer drops its queued badge.
    expect(donePayload.consumedQueuedClientMessageId).toBe(followUpClientMessageId);
    // Session returns to ready (the watchdog can now recover it if needed) and
    // the consumed envelope is cleared so later sends aren't rejected.
    expect(sentEvents.some((e) => e.channel === 'chat:session-ready')).toBe(true);
    expect(service.getActiveSessions('project-1')[0]).toMatchObject({
      chatSessionId: 'chat-1',
      state: 'ready',
    });

    const nextSend = await service.sendChatMessage('project-1', 'a genuinely new turn', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
      clientMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(nextSend.ok).toBe(true);
  });

  it('cancels a queued follow-up before the turn boundary', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);

    const session = mockSessionInstances[0];
    const clientMessageId = '44444444-4444-4444-8444-444444444444';

    const queued = await service.sendChatMessage('project-1', 'second prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
      clientMessageId,
    });
    expect(queued.ok).toBe(true);
    expect(session.sentMessages).toEqual(['first prompt', 'second prompt']);

    sentEvents.length = 0;
    const cancelled = service.cancelQueuedChatMessage('project-1', 'chat-1', clientMessageId);
    expect(cancelled.ok).toBe(true);
    expect(session.sentMessages).toEqual(['first prompt']);
    expect(sentEvents.find((e) => e.channel === 'chat:queue-cleared')?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      clientMessageId,
      reason: 'cancelled',
    });
  });

  it('continues streaming the current turn while a follow-up is queued', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);

    const session = mockSessionInstances[0];
    sentEvents.length = 0;

    const queued = await service.sendChatMessage('project-1', 'second prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
      clientMessageId: '55555555-5555-4555-8555-555555555555',
    });
    expect(queued.ok).toBe(true);

    session.emitMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'still finishing first turn' }] },
    });
    expect(sentEvents.find((e) => e.channel === 'chat:chunk')?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      text: 'still finishing first turn',
    });
  });

it('surfaces max-token truncation after finalizing the partial response', async () => {
    sdkTypeGuardState.maxTokensReached = true;
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitMessage({ type: 'result' });

    const doneIndex = sentEvents.findIndex((event) => event.channel === 'chat:done');
    const errorIndex = sentEvents.findIndex((event) => event.channel === 'chat:error');

    expect(doneIndex).toBeGreaterThanOrEqual(0);
    expect(errorIndex).toBeGreaterThan(doneIndex);
    expect(sentEvents[errorIndex]?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      error: 'Response reached the output limit. Send another message to continue.',
    });
  });

  it('surfaces an assistant-message error (overloaded) instead of failing silently', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitMessage({ type: 'assistant', error: 'overloaded', message: { content: [] } });

    const errorEvent = sentEvents.find((e) => e.channel === 'chat:error');
    expect(errorEvent?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      error: 'Claude is temporarily overloaded. Wait a moment, then send another message to retry.',
    });
  });

  it('does not double-surface the generic terminal-reason banner after an assistant error', async () => {
    sdkTypeGuardState.terminalReason = 'model_error';
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    // Assistant error arrives first, then the result reports terminal_reason.
    session.emitMessage({ type: 'assistant', error: 'server_error', message: { content: [] } });
    session.emitMessage({ type: 'result' });

    const errorEvents = sentEvents.filter((e) => e.channel === 'chat:error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.payload).toMatchObject({
      error: 'Claude had a server error. Wait a moment, then send another message to retry.',
    });
  });
});

describe('buildContinuationHistory', () => {
  it('returns empty for empty history', () => {
    expect(buildContinuationHistory([])).toEqual([]);
  });

  it('drops a trailing user turn (the just-sent current message)', () => {
    const stored: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'current message being sent' },
    ];
    expect(buildContinuationHistory(stored)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ]);
  });

  it('keeps trailing assistant turn (unusual but valid)', () => {
    const stored: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    expect(buildContinuationHistory(stored)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ]);
  });

  it('returns empty when the only stored message is the current send', () => {
    expect(buildContinuationHistory([{ role: 'user', content: 'just sent' }])).toEqual([]);
  });

  it('truncates an oversized single turn rather than dropping it', () => {
    const big = 'x'.repeat(20_000);
    const stored: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'assistant', content: big },
    ];
    const out = buildContinuationHistory(stored);
    expect(out).toHaveLength(1);
    expect(out[0].content.length).toBeLessThan(big.length);
    expect(out[0].content.endsWith('[…truncated]')).toBe(true);
  });

  it('caps at 20 turns, keeping the most recent', () => {
    const stored: { role: 'user' | 'assistant'; content: string }[] = [];
    for (let i = 0; i < 30; i++) {
      stored.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
    }
    // Trailing turn (i=29) is assistant, so no trim; builder takes last 20.
    const out = buildContinuationHistory(stored);
    expect(out).toHaveLength(20);
    expect(out[0].content).toBe('msg 10');
    expect(out[out.length - 1].content).toBe('msg 29');
  });
});

describe('createChatSession continuation wiring', () => {
  const sendSpy = vi.fn();

  beforeEach(() => {
    mockSessionInstances.length = 0;
    mockSessionCounter.nextId = 1;
    sendSpy.mockClear();
  });

  it('seeds continuationHistory on fresh sessions when prior turns exist', async () => {
    const deps = createDeps(sendSpy);
    const capturedContexts: unknown[] = [];
    const depsWithCapture: StreamingSessionServiceDeps = {
      ...deps,
      chatMessageRepository: {
        ...deps.chatMessageRepository,
        getMessagesByChatSession: vi.fn(() => [
          { role: 'user' as const, content: 'earlier question' },
          { role: 'assistant' as const, content: 'earlier answer' },
          { role: 'user' as const, content: 'new message after worktree switch' },
        ]),
      },
      buildSdkOptions: (ctx) => {
        capturedContexts.push(ctx);
        return {};
      },
    };

    const service = createStreamingSessionService(depsWithCapture);
    const result = await service.sendChatMessage('project-1', 'new message after worktree switch', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(result.ok).toBe(true);

    expect(capturedContexts).toHaveLength(1);
    const ctx = capturedContexts[0] as { continuationHistory?: unknown };
    expect(ctx.continuationHistory).toEqual([
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ]);

    await service.disposeAll();
  });

  it('does not seed continuationHistory for a resumed session', async () => {
    const deps = createDeps(sendSpy);
    const capturedContexts: unknown[] = [];
    const depsWithCapture: StreamingSessionServiceDeps = {
      ...deps,
      chatSessionRepository: {
        ...deps.chatSessionRepository,
        get: () => ({ claude_session_id: 'prior-sdk-session', title: null }),
      },
      chatMessageRepository: {
        ...deps.chatMessageRepository,
        getMessagesByChatSession: vi.fn(() => [
          { role: 'user' as const, content: 'earlier' },
          { role: 'assistant' as const, content: 'answer' },
        ]),
      },
      buildSdkOptions: (ctx) => {
        capturedContexts.push(ctx);
        return {};
      },
    };

    const service = createStreamingSessionService(depsWithCapture);
    const result = await service.sendChatMessage('project-1', 'continuing', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(result.ok).toBe(true);

    const ctx = capturedContexts[0] as { continuationHistory?: unknown };
    expect(ctx.continuationHistory).toBeUndefined();

    await service.disposeAll();
  });
});
