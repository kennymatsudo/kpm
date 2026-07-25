import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createInitialPerSessionState } from './baseState';
import { createSessionManagementSlice } from './sessionManagementSlice';
import { createStreamingSlice } from './streamingSlice';
import { streamingBuffer } from './utils';

type SessionState = ReturnType<typeof createInitialPerSessionState>;
type SessionActions = ReturnType<typeof createSessionManagementSlice>;
type StreamingActions = ReturnType<typeof createStreamingSlice>;
type TestState = {
  sessions: Map<string, SessionState>;
  activeSessionIds: Set<string>;
  viewedSessionId: string | null;
  nextSessionNumber: number;
  startNewChatSession: () => string;
} & SessionActions & StreamingActions;

function createTestStore(
  startNewChatSession: () => string = vi.fn(() => 'session-new'),
): StoreApi<TestState> {
  const sessionA = createInitialPerSessionState(1);
  const sessionB = createInitialPerSessionState(2);

  return createStore<TestState>()((set, get) => ({
    sessions: new Map([
      ['session-a', sessionA],
      ['session-b', sessionB],
    ]),
    activeSessionIds: new Set(),
    viewedSessionId: 'session-a',
    nextSessionNumber: 3,
    startNewChatSession,
    ...createSessionManagementSlice(set as never, get as never),
    ...createStreamingSlice(set as never, get as never),
  }));
}

describe('sessionManagementSlice.setViewedSession', () => {
  beforeEach(() => {
    streamingBuffer.clearAll();
  });

  afterEach(() => {
    streamingBuffer.clearAll();
  });

  it('flushes buffered text into the previously viewed session before switching', () => {
    const store = createTestStore();

    store.getState().appendChunk('session-a', 'buffered chunk');
    store.getState().setViewedSession('session-b');

    const sessionA = store.getState().sessions.get('session-a');

    expect(store.getState().viewedSessionId).toBe('session-b');
    expect(sessionA?.streamingContent).toBe('buffered chunk');
    expect(sessionA?.streamingSegments).toEqual([{ type: 'text', content: 'buffered chunk' }]);
  });

  it('creates backend-restored session shells as unhydrated', () => {
    const store = createTestStore();

    store.getState().getOrCreateSession('session-c', { hydrated: false });

    expect(store.getState().sessions.get('session-c')?.hydrated).toBe(false);
  });

  it('marks empty existing shells as unhydrated when the backend reports them active', () => {
    const store = createTestStore();

    store.getState().getOrCreateSession('session-a', { hydrated: false });

    expect(store.getState().sessions.get('session-a')?.hydrated).toBe(false);
  });
});

describe('sessionManagementSlice.removeSession', () => {
  it('starts a fresh session when the last tab is closed', () => {
    const startNewChatSession = vi.fn(() => 'session-new');
    const store = createTestStore(startNewChatSession);

    store.getState().removeSession('session-b');
    expect(startNewChatSession).not.toHaveBeenCalled();

    store.getState().removeSession('session-a');

    expect(store.getState().sessions.size).toBe(0);
    expect(startNewChatSession).toHaveBeenCalledTimes(1);
  });

  it('falls back to a remaining tab without starting a new session', () => {
    const startNewChatSession = vi.fn(() => 'session-new');
    const store = createTestStore(startNewChatSession);

    store.getState().removeSession('session-a');

    expect(store.getState().viewedSessionId).toBe('session-b');
    expect(startNewChatSession).not.toHaveBeenCalled();
  });
});
