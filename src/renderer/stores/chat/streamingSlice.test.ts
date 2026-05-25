import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createInitialPerSessionState } from './baseState';
import { createStreamingSlice } from './streamingSlice';
import type { Activity } from '../../../shared/types';

type SessionState = ReturnType<typeof createInitialPerSessionState>;
type StreamingActions = ReturnType<typeof createStreamingSlice>;
type TestState = {
  sessions: Map<string, SessionState>;
  viewedSessionId: string | null;
} & StreamingActions;

function createTestStore(sessionId: string, session: SessionState) {
  return createStore<TestState>()((set, get) => ({
    sessions: new Map([[sessionId, session]]),
    viewedSessionId: null,
    ...createStreamingSlice(set as never, get as never),
  }));
}

function makeActivity(id: string, label: string): Activity {
  return { id, type: 'command', label };
}

describe('streamingSlice.finalizeMessage', () => {
  it('commits activity-only turns as an assistant message', () => {
    const sessionId = 'session-activity-only';
    const activities = [
      makeActivity('a1', 'Running: npm test'),
      makeActivity('a2', 'edit: src/file.ts'),
    ];

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: true,
      activities,
    });

    store.getState().finalizeMessage(sessionId);

    const session = store.getState().sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages[0].role).toBe('assistant');
    expect(session?.messages[0].segments).toEqual([
      { type: 'activity', activities },
    ]);
    expect(session?.isStreaming).toBe(false);
    expect(session?.activities).toEqual([]);
  });

  it('commits pending activities even when no text was streamed', () => {
    const sessionId = 'session-pending-activities';
    const pendingActivities = [makeActivity('p1', 'Read: src/main.ts')];

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: true,
      pendingActivities,
    });

    store.getState().finalizeMessage(sessionId);

    const session = store.getState().sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages[0].segments).toEqual([
      { type: 'activity', activities: pendingActivities },
    ]);
    expect(session?.pendingActivities).toEqual([]);
    expect(session?.isStreaming).toBe(false);
  });

  it('is idempotent when finalize is called repeatedly after completion', () => {
    const sessionId = 'session-idempotent';
    const activities = [makeActivity('i1', 'Thinking...')];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: true,
      activities,
    });

    store.getState().finalizeMessage(sessionId);
    store.getState().finalizeMessage(sessionId);

    const session = store.getState().sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.messages).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('inserts a completed assistant turn before a promoted queued user message', () => {
    const sessionId = 'session-queued-follow-up';
    const queuedClientMessageId = 'queued-client-message';

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: true,
      streamingSegments: [{ type: 'text', content: 'first answer' }],
      streamingContent: 'first answer',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          segments: [{ type: 'text', content: 'first prompt' }],
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'user-2',
          role: 'user',
          segments: [{ type: 'text', content: 'queued prompt' }],
          timestamp: new Date('2026-01-01T00:00:01.000Z'),
          queued: true,
          clientMessageId: queuedClientMessageId,
        },
      ],
    });

    store.getState().finalizeMessage(sessionId, { beforeClientMessageId: queuedClientMessageId });

    const messages = store.getState().sessions.get(sessionId)?.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[1].segments).toEqual([{ type: 'text', content: 'first answer' }]);
    expect(messages[2].clientMessageId).toBe(queuedClientMessageId);
  });
});

describe('streamingSlice streaming state recovery', () => {
  it('appendChunk re-enters streaming state when chunks arrive', () => {
    const sessionId = 'session-recovery-chunk';

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: false,
      streamStartedAt: null,
    });

    store.getState().appendChunk(sessionId, 'hello');

    const session = store.getState().sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.isStreaming).toBe(true);
    expect(session?.streamStartedAt).not.toBeNull();
    expect(session?.streamingSegments).toEqual([{ type: 'text', content: 'hello' }]);
  });

  it('addActivity re-enters streaming state when activity arrives', () => {
    const sessionId = 'session-recovery-activity';
    const activity = makeActivity('ar1', 'Running: yarn test');

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: false,
      streamStartedAt: null,
    });

    store.getState().addActivity(sessionId, activity);

    const session = store.getState().sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.isStreaming).toBe(true);
    expect(session?.streamStartedAt).not.toBeNull();
    expect(session?.activities).toEqual([activity]);
  });
});
