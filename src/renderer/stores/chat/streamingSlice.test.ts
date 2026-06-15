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

  it('clears thinking content after finalizing a turn', () => {
    const sessionId = 'session-thinking';

    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: true,
      streamingThinking: 'private reasoning',
      streamingSegments: [{ type: 'text', content: 'answer' }],
      streamingContent: 'answer',
    });

    store.getState().finalizeMessage(sessionId);
    store.getState().finalizeMessage(sessionId);

    const session = store.getState().sessions.get(sessionId);
    expect(session?.streamingThinking).toBe('');
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages[0].segments).toEqual([
      { type: 'thinking', content: 'private reasoning' },
      { type: 'text', content: 'answer' },
    ]);
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

  it('promotes a queued follow-up atomically: clears its flag and re-enters streaming', () => {
    const sessionId = 'session-promote-queued';
    const queuedClientMessageId = 'promote-client-message';

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

    store.getState().finalizeMessage(sessionId, {
      promoteQueuedClientMessageId: queuedClientMessageId,
    });

    const session = store.getState().sessions.get(sessionId);
    const messages = session?.messages ?? [];
    // Assistant bubble is positioned before the promoted follow-up.
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    // The follow-up's queued flag is cleared in the same update (no stale badge).
    expect(messages[2].queued).toBeUndefined();
    expect(messages[2].clientMessageId).toBe(queuedClientMessageId);
    // Streaming re-enters for the next turn so the thinking indicator is correct.
    expect(session?.isStreaming).toBe(true);
    expect(session?.streamingSegments).toEqual([]);
    expect(session?.streamingContent).toBe('');
    expect(session?.streamStartedAt).not.toBeNull();
  });

  it('promotes the follow-up even if a racing event already stripped its queued flag', () => {
    const sessionId = 'session-promote-already-cleared';
    const queuedClientMessageId = 'race-client-message';

    // Simulate the race: `chat:queue-cleared:already_sent` arrived first and
    // removed the `queued` flag before `chat:done` finalizes the prior turn.
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
          // No `queued` flag — already cleared by the racing event.
          clientMessageId: queuedClientMessageId,
        },
      ],
    });

    store.getState().finalizeMessage(sessionId, {
      promoteQueuedClientMessageId: queuedClientMessageId,
    });

    const session = store.getState().sessions.get(sessionId);
    const messages = session?.messages ?? [];
    // Anchoring by clientMessageId (not the `queued` flag) keeps chronology
    // correct: the assistant bubble still lands before the follow-up.
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[2].clientMessageId).toBe(queuedClientMessageId);
    expect(session?.isStreaming).toBe(true);
  });

  it('clears a consumed follow-up without re-streaming and lands the bubble after it', () => {
    const sessionId = 'session-consumed-followup';
    const consumedClientMessageId = 'consumed-client-message';

    // The SDK steered "follow-up" into this turn and answered it. The turn's
    // result carries that text; the follow-up bubble was added optimistically
    // with queued=true and must now drop its badge — but NOT spawn a new turn.
    const store = createTestStore(sessionId, {
      ...base,
      isStreaming: true,
      streamingSegments: [{ type: 'text', content: 'answer to the follow-up' }],
      streamingContent: 'answer to the follow-up',
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
          segments: [{ type: 'text', content: 'follow-up while streaming' }],
          timestamp: new Date('2026-01-01T00:00:01.000Z'),
          queued: true,
          clientMessageId: consumedClientMessageId,
        },
      ],
    });

    store.getState().finalizeMessage(sessionId, {
      clearQueuedClientMessageId: consumedClientMessageId,
    });

    const session = store.getState().sessions.get(sessionId);
    const messages = session?.messages ?? [];
    // Chronology: the follow-up was answered by THIS turn, so the assistant
    // bubble lands AFTER it (not before, as in the promotion case).
    expect(messages.map((message) => message.role)).toEqual(['user', 'user', 'assistant']);
    // The consumed follow-up's queued badge is cleared.
    expect(messages[1].clientMessageId).toBe(consumedClientMessageId);
    expect(messages[1].queued).toBeUndefined();
    // No phantom turn: streaming ends, indicator goes away.
    expect(session?.isStreaming).toBe(false);
    expect(session?.streamStartedAt).toBeNull();
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

describe('streamingSlice tool interleaving', () => {
  it('drops committed tools from the live activities list when text follows', () => {
    // Discovery flow: tools run first, then the model streams its analysis.
    // Once the tools land in an inline segment they must leave `activities` so
    // the streaming view stops re-rendering them pinned at the bottom.
    const sessionId = 'session-interleave';
    const t1 = makeActivity('t1', 'bash: rg ssrf');
    const t2 = makeActivity('t2', 'read_file: views.py');

    // viewedSessionId stays null -> appendChunk takes the synchronous
    // (non-viewed) branch, which shares the pruning logic with the viewed one.
    const store = createTestStore(sessionId, { ...base, isStreaming: true });

    store.getState().addActivity(sessionId, t1);
    store.getState().addActivity(sessionId, t2);
    expect(store.getState().sessions.get(sessionId)?.activities).toEqual([t1, t2]);

    store.getState().appendChunk(sessionId, 'So the proxy already exists.', 0, [t1, t2]);

    const session = store.getState().sessions.get(sessionId);
    expect(session?.streamingSegments).toEqual([
      { type: 'activity', activities: [t1, t2] },
      { type: 'text', content: 'So the proxy already exists.' },
    ]);
    // The committed batch is gone from the live list; only an in-flight batch
    // would remain to drive the trailing "active" group.
    expect(session?.activities).toEqual([]);
    expect(session?.pendingActivities).toEqual([]);
  });

  it('keeps an uncommitted in-flight batch in the live activities list', () => {
    // Tools that arrive after the latest text have no following text yet, so
    // they stay live and render as the trailing active group (correct: they
    // are the latest action).
    const sessionId = 'session-inflight';
    const committed = makeActivity('c1', 'bash: ls');
    const inflight = makeActivity('f1', 'read_file: composer.py');

    const store = createTestStore(sessionId, { ...base, isStreaming: true });

    store.getState().addActivity(sessionId, committed);
    store.getState().appendChunk(sessionId, 'Reading the file.', 0, [committed]);
    // A fresh tool starts after that text, with no text after it yet.
    store.getState().addActivity(sessionId, inflight);

    const session = store.getState().sessions.get(sessionId);
    expect(session?.activities).toEqual([inflight]);
  });
});
