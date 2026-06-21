import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
} & SessionActions & StreamingActions;

function createTestStore(): StoreApi<TestState> {
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
    ...createSessionManagementSlice(set as never, get as never),
    ...createStreamingSlice(set as never, get as never),
  }));
}

describe('sessionManagementSlice.setViewedSession', () => {
  beforeEach(() => {
    streamingBuffer.clear();
  });

  afterEach(() => {
    streamingBuffer.clear();
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
