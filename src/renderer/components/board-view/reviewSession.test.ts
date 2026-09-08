import { describe, expect, it } from 'vitest';
import { shallow } from 'zustand/shallow';
import { resolveReviewRuntime } from './reviewSession';
import type { ReviewRunRecord } from '../../stores/devSessions';

const IMPL_SESSION_ID = 'implementation-1';

describe('resolveReviewRuntime', () => {
  it('falls back to the legacy review session id when nothing is recorded', () => {
    const runtime = resolveReviewRuntime(IMPL_SESSION_ID, 'review', new Map(), []);
    expect(runtime.sessionId).toBe(`${IMPL_SESSION_ID}-review`);
    expect(runtime.agentState).toBeUndefined();
    expect(runtime.isVisible).toBe(false);
    expect(runtime.isActive).toBe(false);
  });

  it('selects a recorded playbook subagent run for the current step when it is visible', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-playbook-review-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, stepId: 'review', runIndex: 0 }];

    const runtime = resolveReviewRuntime(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'working'],
    ]), reviewRuns);
    expect(runtime.sessionId).toBe(reviewSessionId);
    expect(runtime.agentState).toBe('working');
    expect(runtime.isVisible).toBe(true);
    expect(runtime.isActive).toBe(true);
  });

  it('is visible but not active for a recorded run that failed', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-playbook-review-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, stepId: 'review', runIndex: 0 }];

    const runtime = resolveReviewRuntime(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'failed'],
    ]), reviewRuns);
    expect(runtime.sessionId).toBe(reviewSessionId);
    expect(runtime.isVisible).toBe(true);
    expect(runtime.isActive).toBe(false);
  });

  it('falls back to the legacy id when the only recorded run is not in a visible state', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-playbook-review-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, stepId: 'review', runIndex: 0 }];

    const runtime = resolveReviewRuntime(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'complete'],
    ]), reviewRuns);
    expect(runtime.sessionId).toBe(`${IMPL_SESSION_ID}-review`);
    expect(runtime.isVisible).toBe(false);
  });

  it('ignores a recorded run for a step other than the current one', () => {
    const staleRunId = `${IMPL_SESSION_ID}-playbook-address-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: staleRunId, stepId: 'address', runIndex: 0 }];

    const runtime = resolveReviewRuntime(IMPL_SESSION_ID, 'review', new Map([
      [staleRunId, 'working'],
    ]), reviewRuns);
    expect(runtime.sessionId).toBe(`${IMPL_SESSION_ID}-review`);
  });

  it('picks the lowest runIndex among parallel visible reviewers for the same step, regardless of array order', () => {
    const first = `${IMPL_SESSION_ID}-playbook-critics-0-0`;
    const second = `${IMPL_SESSION_ID}-playbook-critics-0-1`;
    const states = new Map([[first, 'working' as const], [second, 'working' as const]]);

    const ascending: ReviewRunRecord[] = [
      { sessionId: first, stepId: 'critics', runIndex: 0 },
      { sessionId: second, stepId: 'critics', runIndex: 1 },
    ];
    const descending: ReviewRunRecord[] = [...ascending].reverse();

    expect(resolveReviewRuntime(IMPL_SESSION_ID, 'critics', states, ascending).sessionId).toBe(first);
    expect(resolveReviewRuntime(IMPL_SESSION_ID, 'critics', states, descending).sessionId).toBe(first);
  });

  it('treats a recorded run with no stepId as matching any current step', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-review`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, runIndex: 0 }];

    const runtime = resolveReviewRuntime(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'working'],
    ]), reviewRuns);
    expect(runtime.sessionId).toBe(reviewSessionId);
  });

  // A non-primitive field here would silently break `useReviewRuntime`'s
  // `useShallow` and put the board in a "Maximum update depth exceeded" loop.
  it('returns a fresh object that stays shallow-equal for the same inputs', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-playbook-review-0-0`;
    const agentStates = new Map([[reviewSessionId, 'working' as const]]);
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, stepId: 'review', runIndex: 0 }];

    const first = resolveReviewRuntime(IMPL_SESSION_ID, 'review', agentStates, reviewRuns);
    const second = resolveReviewRuntime(IMPL_SESSION_ID, 'review', agentStates, reviewRuns);

    expect(first).not.toBe(second);
    expect(shallow(first, second)).toBe(true);
  });
});
