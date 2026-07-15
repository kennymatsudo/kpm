import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createChatEventRouter,
  type BufferedApprovalEvent,
  type ChatEventRouterDeps,
  type ChatEventRouterServices,
  type ChatStoreView,
} from './chatEventRouter';
import type { PerSessionState } from '../stores/chat/types';

const PROJECT_ID = 'project-1';
const OTHER_PROJECT_ID = 'project-2';
const SESSION_ID = 'session-1';

function makeSession(overrides: Partial<PerSessionState> = {}): PerSessionState {
  return {
    messages: [],
    streamingSegments: [],
    streamingContent: '',
    pendingActivities: [],
    isStreaming: false,
    error: null,
    activities: [],
    sessionState: 'ready',
    streamingThinking: '',
    streamStartedAt: null,
    lastStreamUpdateAt: null,
    draftMessage: '',
    pendingAttachments: [],
    suggestions: [],
    sessionNumber: 1,
    title: null,
    claudeSessionId: null,
    mcpDegraded: false,
    mcpError: null,
    hydrated: true,
    model: 'sonnet',
    effort: 'medium',
    provider: 'claude',
    piProviderModel: undefined,
    lastTurnUsage: null,
    ...overrides,
    codexModel: overrides.codexModel ?? 'gpt-5.6-sol',
  };
}

function makeChatState(overrides: Partial<ChatStoreView> = {}): ChatStoreView {
  return {
    sessions: new Map([[SESSION_ID, makeSession()]]),
    viewedSessionId: null,
    appendChunk: vi.fn(),
    appendThinking: vi.fn(),
    finalizeMessage: vi.fn(),
    setError: vi.fn(),
    setTokens: vi.fn(),
    addActivity: vi.fn(),
    updateActivity: vi.fn(),
    setSuggestions: vi.fn(),
    setSlashCommands: vi.fn(),
    setSessionState: vi.fn(),
    setRetrying: vi.fn(),
    markSessionActive: vi.fn(),
    markSessionInactive: vi.fn(),
    setViewedSession: vi.fn(),
    getOrCreateSession: vi.fn(() => makeSession()),
    setClaudeSessionId: vi.fn(),
    setSessionTitle: vi.fn(),
    setMcpStatus: vi.fn(),
    setLastTurnUsage: vi.fn(),
    clearQueuedFlag: vi.fn(),
    removeQueuedUserMessage: vi.fn(),
    ...overrides,
  };
}

function makeDeps(chatState: ChatStoreView, overrides: Partial<ChatEventRouterDeps> = {}) {
  const approvalQueue = {
    propose: vi.fn(),
  };
  type ActiveSessionsResult = Awaited<ReturnType<ChatEventRouterServices['getActiveChatSessions']>>;
  type SessionStateResult = Awaited<ReturnType<ChatEventRouterServices['getChatSessionState']>>;
  const services = {
    getChatUsage: vi.fn(async () => ({ totalTokens: 42 })),
    getActiveChatSessions: vi.fn(async (): Promise<ActiveSessionsResult> => ({ success: true, sessions: [] })),
    getChatSessionState: vi.fn(async (): Promise<SessionStateResult> => ({ success: true, state: 'ready' })),
  };
  const deps: ChatEventRouterDeps = {
    projectId: PROJECT_ID,
    getChatState: () => chatState,
    getApprovalQueue: () => approvalQueue,
    services,
    emitStoreEvent: vi.fn(),
    now: () => 1_000_000,
    buffer: new Map<string, BufferedApprovalEvent[]>(),
    ...overrides,
  };
  return { deps, approvalQueue, services };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('event routing', () => {
  it('routes chunks to appendChunk for known sessions in the active project', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onChunk({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      text: 'hello',
      segmentId: 3,
    });

    expect(chatState.appendChunk).toHaveBeenCalledWith(SESSION_ID, 'hello', 3, undefined);
  });

  it('drops chunks for unknown sessions and other projects', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onChunk({ projectId: PROJECT_ID, chatSessionId: 'unknown', text: 'x' });
    router.handlers.onChunk({ projectId: OTHER_PROJECT_ID, chatSessionId: SESSION_ID, text: 'x' });

    expect(chatState.appendChunk).not.toHaveBeenCalled();
  });

  it('routes result-side activity updates (with diff data) to updateActivity, not addActivity', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    const baseActivity = { id: 'a1', type: 'tool', name: 'Edit', status: 'complete' };
    router.handlers.onActivity({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      activity: { ...baseActivity, diffStats: { additions: 1, deletions: 0 } } as never,
    });
    router.handlers.onActivity({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      activity: baseActivity as never,
    });

    expect(chatState.updateActivity).toHaveBeenCalledTimes(1);
    expect(chatState.addActivity).toHaveBeenCalledTimes(1);
  });

  it('treats a "still responding" error as a retry, not a failure', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onError({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      error: 'Claude is still responding',
    });

    expect(chatState.setRetrying).toHaveBeenCalledWith(SESSION_ID);
    expect(chatState.setSessionState).toHaveBeenCalledWith(SESSION_ID, 'processing');
    expect(chatState.setError).not.toHaveBeenCalled();
  });

  it('falls back to the viewed session for errors without a chatSessionId', () => {
    const chatState = makeChatState({ viewedSessionId: SESSION_ID });
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onError({ projectId: PROJECT_ID, error: 'boom' });

    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'boom');
  });

  it('ignores mcp status for servers other than kpm', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onMcpStatus({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      serverName: 'other',
      status: 'failed',
    });

    expect(chatState.setMcpStatus).not.toHaveBeenCalled();
  });

  it('maps kpm mcp status to degraded flag with error text', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onMcpStatus({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      serverName: 'kpm',
      status: 'failed',
    });
    router.handlers.onMcpStatus({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      serverName: 'kpm',
      status: 'connected',
    });

    expect(chatState.setMcpStatus).toHaveBeenNthCalledWith(1, SESSION_ID, true, 'Tools unavailable (failed)');
    expect(chatState.setMcpStatus).toHaveBeenNthCalledWith(2, SESSION_ID, false, null);
  });

  it('finalizes and idles the session on deactivation', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onSessionDeactivated({ projectId: PROJECT_ID, chatSessionId: SESSION_ID });

    expect(chatState.finalizeMessage).toHaveBeenCalledWith(SESSION_ID);
    expect(chatState.setSessionState).toHaveBeenCalledWith(SESSION_ID, 'idle');
    expect(chatState.markSessionInactive).toHaveBeenCalledWith(SESSION_ID);
  });

  it('stops routing after dispose', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.dispose();
    router.handlers.onChunk({ projectId: PROJECT_ID, chatSessionId: SESSION_ID, text: 'late' });

    expect(chatState.appendChunk).not.toHaveBeenCalled();
  });
});

describe('done handling', () => {
  it('finalizes with an atomic queued-follow-up handoff and re-enters processing', async () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onDone({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      model: 'claude-sonnet-4-6',
      hasQueuedFollowUp: true,
      queuedClientMessageId: 'q1',
      beforeClientMessageId: 'q1',
    });
    await flushMicrotasks();

    expect(chatState.finalizeMessage).toHaveBeenCalledWith(SESSION_ID, {
      model: 'claude-sonnet-4-6',
      beforeClientMessageId: 'q1',
      promoteQueuedClientMessageId: 'q1',
      clearQueuedClientMessageId: undefined,
    });
    expect(chatState.setSessionState).toHaveBeenCalledWith(SESSION_ID, 'processing');
  });

  it('does not promote a queued follow-up when none is pending', async () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onDone({ projectId: PROJECT_ID, chatSessionId: SESSION_ID });
    await flushMicrotasks();

    expect(chatState.finalizeMessage).toHaveBeenCalledWith(SESSION_ID, expect.objectContaining({
      promoteQueuedClientMessageId: undefined,
    }));
    expect(chatState.setSessionState).not.toHaveBeenCalled();
  });

  it('records last-turn usage and refreshes total tokens', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onDone({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      inputTokens: 100,
      outputTokens: 20,
    });
    await flushMicrotasks();

    expect(chatState.setLastTurnUsage).toHaveBeenCalledWith(SESSION_ID, {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      contextWindow: null,
    });
    expect(services.getChatUsage).toHaveBeenCalledWith(PROJECT_ID);
    expect(chatState.setTokens).toHaveBeenCalledWith(42);
  });

  it('skips setLastTurnUsage when the turn reports no token counts', async () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onDone({ projectId: PROJECT_ID, chatSessionId: SESSION_ID });
    await flushMicrotasks();

    expect(chatState.setLastTurnUsage).not.toHaveBeenCalled();
  });
});

describe('queue-cleared handling', () => {
  it('clears the queued badge but keeps the bubble when the race was lost', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onQueueCleared({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      clientMessageId: 'm1',
      reason: 'already_sent',
    });

    expect(chatState.clearQueuedFlag).toHaveBeenCalledWith(SESSION_ID, 'm1');
    expect(chatState.removeQueuedUserMessage).not.toHaveBeenCalled();
  });

  it('removes the bubble entirely when the queued message was cancelled', () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    router.handlers.onQueueCleared({
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
      clientMessageId: 'm1',
      reason: 'cancelled',
    });

    expect(chatState.removeQueuedUserMessage).toHaveBeenCalledWith(SESSION_ID, 'm1');
    expect(chatState.clearQueuedFlag).not.toHaveBeenCalled();
  });
});

describe('approval event buffering', () => {
  it('routes every proposal event type for the active project into the approval queue', () => {
    const chatState = makeChatState();
    const { deps, approvalQueue } = makeDeps(chatState);
    const router = createChatEventRouter(deps);
    const actions = [{ type: 'update_item', item_id: 'x' } as never];

    router.handlers.onPlanActions({ projectId: PROJECT_ID, actions });
    router.handlers.onFileUpdate({ projectId: PROJECT_ID, filePath: 'notes.md', content: 'new', oldContent: 'old' });
    router.handlers.onFileUpdate({ projectId: PROJECT_ID, filePath: 'AGENTS.md', content: 'ctx', oldContent: 'old ctx' });
    router.handlers.onFileMove({ projectId: PROJECT_ID, sourcePath: 'draft.md', targetPath: 'archive/draft.md' });
    router.handlers.onFileDelete({ projectId: PROJECT_ID, path: 'old.md', isDirectory: false });

    expect(approvalQueue.propose).toHaveBeenCalledWith({ type: 'plan-actions', projectId: PROJECT_ID, actions });
    expect(approvalQueue.propose).toHaveBeenCalledWith(
      { type: 'document', projectId: PROJECT_ID, filePath: 'notes.md', content: 'new', oldContent: 'old' }, undefined,
    );
    expect(approvalQueue.propose).toHaveBeenCalledWith(
      { type: 'context-file', projectId: PROJECT_ID, newContent: 'ctx', oldContent: 'old ctx' }, undefined,
    );
    expect(approvalQueue.propose).toHaveBeenCalledWith({ type: 'move', projectId: PROJECT_ID, sourcePath: 'draft.md', targetPath: 'archive/draft.md' });
    expect(approvalQueue.propose).toHaveBeenCalledWith({ type: 'delete', projectId: PROJECT_ID, filePath: 'old.md', isDirectory: false });
  });

  it('emits chat-file-updated after processing a file update', () => {
    const chatState = makeChatState();
    const { deps, approvalQueue } = makeDeps(chatState);
    const router = createChatEventRouter(deps);

    const data = { projectId: PROJECT_ID, filePath: 'notes.md', content: 'new', oldContent: 'old' };
    router.handlers.onFileUpdate(data);

    expect(approvalQueue.propose).toHaveBeenCalledWith(
      { type: 'document', projectId: PROJECT_ID, filePath: 'notes.md', content: 'new', oldContent: 'old' }, undefined,
    );
    expect(deps.emitStoreEvent).toHaveBeenCalledWith({ type: 'chat-file-updated', payload: data });
  });

  it('buffers approval events for other projects and flushes them when that project initializes', async () => {
    const buffer = new Map<string, BufferedApprovalEvent[]>();
    const chatStateA = makeChatState();
    const { deps: depsA } = makeDeps(chatStateA, { buffer });
    const routerA = createChatEventRouter(depsA);

    const planActionsData = {
      projectId: OTHER_PROJECT_ID,
      actions: [{ type: 'update_item', item_id: 'x' } as never],
    };
    const fileMoveData = { projectId: OTHER_PROJECT_ID, sourcePath: 'draft.md', targetPath: 'archive/draft.md' };
    const fileDeleteData = { projectId: OTHER_PROJECT_ID, path: 'old.md', isDirectory: false };
    routerA.handlers.onPlanActions(planActionsData);
    routerA.handlers.onFileMove(fileMoveData);
    routerA.handlers.onFileDelete(fileDeleteData);
    expect(buffer.get(OTHER_PROJECT_ID)).toHaveLength(3);

    const chatStateB = makeChatState();
    const { deps: depsB, approvalQueue: approvalQueueB } = makeDeps(chatStateB, {
      buffer,
      projectId: OTHER_PROJECT_ID,
    });
    const routerB = createChatEventRouter(depsB);
    await routerB.initialize();

    expect(approvalQueueB.propose).toHaveBeenCalledWith({ type: 'plan-actions', projectId: OTHER_PROJECT_ID, actions: planActionsData.actions });
    expect(approvalQueueB.propose).toHaveBeenCalledWith({ type: 'move', projectId: OTHER_PROJECT_ID, sourcePath: 'draft.md', targetPath: 'archive/draft.md' });
    expect(approvalQueueB.propose).toHaveBeenCalledWith({ type: 'delete', projectId: OTHER_PROJECT_ID, filePath: 'old.md', isDirectory: false });
    expect(buffer.has(OTHER_PROJECT_ID)).toBe(false);
  });

  it('drops empty plan-action lists without buffering', () => {
    const buffer = new Map<string, BufferedApprovalEvent[]>();
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState, { buffer });
    const router = createChatEventRouter(deps);

    router.handlers.onPlanActions({ projectId: OTHER_PROJECT_ID, actions: [] });

    expect(buffer.size).toBe(0);
  });
});

describe('initialize', () => {
  it('loads usage and rehydrates backend sessions into the store', async () => {
    const chatState = makeChatState({ viewedSessionId: null });
    const { deps, services } = makeDeps(chatState);
    services.getActiveChatSessions.mockResolvedValue({
      success: true,
      sessions: [
        { chatSessionId: 's-live', scope: 'main', state: 'processing', title: 'Refactor plan' },
        { chatSessionId: 's-focus', scope: 'focus_document', state: 'ready', title: null },
      ],
    });
    const router = createChatEventRouter(deps);

    await router.initialize();

    expect(chatState.setTokens).toHaveBeenCalledWith(42);
    expect(chatState.markSessionActive).toHaveBeenCalledWith('s-live');
    expect(chatState.markSessionActive).not.toHaveBeenCalledWith('s-focus');
    expect(chatState.getOrCreateSession).toHaveBeenCalledWith('s-live', { hydrated: false });
    expect(chatState.setSessionTitle).toHaveBeenCalledWith('s-live', 'Refactor plan');
    expect(chatState.setRetrying).toHaveBeenCalledWith('s-live');
    expect(chatState.setSessionState).toHaveBeenCalledWith('s-live', 'processing');
    expect(chatState.setViewedSession).toHaveBeenCalledWith('s-live');
  });

  it('does not steal the viewed session when one is already focused', async () => {
    const chatState = makeChatState({ viewedSessionId: SESSION_ID });
    const { deps, services } = makeDeps(chatState);
    services.getActiveChatSessions.mockResolvedValue({
      success: true,
      sessions: [{ chatSessionId: 's-live', scope: 'main', state: 'ready', title: null }],
    });
    const router = createChatEventRouter(deps);

    await router.initialize();

    expect(chatState.setViewedSession).not.toHaveBeenCalled();
  });
});

describe('watchdog', () => {
  function makeStreamingState(lastStreamUpdateAt: number) {
    return makeChatState({
      sessions: new Map([
        [SESSION_ID, makeSession({ isStreaming: true, streamStartedAt: lastStreamUpdateAt, lastStreamUpdateAt })],
      ]),
    });
  }

  it('requires two consecutive stale polls before consulting the backend', async () => {
    let currentTime = 100_000;
    const chatState = makeStreamingState(1_000);
    const { deps, services } = makeDeps(chatState, { now: () => currentTime });
    const router = createChatEventRouter(deps);

    await router.tick();
    expect(services.getChatSessionState).not.toHaveBeenCalled();

    currentTime += 15_000;
    await router.tick();
    expect(services.getChatSessionState).toHaveBeenCalledWith(PROJECT_ID, SESSION_ID);
    expect(chatState.finalizeMessage).toHaveBeenCalledWith(SESSION_ID);
  });

  it('does not finalize while the backend still reports processing', async () => {
    const chatState = makeStreamingState(1_000);
    const { deps, services } = makeDeps(chatState, { now: () => 100_000 });
    services.getChatSessionState.mockResolvedValue({ success: true, state: 'processing' });
    const router = createChatEventRouter(deps);

    await router.tick();
    await router.tick();

    expect(services.getChatSessionState).toHaveBeenCalled();
    expect(chatState.finalizeMessage).not.toHaveBeenCalled();
  });

  it('clears suspicion when stream activity resumes between polls', async () => {
    let currentTime = 100_000;
    const session = makeSession({ isStreaming: true, streamStartedAt: 1_000, lastStreamUpdateAt: 1_000 });
    const chatState = makeChatState({ sessions: new Map([[SESSION_ID, session]]) });
    const { deps, services } = makeDeps(chatState, { now: () => currentTime });
    const router = createChatEventRouter(deps);

    await router.tick();

    // A chunk arrives: the update timestamp moves, so the next poll re-suspects
    // instead of confirming.
    session.lastStreamUpdateAt = 99_000;
    currentTime = 140_000;
    await router.tick();

    expect(services.getChatSessionState).not.toHaveBeenCalled();
    expect(chatState.finalizeMessage).not.toHaveBeenCalled();
  });

  it('ignores sessions that are not streaming or not yet stale', async () => {
    const chatState = makeChatState({
      sessions: new Map([
        ['idle', makeSession()],
        ['fresh', makeSession({ isStreaming: true, streamStartedAt: 99_000, lastStreamUpdateAt: 99_000 })],
      ]),
    });
    const { deps, services } = makeDeps(chatState, { now: () => 100_000 });
    const router = createChatEventRouter(deps);

    await router.tick();
    await router.tick();

    expect(services.getChatSessionState).not.toHaveBeenCalled();
  });
});
