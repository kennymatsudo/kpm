import { describe, expect, it } from 'vitest';
import { createInitialPerSessionState } from './baseState';
import { applyStreamEvent, isStreamStale } from './chatStreamReducer';
import type { Activity } from '../../../shared/types';
import type { Message } from './types';

function makeActivity(id: string, label: string): Activity {
  return { id, type: 'command', label };
}

describe('applyStreamEvent chunk', () => {
  it('appends a chunk into streamingSegments/content and re-enters streaming', () => {
    const session = { ...createInitialPerSessionState(1), isStreaming: false, streamStartedAt: null };

    const next = applyStreamEvent(session, { type: 'chunk', text: 'hello' });

    expect(next.isStreaming).toBe(true);
    expect(next.streamStartedAt).not.toBeNull();
    expect(next.streamingSegments).toEqual([{ type: 'text', content: 'hello' }]);
    expect(next.streamingContent).toBe('hello');
  });

  it('folds queued activities into an inline segment before the next chunk and drops them from the live list', () => {
    const t1 = makeActivity('t1', 'bash: rg ssrf');
    const t2 = makeActivity('t2', 'read_file: views.py');
    const session = { ...createInitialPerSessionState(1), isStreaming: true, activities: [t1, t2] };

    const queued = applyStreamEvent(session, { type: 'queue-activities', activities: [t1, t2] });
    const next = applyStreamEvent(queued, { type: 'chunk', text: 'So the proxy already exists.' });

    expect(next.streamingSegments).toEqual([
      { type: 'activity', activities: [t1, t2] },
      { type: 'text', content: 'So the proxy already exists.' },
    ]);
    expect(next.activities).toEqual([]);
    expect(next.pendingActivities).toEqual([]);
  });

  it('behaves identically whether the session is viewed or unviewed (buffering is a bridge-layer concern)', () => {
    const base = { ...createInitialPerSessionState(1), isStreaming: true };

    const viewedResult = applyStreamEvent(base, { type: 'chunk', text: 'chunk one' });
    const unviewedResult = applyStreamEvent(base, { type: 'chunk', text: 'chunk one' });

    expect(viewedResult.streamingSegments).toEqual(unviewedResult.streamingSegments);
    expect(viewedResult.streamingContent).toEqual(unviewedResult.streamingContent);
  });
});

describe('applyStreamEvent queue-activities / flush', () => {
  it('queue-activities only accumulates pendingActivities, without touching segments or streaming flags', () => {
    const activity = makeActivity('a1', 'Running: npm test');
    const session = { ...createInitialPerSessionState(1), isStreaming: false, streamStartedAt: null };

    const next = applyStreamEvent(session, { type: 'queue-activities', activities: [activity] });

    expect(next.pendingActivities).toEqual([activity]);
    expect(next.streamingSegments).toEqual([]);
    expect(next.isStreaming).toBe(false);
    expect(next.streamStartedAt).toBeNull();
  });

  it('flush appends raw text onto the last segment without committing pendingActivities or touching streaming flags', () => {
    const activity = makeActivity('a1', 'Running: npm test');
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: false,
      streamStartedAt: null,
      lastStreamUpdateAt: null,
      pendingActivities: [activity],
      streamingSegments: [{ type: 'text' as const, content: 'partial ' }],
      streamingContent: 'partial ',
    };

    const next = applyStreamEvent(session, { type: 'flush', text: 'answer' });

    expect(next.streamingSegments).toEqual([{ type: 'text', content: 'partial answer' }]);
    expect(next.streamingContent).toBe('partial answer');
    // Unlike `chunk`, `flush` doesn't commit pendingActivities or flip streaming flags.
    expect(next.pendingActivities).toEqual([activity]);
    expect(next.isStreaming).toBe(false);
    expect(next.streamStartedAt).toBeNull();
  });

  it('flush with empty text is a no-op', () => {
    const session = createInitialPerSessionState(1);

    const next = applyStreamEvent(session, { type: 'flush', text: '' });

    expect(next).toBe(session);
  });
});

describe('applyStreamEvent thinking/activity', () => {
  it('accumulates thinking text with a blank-line separator', () => {
    const session = createInitialPerSessionState(1);

    const afterFirst = applyStreamEvent(session, { type: 'thinking', text: 'first thought' });
    const afterSecond = applyStreamEvent(afterFirst, { type: 'thinking', text: 'second thought' });

    expect(afterSecond.streamingThinking).toBe('first thought\n\nsecond thought');
    expect(afterSecond.isStreaming).toBe(true);
  });

  it('activity-start re-enters streaming and keeps only the last 5 plus the new one', () => {
    const session = { ...createInitialPerSessionState(1), isStreaming: false, streamStartedAt: null };

    const next = applyStreamEvent(session, { type: 'activity-start', activity: makeActivity('a1', 'Running: npm test') });

    expect(next.isStreaming).toBe(true);
    expect(next.activities).toEqual([makeActivity('a1', 'Running: npm test')]);
  });

  it('activity-update patches the activity in place across activities, pendingActivities, streamingSegments, and messages', () => {
    const activity = makeActivity('a1', 'Running: npm test');
    const updated: Activity = { ...activity, detail: 'done', diffStats: { additions: 1, deletions: 0 } };
    const session = {
      ...createInitialPerSessionState(1),
      activities: [activity],
      pendingActivities: [activity],
      streamingSegments: [{ type: 'activity' as const, activities: [activity] }],
      messages: [
        {
          id: 'm1',
          role: 'assistant' as const,
          segments: [{ type: 'activity' as const, activities: [activity] }],
          timestamp: new Date(),
        },
      ],
    };

    const next = applyStreamEvent(session, { type: 'activity-update', activity: updated });

    expect(next.activities).toEqual([updated]);
    expect(next.pendingActivities).toEqual([updated]);
    expect(next.streamingSegments).toEqual([{ type: 'activity', activities: [updated] }]);
    expect(next.messages[0].segments).toEqual([{ type: 'activity', activities: [updated] }]);
  });
});

describe('applyStreamEvent done: finalization', () => {
  it('commits activity-only turns as an assistant message', () => {
    const activities = [makeActivity('a1', 'Running: npm test'), makeActivity('a2', 'edit: src/file.ts')];
    const session = { ...createInitialPerSessionState(1), isStreaming: true, activities };

    const next = applyStreamEvent(session, { type: 'done' });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].role).toBe('assistant');
    expect(next.messages[0].segments).toEqual([{ type: 'activity', activities }]);
    expect(next.isStreaming).toBe(false);
    expect(next.activities).toEqual([]);
  });

  it('folds a trailing buffered flush (the throttle buffer\'s last unflushed content) into the final segment', () => {
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamingSegments: [{ type: 'text' as const, content: 'partial ' }],
      streamingContent: 'partial ',
    };

    const next = applyStreamEvent(session, { type: 'done', buffered: 'answer' });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].segments).toEqual([{ type: 'text', content: 'partial answer' }]);
  });

  it('is idempotent when done is dispatched repeatedly after completion', () => {
    const session = { ...createInitialPerSessionState(1), isStreaming: true, activities: [makeActivity('i1', 'Thinking...')] };

    const afterFirst = applyStreamEvent(session, { type: 'done' });
    const afterSecond = applyStreamEvent(afterFirst, { type: 'done' });

    expect(afterSecond.messages).toHaveLength(1);
    expect(afterSecond).toEqual(afterFirst);
  });

  it('clears thinking content and prepends it as a thinking segment', () => {
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamingThinking: 'private reasoning',
      streamingSegments: [{ type: 'text' as const, content: 'answer' }],
      streamingContent: 'answer',
    };

    const next = applyStreamEvent(session, { type: 'done' });

    expect(next.streamingThinking).toBe('');
    expect(next.messages[0].segments).toEqual([
      { type: 'thinking', content: 'private reasoning' },
      { type: 'text', content: 'answer' },
    ]);
  });

  it('merges a second turn into the previous message when no user message intervened', () => {
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamStartedAt: Date.now() - 5000,
      streamingSegments: [{ type: 'text' as const, content: 'checking in on the background agent' }],
      streamingContent: 'checking in on the background agent',
    };

    const afterFirst = applyStreamEvent(session, { type: 'done', options: { model: 'claude-sonnet-4-6' } });
    expect(afterFirst.messages).toHaveLength(1);
    const firstMessage = afterFirst.messages[0];

    const secondTurnStarted = {
      ...afterFirst,
      isStreaming: true,
      streamStartedAt: Date.now(),
      streamingSegments: [{ type: 'text' as const, content: 'the research agent finished' }],
      streamingContent: 'the research agent finished',
    };

    const afterSecond = applyStreamEvent(secondTurnStarted, { type: 'done', options: { model: 'claude-sonnet-4-6' } });

    expect(afterSecond.messages).toHaveLength(1);
    const merged = afterSecond.messages[0];
    expect(merged.id).toBe(firstMessage.id);
    expect(merged.segments).toEqual([
      { type: 'text', content: 'checking in on the background agent' },
      expect.objectContaining({ type: 'checkpoint' }),
      { type: 'text', content: 'the research agent finished' },
    ]);
  });

  it('does not merge into an interrupted message — interruption always forces a new bubble', () => {
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamStartedAt: Date.now(),
      streamingSegments: [{ type: 'text' as const, content: 'cut off mid-thought' }],
      streamingContent: 'cut off mid-thought',
    };

    const afterInterrupted = applyStreamEvent(session, { type: 'done', options: { interrupted: true } });

    const secondTurnStarted = {
      ...afterInterrupted,
      isStreaming: true,
      streamStartedAt: Date.now(),
      streamingSegments: [{ type: 'text' as const, content: 'fresh answer' }],
      streamingContent: 'fresh answer',
    };

    const afterSecond = applyStreamEvent(secondTurnStarted, { type: 'done' });

    expect(afterSecond.messages).toHaveLength(2);
    expect(afterSecond.messages[0].interrupted).toBe(true);
    expect(afterSecond.messages[1].segments).toEqual([{ type: 'text', content: 'fresh answer' }]);
  });
});

describe('applyStreamEvent done: queued follow-up promote/consume/clear', () => {
  const queuedClientMessageId = 'queued-client-message';

  function sessionWithQueuedFollowUp(extra?: Partial<Message>) {
    return {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamingSegments: [{ type: 'text' as const, content: 'first answer' }],
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
          ...extra,
        },
      ] as Message[],
    };
  }

  it('inserts the finalized turn before a message anchored by beforeClientMessageId', () => {
    const session = sessionWithQueuedFollowUp();

    const next = applyStreamEvent(session, { type: 'done', options: { beforeClientMessageId: queuedClientMessageId } });

    expect(next.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(next.messages[1].segments).toEqual([{ type: 'text', content: 'first answer' }]);
    expect(next.messages[2].clientMessageId).toBe(queuedClientMessageId);
  });

  it('promotes a queued follow-up atomically: clears its flag and re-enters streaming', () => {
    const session = sessionWithQueuedFollowUp();

    const next = applyStreamEvent(session, { type: 'done', options: { promoteQueuedClientMessageId: queuedClientMessageId } });

    expect(next.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(next.messages[2].queued).toBeUndefined();
    expect(next.messages[2].clientMessageId).toBe(queuedClientMessageId);
    expect(next.isStreaming).toBe(true);
    expect(next.streamingSegments).toEqual([]);
    expect(next.streamingContent).toBe('');
    expect(next.streamStartedAt).not.toBeNull();
  });

  it('promotes even if a racing event already stripped the queued flag (anchors by clientMessageId, not the flag)', () => {
    const session = sessionWithQueuedFollowUp();
    const { queued: _queued, ...messageWithoutQueuedFlag } = session.messages[1];
    session.messages[1] = messageWithoutQueuedFlag;

    const next = applyStreamEvent(session, { type: 'done', options: { promoteQueuedClientMessageId: queuedClientMessageId } });

    expect(next.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(next.messages[2].clientMessageId).toBe(queuedClientMessageId);
    expect(next.isStreaming).toBe(true);
  });

  it('clears a consumed follow-up without re-streaming and lands the bubble after it', () => {
    const session = sessionWithQueuedFollowUp();

    const next = applyStreamEvent(session, { type: 'done', options: { clearQueuedClientMessageId: queuedClientMessageId } });

    expect(next.messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
    expect(next.messages[1].clientMessageId).toBe(queuedClientMessageId);
    expect(next.messages[1].queued).toBeUndefined();
    expect(next.isStreaming).toBe(false);
    expect(next.streamStartedAt).toBeNull();
  });

  it('lands the bubble after a consumed follow-up but before a deferred one (mixed turn)', () => {
    const consumedClientMessageId = 'consumed-client-message';
    const deferredClientMessageId = 'deferred-client-message';
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamingSegments: [{ type: 'text' as const, content: 'answer incorporating the interjection' }],
      streamingContent: 'answer incorporating the interjection',
      messages: [
        {
          id: 'user-1',
          role: 'user' as const,
          segments: [{ type: 'text' as const, content: 'first prompt' }],
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'user-2',
          role: 'user' as const,
          segments: [{ type: 'text' as const, content: 'consumed follow-up' }],
          timestamp: new Date('2026-01-01T00:00:01.000Z'),
          queued: true,
          liveFollowUp: true,
          clientMessageId: consumedClientMessageId,
        },
        {
          id: 'user-3',
          role: 'user' as const,
          segments: [{ type: 'text' as const, content: 'deferred follow-up' }],
          timestamp: new Date('2026-01-01T00:00:02.000Z'),
          queued: true,
          liveFollowUp: true,
          clientMessageId: deferredClientMessageId,
        },
      ],
    };

    const next = applyStreamEvent(session, {
      type: 'done',
      options: {
        beforeClientMessageId: deferredClientMessageId,
        promoteQueuedClientMessageId: deferredClientMessageId,
        clearQueuedClientMessageId: consumedClientMessageId,
      },
    });

    expect(next.messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(next.messages[1].clientMessageId).toBe(consumedClientMessageId);
    expect(next.messages[1].queued).toBeUndefined();
    expect(next.messages[3].clientMessageId).toBe(deferredClientMessageId);
    expect(next.messages[3].queued).toBeUndefined();
    expect(next.isStreaming).toBe(true);
  });
});

describe('applyStreamEvent retry', () => {
  it('re-enters streaming and clears prior error/activities so a resumed turn starts clean', () => {
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: false,
      error: 'previous failure',
      activities: [makeActivity('a1', 'stale')],
      streamingContent: 'stale content',
      streamingThinking: 'stale thought',
      streamingSegments: [{ type: 'text' as const, content: 'stale content' }],
      pendingActivities: [makeActivity('p1', 'stale pending')],
      suggestions: ['old suggestion'],
      streamStartedAt: null,
      lastStreamUpdateAt: null,
    };

    const next = applyStreamEvent(session, { type: 'retry' });

    expect(next.isStreaming).toBe(true);
    expect(next.error).toBeNull();
    expect(next.activities).toEqual([]);
    expect(next.streamingContent).toBe('');
    expect(next.streamingThinking).toBe('');
    expect(next.streamingSegments).toEqual([]);
    expect(next.pendingActivities).toEqual([]);
    expect(next.suggestions).toEqual([]);
    expect(next.streamStartedAt).not.toBeNull();
    expect(next.lastStreamUpdateAt).not.toBeNull();
  });
});

describe('applyStreamEvent error', () => {
  it('sets the error, ends streaming, and clears in-flight streaming state', () => {
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamingContent: 'partial',
      streamingThinking: 'partial thought',
      activities: [makeActivity('a1', 'Running')],
      streamingSegments: [{ type: 'text' as const, content: 'partial' }],
      pendingActivities: [makeActivity('p1', 'pending')],
      streamStartedAt: Date.now(),
      lastStreamUpdateAt: Date.now(),
    };

    const next = applyStreamEvent(session, { type: 'error', error: 'boom' });

    expect(next.error).toBe('boom');
    expect(next.isStreaming).toBe(false);
    expect(next.streamingContent).toBe('');
    expect(next.streamingThinking).toBe('');
    expect(next.activities).toEqual([]);
    expect(next.streamingSegments).toEqual([]);
    expect(next.pendingActivities).toEqual([]);
    expect(next.streamStartedAt).toBeNull();
    expect(next.lastStreamUpdateAt).toBeNull();
  });
});

describe('applyStreamEvent queue-cleared', () => {
  it('already-sent: clears the queued flag but keeps the bubble', () => {
    const clientMessageId = 'race-message';
    const session = {
      ...createInitialPerSessionState(1),
      messages: [
        {
          id: 'user-1',
          role: 'user' as const,
          segments: [{ type: 'text' as const, content: 'hi' }],
          timestamp: new Date(),
          queued: true,
          clientMessageId,
        },
      ],
    };

    const next = applyStreamEvent(session, { type: 'queue-cleared-already-sent', clientMessageId });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].queued).toBeUndefined();
    expect(next.messages[0].clientMessageId).toBe(clientMessageId);
  });

  it('dropped: removes the queued bubble entirely (cancelled or disconnected)', () => {
    const clientMessageId = 'cancelled-message';
    const session = {
      ...createInitialPerSessionState(1),
      messages: [
        {
          id: 'user-1',
          role: 'user' as const,
          segments: [{ type: 'text' as const, content: 'hi' }],
          timestamp: new Date(),
          queued: true,
          liveFollowUp: true,
          clientMessageId,
        },
      ],
    };

    const next = applyStreamEvent(session, { type: 'queue-cleared-dropped', clientMessageId });

    expect(next.messages).toHaveLength(0);
  });

  it('dropped with no clientMessageId is a no-op', () => {
    const session = createInitialPerSessionState(1);

    const next = applyStreamEvent(session, { type: 'queue-cleared-dropped' });

    expect(next).toBe(session);
  });
});

describe('isStreamStale', () => {
  it('is false when the session is not streaming', () => {
    const session = { ...createInitialPerSessionState(1), isStreaming: false };
    expect(isStreamStale(session, Date.now())).toBe(false);
  });

  it('is false when the last update is within the staleness threshold', () => {
    const now = Date.now();
    const session = { ...createInitialPerSessionState(1), isStreaming: true, lastStreamUpdateAt: now - 10_000 };
    expect(isStreamStale(session, now)).toBe(false);
  });

  it('is true once the last update exceeds the staleness threshold', () => {
    const now = Date.now();
    const session = { ...createInitialPerSessionState(1), isStreaming: true, lastStreamUpdateAt: now - 30_000 };
    expect(isStreamStale(session, now)).toBe(true);
  });

  it('falls back to streamStartedAt when no chunk/activity has landed yet', () => {
    const now = Date.now();
    const session = {
      ...createInitialPerSessionState(1),
      isStreaming: true,
      streamStartedAt: now - 31_000,
      lastStreamUpdateAt: null,
    };
    expect(isStreamStale(session, now)).toBe(true);
  });

  it('is false when streaming but no timestamps have been set at all', () => {
    const session = { ...createInitialPerSessionState(1), isStreaming: true, streamStartedAt: null, lastStreamUpdateAt: null };
    expect(isStreamStale(session, Date.now())).toBe(false);
  });
});
