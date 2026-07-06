import { describe, it, expect, vi } from 'vitest';
import { createAgentEventRouter, type AgentEventRouterDeps, type AgentEventStoreView } from './agentEventRouter';
import { toReviewSessionId } from '../../shared/agent-types';

const IMPL_SESSION_ID = 'dev-session-1';
const REVIEW_SESSION_ID = toReviewSessionId(IMPL_SESSION_ID);

function makeStoreView(overrides: Partial<AgentEventStoreView> = {}): AgentEventStoreView {
  return {
    handleAgentStateChanged: vi.fn(),
    handleAgentActivity: vi.fn(),
    handleAgentQuestion: vi.fn(),
    handleAgentComplete: vi.fn(),
    handleAgentError: vi.fn(),
    setReviewActionable: vi.fn(),
    ...overrides,
  };
}

function makeDeps(
  storeView: AgentEventStoreView,
  overrides: Partial<AgentEventRouterDeps> = {},
): AgentEventRouterDeps {
  return {
    getStore: () => storeView,
    getKnownSessionIds: () => new Set([IMPL_SESSION_ID]),
    ...overrides,
  };
}

describe('event routing', () => {
  it('routes state-changed, activity, question, error, and reviewActionable events to their store handlers', () => {
    const store = makeStoreView();
    const router = createAgentEventRouter(makeDeps(store));

    router.handlers.onStateChanged({ sessionId: IMPL_SESSION_ID, devSessionId: IMPL_SESSION_ID, state: 'working' });
    router.handlers.onActivity({
      sessionId: IMPL_SESSION_ID,
      devSessionId: IMPL_SESSION_ID,
      activity: { type: 'tool', timestamp: 1, summary: 'Edit', content: 'Edit' } as never,
    });
    router.handlers.onQuestion({
      sessionId: IMPL_SESSION_ID,
      devSessionId: IMPL_SESSION_ID,
      question: { id: 'q1' } as never,
    });
    router.handlers.onError({ sessionId: IMPL_SESSION_ID, devSessionId: IMPL_SESSION_ID, error: 'boom' });
    router.handlers.onReviewActionable({
      sessionId: IMPL_SESSION_ID,
      hasActionable: true,
      counts: { needsInput: 1, failed: 0, stale: 0, errored: 0 },
    });

    expect(store.handleAgentStateChanged).toHaveBeenCalledWith(IMPL_SESSION_ID, 'working');
    expect(store.handleAgentActivity).toHaveBeenCalledWith(
      IMPL_SESSION_ID,
      expect.objectContaining({ summary: 'Edit' }),
    );
    expect(store.handleAgentQuestion).toHaveBeenCalledWith(IMPL_SESSION_ID, expect.objectContaining({ id: 'q1' }));
    expect(store.handleAgentError).toHaveBeenCalledWith(IMPL_SESSION_ID, 'boom');
    expect(store.setReviewActionable).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: IMPL_SESSION_ID, hasActionable: true }),
    );
  });

  it('passes findings through on complete', () => {
    const store = makeStoreView();
    const router = createAgentEventRouter(makeDeps(store));
    const findings = [{ severity: 'warning', file: 'a.ts', line: 1, description: 'x', agent: 'codex', source: 'agent' }];

    router.handlers.onComplete({
      sessionId: REVIEW_SESSION_ID,
      devSessionId: REVIEW_SESSION_ID,
      role: 'review',
      summary: { filesChanged: 1, additions: 1, deletions: 0 },
      findings: findings as never,
    });

    expect(store.handleAgentComplete).toHaveBeenCalledWith(
      REVIEW_SESSION_ID,
      expect.objectContaining({ filesChanged: 1 }),
      findings,
    );
  });

  it('drops an event for a session id absent from a loaded known-session set', () => {
    const store = makeStoreView();
    const router = createAgentEventRouter(makeDeps(store, { getKnownSessionIds: () => new Set(['other-session']) }));

    router.handlers.onStateChanged({ sessionId: IMPL_SESSION_ID, devSessionId: IMPL_SESSION_ID, state: 'working' });

    expect(store.handleAgentStateChanged).not.toHaveBeenCalled();
  });

  it('passes an event through when the known-session set has not loaded yet (null)', () => {
    const store = makeStoreView();
    const router = createAgentEventRouter(makeDeps(store, { getKnownSessionIds: () => null }));

    router.handlers.onStateChanged({ sessionId: IMPL_SESSION_ID, devSessionId: IMPL_SESSION_ID, state: 'working' });

    expect(store.handleAgentStateChanged).toHaveBeenCalledWith(IMPL_SESSION_ID, 'working');
  });

  it('normalizes a suffixed review-runtime tracked id and routes it when its implementation id is known', () => {
    const store = makeStoreView();
    const router = createAgentEventRouter(makeDeps(store, { getKnownSessionIds: () => new Set([IMPL_SESSION_ID]) }));

    router.handlers.onActivity({
      sessionId: REVIEW_SESSION_ID,
      devSessionId: REVIEW_SESSION_ID,
      activity: { type: 'tool', timestamp: 1, summary: 'Review', content: 'Review' } as never,
    });

    expect(store.handleAgentActivity).toHaveBeenCalledWith(
      REVIEW_SESSION_ID,
      expect.objectContaining({ summary: 'Review' }),
    );
  });

  it('stops routing after dispose', () => {
    const store = makeStoreView();
    const router = createAgentEventRouter(makeDeps(store));

    router.dispose();
    router.handlers.onStateChanged({ sessionId: IMPL_SESSION_ID, devSessionId: IMPL_SESSION_ID, state: 'working' });

    expect(store.handleAgentStateChanged).not.toHaveBeenCalled();
  });
});
