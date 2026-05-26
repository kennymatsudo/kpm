import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createInitialPerSessionState } from './baseState';
import { createMessageSlice } from './messageSlice';
import type { ChatAttachment } from '../../../shared/types';

type SessionState = ReturnType<typeof createInitialPerSessionState>;
type MessageActions = ReturnType<typeof createMessageSlice>;

type TestState = {
  sessions: Map<string, SessionState>;
  viewedSessionId: string | null;
  nextSessionNumber: number;
} & MessageActions;

function createTestStore(sessionId: string, session: SessionState) {
  return createStore<TestState>()((set, get) => ({
    sessions: new Map([[sessionId, session]]),
    viewedSessionId: null,
    nextSessionNumber: 1,
    ...createMessageSlice(set as never, get as never),
  }));
}

describe('messageSlice.addUserMessage', () => {
  it('persists structured attachments on the user message', () => {
    const sessionId = 'session-attachments';
    const store = createTestStore(sessionId, session);

    const attachments: ChatAttachment[] = [
      {
        kind: 'image',
        path: '/tmp/kpm-images/kpm-attach-1.png',
        filename: 'screenshot.png',
        mediaType: 'image/png',
      },
      { kind: 'pdf', path: '/tmp/kpm-images/kpm-attach-2.pdf', filename: 'report.pdf' },
    ];

    store.getState().addUserMessage(sessionId, 'Check these out', attachments);

    const messages = store.getState().sessions.get(sessionId)?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].segments).toEqual([{ type: 'text', content: 'Check these out' }]);
    expect(messages[0].attachments).toEqual(attachments);
  });

  it('omits the attachments field when none are provided (back-compat)', () => {
    const sessionId = 'session-plain';
    const store = createTestStore(sessionId, session);

    store.getState().addUserMessage(sessionId, 'plain text');

    const messages = store.getState().sessions.get(sessionId)?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].attachments).toBeUndefined();
  });
});

describe('messageSlice.setError', () => {
  it('clears partial streaming state when a send fails', () => {
    const sessionId = 'session-error';
    const session = {
      isStreaming: true,
      streamingContent: 'partial',
      streamingThinking: 'thinking',
      streamingSegments: [{ type: 'text' as const, content: 'partial' }],
      pendingActivities: [{ id: 'activity-1', type: 'command' as const, label: 'Running test' }],
      streamStartedAt: 100,
      lastStreamUpdateAt: 200,
    };
    const store = createTestStore(sessionId, session);

    store.getState().setError(sessionId, 'Failed');

    const nextSession = store.getState().sessions.get(sessionId);
    expect(nextSession?.error).toBe('Failed');
    expect(nextSession?.isStreaming).toBe(false);
    expect(nextSession?.streamingContent).toBe('');
    expect(nextSession?.streamingThinking).toBe('');
    expect(nextSession?.streamingSegments).toEqual([]);
    expect(nextSession?.pendingActivities).toEqual([]);
    expect(nextSession?.streamStartedAt).toBeNull();
    expect(nextSession?.lastStreamUpdateAt).toBeNull();
  });
});
