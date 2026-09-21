import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createInitialPerSessionState } from './baseState';
import { createSessionManagementSlice } from './sessionManagementSlice';
import { subscribe } from '../storeEvents';
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
});

describe('sessionManagementSlice.getOrCreateSession', () => {
  beforeEach(() => {
    streamingBuffer.clearAll();
  });

  afterEach(() => {
    streamingBuffer.clearAll();
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

describe('sessionManagementSlice.markSessionInactive', () => {
  beforeEach(() => {
    streamingBuffer.clearAll();
  });

  afterEach(() => {
    streamingBuffer.clearAll();
  });

  // Regression for callers that disconnect and mark a session inactive
  // WITHOUT calling finalizeMessage first (e.g. NewSessionButton) — teardown
  // must commit whatever turn was in flight, not silently discard it.
  it('commits a partial in-flight turn instead of discarding it', () => {
    const store = createTestStore();

    store.setState({
      sessions: new Map(store.getState().sessions).set('session-a', {
        ...store.getState().sessions.get('session-a')!,
        isStreaming: true,
        streamingSegments: [{ type: 'text', content: 'partial answer' }],
        streamingContent: 'partial answer',
      }),
    });

    store.getState().markSessionInactive('session-a');

    const session = store.getState().sessions.get('session-a');
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages[0].role).toBe('assistant');
    expect(session?.messages[0].segments).toEqual([{ type: 'text', content: 'partial answer' }]);
    expect(session?.isStreaming).toBe(false);
  });

  // The throttle buffer can hold text that never made it into
  // streamingSegments yet (it flushes on its own interval). Teardown must
  // flush it into the committed turn rather than dropping it.
  it('commits buffered-but-unflushed chunks accumulated via appendChunk', () => {
    const store = createTestStore();

    store.setState({
      sessions: new Map(store.getState().sessions).set('session-a', {
        ...store.getState().sessions.get('session-a')!,
        isStreaming: true,
      }),
    });
    store.getState().appendChunk('session-a', 'buffered but not yet flushed');

    store.getState().markSessionInactive('session-a');

    const session = store.getState().sessions.get('session-a');
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages[0].segments).toEqual([{ type: 'text', content: 'buffered but not yet flushed' }]);
  });
});

describe('sessionManagementSlice.removeSession', () => {
  it('announces the empty tab strip instead of opening a replacement session', () => {
    const startNewChatSession = vi.fn(() => 'session-new');
    const store = createTestStore(startNewChatSession);
    const emptied = vi.fn();
    const unsubscribe = subscribe('chat-tabs-emptied', emptied);

    store.getState().removeSession('session-b');
    expect(emptied).not.toHaveBeenCalled();

    store.getState().removeSession('session-a');

    expect(store.getState().sessions.size).toBe(0);
    expect(store.getState().viewedSessionId).toBeNull();
    expect(startNewChatSession).not.toHaveBeenCalled();
    expect(emptied).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('falls back to a remaining tab without starting a new session', () => {
    const startNewChatSession = vi.fn(() => 'session-new');
    const store = createTestStore(startNewChatSession);

    store.getState().removeSession('session-a');

    expect(store.getState().viewedSessionId).toBe('session-b');
    expect(startNewChatSession).not.toHaveBeenCalled();
  });
});
