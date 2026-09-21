import { describe, expect, it } from 'vitest';
import { BUILT_IN_PLAYBOOKS, DEFAULT_PLAYBOOK } from '../../../shared/playbooks';
import type { DevSession, DevSessionAutomationPhase } from '../../../shared/types';
import { readSessionRun } from './sessionPlaybook';

const reviewPlaybook = BUILT_IN_PLAYBOOKS.implementOpposingReview;

function sessionAt(
  currentStepId: string | null,
  options: { phase?: DevSessionAutomationPhase | null; snapshot?: string | null } = {},
): DevSession {
  return {
    id: 'session-1',
    project_id: 'project-1',
    status: 'active',
    automation_phase: options.phase ?? 'addressing_review',
    current_step_id: currentStepId,
    playbook_snapshot: options.snapshot === undefined ? JSON.stringify(reviewPlaybook) : options.snapshot,
    step_pass_counts: null,
    paused_reason: null,
  } as DevSession;
}

describe('readSessionRun', () => {
  it('falls back to the built-in default when the session carries no snapshot', () => {
    const run = readSessionRun(sessionAt(null, { snapshot: null }));

    expect(run.playbook).toBe(DEFAULT_PLAYBOOK);
    expect(run.cursor).toBeNull();
    expect(run.isLive).toBe(false);
  });

  it.each([
    ['implement', 'main', false],
    ['review', 'subagent', false],
    ['address', 'main', true],
    ['pr-review-followup', 'harness', true],
    ['ad-hoc-review', 'harness', false],
  ] as const)('resolves the %s cursor as a %s step', (stepId, kind, addressesFindings) => {
    const run = readSessionRun(sessionAt(stepId));

    expect(run.cursor?.step.id).toBe(stepId);
    expect(run.cursor?.kind).toBe(kind);
    expect(run.cursor?.addressesFindings).toBe(addressesFindings);
  });

  it('answers addressesFindings from the route, so a renamed address step still counts', () => {
    const custom = {
      ...reviewPlaybook,
      steps: reviewPlaybook.steps.map((step) => {
        if (step.id === 'address') return { ...step, id: 'fix-it' };
        if (step.onFindings) return { ...step, onFindings: { ...step.onFindings, goto: 'fix-it' } };
        return step;
      }),
    };

    const run = readSessionRun(sessionAt('fix-it', { snapshot: JSON.stringify(custom) }));

    expect(run.cursor?.addressesFindings).toBe(true);
  });

  it('reports a cursor nothing can resolve as live but without a step', () => {
    const run = readSessionRun(sessionAt('deleted-step', { phase: 'paused' }));

    expect(run.cursor).toBeNull();
    expect(run.isLive).toBe(true);
    expect(run.isResumable).toBe(true);
  });

  it.each([
    ['paused', true],
    ['needs_attention', true],
    ['addressing_review', false],
    ['reviewing', false],
  ] as const)('is resumable from %s: %s', (phase, resumable) => {
    expect(readSessionRun(sessionAt('implement', { phase })).isResumable).toBe(resumable);
  });
});
