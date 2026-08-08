import { describe, expect, it } from 'vitest';
import { reviewSessionIdForDisplay } from './reviewSession';
import type { ReviewRunRecord } from '../../stores/devSessions';

const IMPL_SESSION_ID = 'implementation-1';

describe('reviewSessionIdForDisplay', () => {
  it('falls back to the legacy review session id when nothing is recorded', () => {
    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'review', new Map(), [])).toBe(
      `${IMPL_SESSION_ID}-review`
    );
  });

  it('selects a recorded playbook subagent run for the current step when it is visible', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-playbook-review-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, stepId: 'review', runIndex: 0 }];

    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'working'],
    ]), reviewRuns)).toBe(reviewSessionId);
  });

  it('falls back to the legacy id when the only recorded run is not in a visible state', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-playbook-review-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, stepId: 'review', runIndex: 0 }];

    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'complete'],
    ]), reviewRuns)).toBe(`${IMPL_SESSION_ID}-review`);
  });

  it('ignores a recorded run for a step other than the current one', () => {
    const staleRunId = `${IMPL_SESSION_ID}-playbook-address-0-0`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: staleRunId, stepId: 'address', runIndex: 0 }];

    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'review', new Map([
      [staleRunId, 'working'],
    ]), reviewRuns)).toBe(`${IMPL_SESSION_ID}-review`);
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

    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'critics', states, ascending)).toBe(first);
    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'critics', states, descending)).toBe(first);
  });

  it('treats a recorded run with no stepId as matching any current step', () => {
    const reviewSessionId = `${IMPL_SESSION_ID}-review`;
    const reviewRuns: ReviewRunRecord[] = [{ sessionId: reviewSessionId, runIndex: 0 }];

    expect(reviewSessionIdForDisplay(IMPL_SESSION_ID, 'review', new Map([
      [reviewSessionId, 'working'],
    ]), reviewRuns)).toBe(reviewSessionId);
  });
});
