import { describe, expect, it } from 'vitest';
import type { PersistedAgentReview, PersistedReviewFinding } from '../../../shared/agent-types';
import { BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';
import { deriveRunOutline, type RunOutlineInput } from './runOutline';

const deepPlaybook = JSON.stringify(BUILT_IN_PLAYBOOKS.implementCodeReview);

function finding(overrides: Partial<PersistedReviewFinding>): PersistedReviewFinding {
  return {
    id: 'f', order: 0, severity: 'warning', description: 'Issue', agent: 'codex', source: 'agent',
    disposition: null, disposition_reason: null, ...overrides,
  };
}

function review(reviewSessionId: string, runIndex: number, findings: PersistedReviewFinding[], overrides: Partial<PersistedAgentReview> = {}): PersistedAgentReview {
  return {
    id: reviewSessionId, implementation_session_id: 'session-1', review_session_id: reviewSessionId,
    reviewer_agent: 'codex', status: 'complete', diff_fingerprint: null, raw_output: null, error: null,
    step_id: 'review', run_index: runIndex, findings,
    created_at: '2026-01-01', updated_at: '2026-01-01', completed_at: '2026-01-01', ...overrides,
  };
}

function input(overrides: Partial<RunOutlineInput>): RunOutlineInput {
  return {
    playbookSnapshot: deepPlaybook, currentStepId: null, automationPhase: 'ready_for_review',
    stepOutputs: null, stepCosts: {}, reviews: [], implementationAgent: 'claude', acceptanceCriteria: null,
    ...overrides,
  };
}

describe('deriveRunOutline', () => {
  it('shows only steps that ran, with the report stripped of machine-readable blocks', () => {
    const outline = deriveRunOutline(input({
      stepOutputs: JSON.stringify({ implement: ['Built it.\n```criteria-status\n[]\n```'] }),
      stepCosts: { implement: 8_510_000 },
    }));

    expect(outline.steps).toEqual([expect.objectContaining({
      stepId: 'implement', title: 'Implement', status: 'done', provider: 'claude', cost: 8_510_000, report: 'Built it.',
    })]);
  });

  it('groups a fan-out into passes and tags findings with their run\'s axis', () => {
    const outline = deriveRunOutline(input({
      reviews: [
        review('session-1-playbook-review-0-0', 0, [finding({ id: 'a' })]),
        review('session-1-playbook-review-0-1', 1, [finding({ id: 'b', severity: 'suggestion' })]),
        review('session-1-playbook-review-1-0', 0, []),
        review('session-1-playbook-review-1-1', 1, [], { status: 'running' }),
      ],
      currentStepId: 'review',
      automationPhase: 'reviewing',
    }));

    const reviewStep = outline.steps.find((step) => step.stepId === 'review')!;
    expect(reviewStep.status).toBe('running');
    expect(reviewStep.passes.map((pass) => pass.status)).toEqual(['complete', 'running']);
    expect(reviewStep.passes[0].findings.map((f) => [f.id, f.axis])).toEqual([['a', 'standards'], ['b', 'spec']]);
  });

  it.each([
    { name: 'before any reply', findings: [finding({}), finding({ severity: 'critical' }), finding({ severity: 'suggestion' })], outcome: '2 to fix · 1 suggestion' },
    { name: 'after replies', findings: [finding({ disposition: 'fixed' }), finding({ disposition: 'declined' }), finding({})], outcome: '1 fixed · 1 declined · 1 no reply' },
    { name: 'a clean pass', findings: [], outcome: 'no findings' },
  ])('summarizes a review pass $name', ({ findings, outcome }) => {
    const outline = deriveRunOutline(input({ reviews: [review('session-1-playbook-review-0-0', 0, findings)] }));
    expect(outline.steps.find((step) => step.stepId === 'review')?.outcome).toBe(outcome);
  });

  it('puts an ad-hoc review from a playbook without a findings step on its own card', () => {
    const outline = deriveRunOutline(input({
      playbookSnapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOnly),
      reviews: [review('session-1-review', 0, [finding({})], { step_id: null, status: 'failed', error: 'Timed out' })],
    }));

    expect(outline.steps).toEqual([expect.objectContaining({ stepId: 'ad-hoc-review', status: 'failed', outcome: 'failed' })]);
  });

  it('matches reported criteria status to the task\'s criteria by position', () => {
    const outline = deriveRunOutline(input({
      acceptanceCriteria: ['Endpoint records replies', 'Support publishes endings'],
      stepOutputs: JSON.stringify({ __harness_criteria_status: [JSON.stringify([{ criterion: 2, state: 'unverified', note: 'Needs Alder\'s branch.' }])] }),
    }));

    expect(outline.criteria).toEqual([
      { text: 'Endpoint records replies', state: null, note: null },
      { text: 'Support publishes endings', state: 'unverified', note: 'Needs Alder\'s branch.' },
    ]);
    expect(outline.steps).toEqual([]);
  });

  it('shows no criteria card until a status was reported', () => {
    expect(deriveRunOutline(input({ acceptanceCriteria: ['Works'] })).criteria).toBeNull();
  });
});
