import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { getChatSessionHistory, loadChatSession } from '../../services/chatService';
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
});
