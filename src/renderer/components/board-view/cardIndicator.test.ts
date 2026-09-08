import { describe, expect, it } from 'vitest';
import { resolveCardIndicator, type CardIndicatorInputs } from './cardIndicator';

const IDLE: CardIndicatorInputs = {
  isAttention: false,
  isStale: false,
  isActive: false,
  isIdle: true,
  hasAutomationFailure: false,
  automationFailureText: null,
  reviewActionable: null,
  isMergeBlocked: false,
  activeSessionCount: 0,
  hasPhaseIndicator: false,
};

const NO_COUNTS = { needsInput: 0, failed: 0, stale: 0, errored: 0 };

describe('resolveCardIndicator', () => {
  it('shows nothing on a card with no session activity', () => {
    expect(resolveCardIndicator(IDLE)).toBeNull();
  });

  it('ranks an automation failure above every other state', () => {
    const indicator = resolveCardIndicator({
      ...IDLE,
      hasAutomationFailure: true,
      automationFailureText: 'Commit checks failed',
      isStale: true,
      isIdle: false,
      isMergeBlocked: true,
      activeSessionCount: 2,
    });
    expect(indicator).toMatchObject({ tone: 'danger', form: 'solid', label: 'Commit checks failed' });
  });

  it('keeps the attention state ahead of staleness and merge blocking', () => {
    const indicator = resolveCardIndicator({
      ...IDLE,
      isAttention: true,
      isStale: true,
      isMergeBlocked: true,
    });
    expect(indicator).toMatchObject({ tone: 'warning', form: 'solid' });
  });

  it('shows no indicator while the agent is actively running its own phase', () => {
    const indicator = resolveCardIndicator({
      ...IDLE,
      isActive: true,
      isIdle: false,
      hasAutomationFailure: true,
      activeSessionCount: 1,
    });
    expect(indicator).toBeNull();
  });

  it('marks a stale session with a ring so it does not read as a demand', () => {
    expect(resolveCardIndicator({ ...IDLE, isStale: true })).toMatchObject({
      tone: 'warning',
      form: 'ring',
    });
  });

  it('reports merge blocking as information, not a failure', () => {
    expect(resolveCardIndicator({ ...IDLE, isMergeBlocked: true })).toMatchObject({
      tone: 'info',
      form: 'solid',
    });
  });

  it('counts running agents in the accessible name', () => {
    expect(resolveCardIndicator({ ...IDLE, activeSessionCount: 3 })).toMatchObject({
      tone: 'success',
      label: '3 agents running',
    });
  });

  it('yields the running indicator to the phase line that already names the phase', () => {
    expect(
      resolveCardIndicator({ ...IDLE, activeSessionCount: 1, hasPhaseIndicator: true }),
    ).toBeNull();
  });

  it('summarizes actionable review work rather than naming the automation failure', () => {
    const indicator = resolveCardIndicator({
      ...IDLE,
      reviewActionable: { hasActionable: true, counts: { ...NO_COUNTS, needsInput: 2 } },
    });
    expect(indicator).toMatchObject({
      tone: 'danger',
      label: '2 review decisions need you',
      tooltip: 'Review: 2 need your input — open Review tab',
    });
  });

  it('joins the review summary with the automation failure when both are present', () => {
    const indicator = resolveCardIndicator({
      ...IDLE,
      hasAutomationFailure: true,
      automationFailureText: 'Review stalled',
      reviewActionable: { hasActionable: true, counts: { ...NO_COUNTS, failed: 1 } },
    });
    expect(indicator?.tooltip).toBe('Review: 1 failed · Review stalled');
  });
});
