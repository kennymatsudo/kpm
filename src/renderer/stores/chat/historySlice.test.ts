import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { getChatSessionHistory, loadChatSession } from '../../services/chatService';
import { createInitialChatState, createInitialPerSessionState } from './baseState';
import { createHistorySlice } from './historySlice';

vi.mock('../../services/chatService', () => ({
  getChatSessionHistory: vi.fn(),
  loadChatSession: vi.fn(),
}));

function createTestStore() {
  return createStore<ReturnType<typeof createInitialChatState> & ReturnType<typeof createHistorySlice>>()((set, get) => ({
    ...createInitialChatState(),
    ...createHistorySlice(set as never, get as never),
  }));
}

describe('historySlice.restoreLastSession', () => {
  beforeEach(() => {
    vi.mocked(getChatSessionHistory).mockReset();
    vi.mocked(loadChatSession).mockReset();
  });

  it('does not write session history after the restore guard becomes stale', async () => {
    const store = createTestStore();
    let shouldContinue = true;

    vi.mocked(getChatSessionHistory).mockResolvedValue({
      success: true,
      sessions: [{
        chat_session_id: 'chat-a',
        title: null,
        first_message: 'Hello',
        message_count: 2,
        created_at: '2026-01-01T00:00:00.000Z',
      }],
    });

    const restore = store.getState().restoreLastSession('project-a', () => shouldContinue);
    shouldContinue = false;
    await restore;

    expect(store.getState().sessionHistory).toEqual([]);
    expect(loadChatSession).not.toHaveBeenCalled();
  });

  it('does not load messages after the load guard becomes stale', async () => {
    const store = createTestStore();
    let shouldContinue = true;

    vi.mocked(loadChatSession).mockResolvedValue({
      success: true,
      messages: [{
        id: 'message-1',
        session_id: 'project-a',
        chat_session_id: 'chat-a',
        provider: 'claude',
        role: 'user',
        content: 'Hello',
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      chatSessionId: 'chat-a',
    });

    const load = store.getState().loadFromHistory('project-a', 'chat-a', () => shouldContinue);
    shouldContinue = false;
    await load;

    expect(store.getState().viewedSessionId).toBeNull();
    expect(store.getState().sessions.has('chat-a')).toBe(false);
  });

  it('restores the most recent session when the guard remains current', async () => {
    const store = createTestStore();

    vi.mocked(getChatSessionHistory).mockResolvedValue({
      success: true,
      sessions: [{
        chat_session_id: 'chat-a',
        title: null,
        first_message: 'Hello',
        message_count: 2,
        created_at: '2026-01-01T00:00:00.000Z',
      }],
    });
    vi.mocked(loadChatSession).mockResolvedValue({
      success: true,
      messages: [{
        id: 'message-1',
        session_id: 'project-a',
        chat_session_id: 'chat-a',
        provider: 'claude',
        role: 'user',
        content: 'Hello',
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      chatSessionId: 'chat-a',
    });

    await store.getState().restoreLastSession('project-a', () => true);

    expect(store.getState().sessionHistory).toHaveLength(1);
    expect(store.getState().viewedSessionId).toBe('chat-a');
    expect(store.getState().sessions.get('chat-a')?.messages).toEqual([{
      id: 'message-1',
      role: 'user',
      segments: [{ type: 'text', content: 'Hello' }],
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
    }]);
  });

  // Regression: after Cmd+R reload the IPC bridge restores active backend
  // sessions as empty placeholders (correct id, no messages). restoreLastSession
  // must hydrate them rather than bail because viewedSessionId is set.
  it('hydrates an existing empty placeholder session instead of bailing', async () => {
    const store = createTestStore();

    // Simulate the IPC bridge having already created an empty session and
    // pointed viewedSessionId at it.
    store.setState({
      viewedSessionId: 'chat-a',
      sessions: new Map([
        ['chat-a', {
          messages: [],
          streamingSegments: [],
          streamingContent: '',
          streamingThinking: '',
          pendingActivities: [],
          isStreaming: false,
          error: null,
          activities: [],
          sessionState: 'idle',
          streamStartedAt: null,
          lastStreamUpdateAt: null,
          draftMessage: '',
          pendingAttachments: [],
          suggestions: [],
          sessionNumber: 1,
          model: 'sonnet',
          effort: 'medium',
          provider: 'claude',
          codexModel: 'gpt-5.5',
          piProviderModel: undefined,
          claudeSessionId: null,
          title: null,
          mcpDegraded: false,
          mcpError: null,
          lastTurnUsage: null,
          hydrated: true,
        }],
      ]),
    });

    vi.mocked(getChatSessionHistory).mockResolvedValue({
      success: true,
      sessions: [{
        chat_session_id: 'chat-a',
        title: null,
        first_message: 'Hello',
        message_count: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      }],
    });
    vi.mocked(loadChatSession).mockResolvedValue({
      success: true,
      messages: [{
        id: 'message-1',
        session_id: 'project-a',
        chat_session_id: 'chat-a',
        provider: 'claude',
        role: 'user',
        content: 'Hello',
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      chatSessionId: 'chat-a',
    });

    await store.getState().restoreLastSession('project-a', () => true);

    expect(store.getState().sessions.get('chat-a')?.messages).toHaveLength(1);
    expect(loadChatSession).toHaveBeenCalledWith('project-a', 'chat-a');
  });

  it('keeps a non-empty viewed session intact (no redundant reload)', async () => {
    const store = createTestStore();

    store.setState({
      viewedSessionId: 'chat-a',
      sessions: new Map([
        ['chat-a', {
          messages: [{
            id: 'm1',
            role: 'user',
            segments: [{ type: 'text', content: 'Existing' }],
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
          }],
          streamingSegments: [],
          streamingContent: '',
          streamingThinking: '',
          pendingActivities: [],
          isStreaming: false,
          error: null,
          activities: [],
          sessionState: 'idle',
          streamStartedAt: null,
          lastStreamUpdateAt: null,
          draftMessage: '',
          pendingAttachments: [],
          suggestions: [],
          sessionNumber: 1,
          model: 'sonnet',
          effort: 'medium',
          provider: 'claude',
          codexModel: 'gpt-5.5',
          piProviderModel: undefined,
          claudeSessionId: null,
          title: null,
          mcpDegraded: false,
          mcpError: null,
          lastTurnUsage: null,
          hydrated: true,
        }],
      ]),
    });

    vi.mocked(getChatSessionHistory).mockResolvedValue({
      success: true,
      sessions: [{
        chat_session_id: 'chat-b',
        title: null,
        first_message: 'Other',
        message_count: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      }],
    });

    await store.getState().restoreLastSession('project-a', () => true);

    expect(loadChatSession).not.toHaveBeenCalled();
    expect(store.getState().viewedSessionId).toBe('chat-a');
  });

  it('preserves live stream state when hydrating a backend-restored active session', async () => {
    const store = createTestStore();
    const activeShell = {
      ...createInitialPerSessionState(1),
      hydrated: false,
      isStreaming: true,
      sessionState: 'processing' as const,
      streamingContent: 'partial',
      streamingThinking: 'thinking',
      streamingSegments: [{ type: 'text' as const, content: 'partial' }],
      pendingActivities: [{ id: 'activity-1', type: 'command' as const, label: 'Running tests' }],
      activities: [{ id: 'activity-2', type: 'command' as const, label: 'Reading files' }],
      streamStartedAt: 100,
      lastStreamUpdateAt: 200,
    };

    store.setState({
      viewedSessionId: 'chat-a',
      sessions: new Map([['chat-a', activeShell]]),
    });

    vi.mocked(loadChatSession).mockResolvedValue({
      success: true,
      messages: [{
        id: 'message-1',
        session_id: 'project-a',
        chat_session_id: 'chat-a',
        provider: 'claude',
        role: 'user',
        content: 'Hello',
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      chatSessionId: 'chat-a',
    });

    await store.getState().loadFromHistory('project-a', 'chat-a', () => true);

    const session = store.getState().sessions.get('chat-a');
    expect(session?.hydrated).toBe(true);
    expect(session?.messages).toHaveLength(1);
    expect(session?.isStreaming).toBe(true);
    expect(session?.sessionState).toBe('processing');
    expect(session?.streamingContent).toBe('partial');
    expect(session?.streamingThinking).toBe('thinking');
    expect(session?.streamingSegments).toEqual([{ type: 'text', content: 'partial' }]);
    expect(session?.pendingActivities).toEqual([{ id: 'activity-1', type: 'command', label: 'Running tests' }]);
    expect(session?.activities).toEqual([{ id: 'activity-2', type: 'command', label: 'Reading files' }]);
    expect(session?.streamStartedAt).toBe(100);
    expect(session?.lastStreamUpdateAt).toBe(200);
  });
});

describe('historySlice.loadFromHistory turn merging', () => {
  beforeEach(() => {
    vi.mocked(getChatSessionHistory).mockReset();
    vi.mocked(loadChatSession).mockReset();
  });

  // Mirrors the live-session merge in `finalizeMessage` (streamingSlice.ts):
  // consecutive assistant rows with no user row between them are turns from
  // the same merged exchange (e.g. periodic check-ins on a forked background
  // agent) and must render as one card on reload too, not the old chunky
  // per-turn cards.
  it('folds consecutive assistant rows into one merged message with a checkpoint divider', async () => {
    const store = createTestStore();

    vi.mocked(loadChatSession).mockResolvedValue({
      success: true,
      messages: [
        {
          id: 'message-1',
          session_id: 'project-a',
          chat_session_id: 'chat-a',
          provider: 'claude',
          role: 'user',
          content: 'Explain the history mechanism',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'message-2',
          session_id: 'project-a',
          chat_session_id: 'chat-a',
          provider: 'claude',
          role: 'assistant',
          content: "I'll wait for the background research agent to finish.",
          created_at: '2026-01-01T00:00:05.000Z',
        },
        {
          id: 'message-3',
          session_id: 'project-a',
          chat_session_id: 'chat-a',
          provider: 'claude',
          role: 'assistant',
          content: 'The research agent finished — here is what it found.',
          created_at: '2026-01-01T00:01:20.000Z',
        },
      ],
      chatSessionId: 'chat-a',
    });

    await store.getState().loadFromHistory('project-a', 'chat-a', () => true);

    const messages = store.getState().sessions.get('chat-a')?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    // The merged message keeps the id of the first turn in the run.
    expect(messages[1].id).toBe('message-2');
    expect(messages[1].segments).toEqual([
      { type: 'text', content: "I'll wait for the background research agent to finish." },
      { type: 'checkpoint', timestamp: new Date('2026-01-01T00:01:20.000Z').getTime() },
      { type: 'text', content: 'The research agent finished — here is what it found.' },
    ]);
  });
});
