import { describe, it, expect } from 'vitest';
import {
  derivePanelStatus,
  type PanelStatusInputs,
  type ReviewPhaseStats,
} from './panelStatus';

function makeStats(overrides: Partial<ReviewPhaseStats> = {}): ReviewPhaseStats {
  return {
    queueCount: 0,
    needsReviewCount: 0,
    implementCount: 0,
    inProgressImplCount: 0,
    readyToPostCount: 0,
    needsInputCount: 0,
    failedCount: 0,
    staleCount: 0,
    queuedCodeCount: 0,
    updatingCodeCount: 0,
    assessmentRunning: false,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<PanelStatusInputs> = {}): PanelStatusInputs {
  return {
    implAgentState: undefined,
    reviewAgentState: undefined,
    automationPhase: null,
    hasPr: false,
    prState: null,
    reviewState: null,
    itemStatus: null,
    commitStatus: null,
    reviewStats: null,
    latestActivitySummary: null,
    terminalReason: null,
    elapsedMs: null,
    diffStats: null,
    mergeBlockedBy: [],
    ...overrides,
  };
}

describe('derivePanelStatus — running phases', () => {
  it('implementing while the agent works, with a Stop action and live progress', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'working',
      latestActivitySummary: 'Editing PlanCard.tsx',
      elapsedMs: 252_000,
      diffStats: { files: 6, additions: 120, deletions: 34 },
    }));

    expect(status.phase).toBe('implementing');
    expect(status.step).toBe('build');
    expect(status.stepIndex).toBe(0);
    expect(status.nextAction?.busy).toBe(true);
    expect(status.nextAction?.primary).toEqual({ label: 'Stop', action: 'stop' });
    expect(status.progress).toEqual({
      label: 'Implementing',
      detail: 'Editing PlanCard.tsx',
      elapsedMs: 252_000,
      diffStats: { files: 6, additions: 120, deletions: 34 },
    });
  });

  it('treats starting like working (implementing)', () => {
    expect(derivePanelStatus(makeInputs({ implAgentState: 'starting' })).phase).toBe('implementing');
  });

  it('reviewing when the opposing-review agent is active', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      reviewAgentState: 'working',
    }));
    expect(status.phase).toBe('reviewing');
    expect(status.step).toBe('review');
    expect(status.nextAction?.busy).toBe(true);
  });

  it('reviewing when automation_phase says so even if no review agent state yet', () => {
    expect(derivePanelStatus(makeInputs({ automationPhase: 'reviewing' })).phase).toBe('reviewing');
  });

  it('addressing when automation_phase is addressing_review', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'working',
      automationPhase: 'addressing_review',
      reviewStats: makeStats({ updatingCodeCount: 2 }),
    }));
    expect(status.phase).toBe('addressing');
    expect(status.step).toBe('address');
    expect(status.stepIndex).toBe(2);
    expect(status.nextAction?.text).toContain('2');
  });

  it('addressing also triggers on queued/updating code counts alone', () => {
    expect(derivePanelStatus(makeInputs({
      reviewStats: makeStats({ queuedCodeCount: 1 }),
    })).phase).toBe('addressing');
  });

  it('committing outranks every other phase', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'working',
      commitStatus: 'running',
    }));
    expect(status.phase).toBe('committing');
    expect(status.nextAction?.busy).toBe(true);
  });
});

describe('derivePanelStatus — awaiting input (Gemini-only path)', () => {
  it('surfaces an answer prompt when the agent pauses', () => {
    const status = derivePanelStatus(makeInputs({ implAgentState: 'waiting_for_input' }));
    expect(status.phase).toBe('awaiting_input');
    expect(status.nextAction?.primary).toEqual({ label: 'Answer', action: 'focus_input' });
    expect(status.progress).toBeNull();
  });
});

describe('derivePanelStatus — deterministic terminal states', () => {
  it('complete with no PR goes straight to the implemented decision point', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      diffStats: { files: 7, additions: 0, deletions: 0 },
    }));
    expect(status.phase).toBe('implemented');
    expect(status.step).toBe('build');
    expect(status.nextAction?.text).toBe('Done · 7 files changed');
    expect(status.nextAction?.primary).toEqual({ label: 'Ready for Review', action: 'ready_for_review' });
    expect(status.nextAction?.secondary).toEqual({ label: 'Review changes', action: 'view_changes' });
  });

  it('includes +/- magnitude in the done text when present', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      diffStats: { files: 3, additions: 120, deletions: 34 },
    }));
    expect(status.nextAction?.text).toBe('Done · 3 files changed (+120 −34)');
  });

  it('offers Create PR instead of Ready for Review once the item is already in review', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      itemStatus: 'in_review',
    }));
    expect(status.nextAction?.primary).toEqual({ label: 'Create PR', action: 'create_pr' });
  });

  it('failed surfaces the terminal reason and recovery actions', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'failed',
      terminalReason: 'max turns',
    }));
    expect(status.phase).toBe('failed');
    expect(status.nextAction?.tone).toBe('danger');
    expect(status.nextAction?.text).toBe('Failed: max turns');
    expect(status.nextAction?.primary).toEqual({ label: 'Retry', action: 'retry' });
    expect(status.nextAction?.secondary).toEqual({ label: 'New instructions', action: 'follow_up' });
  });

  it('failed without a captured reason falls back to a generic message', () => {
    expect(derivePanelStatus(makeInputs({ implAgentState: 'failed' })).nextAction?.text).toBe('Run failed');
  });

  it('stopped offers a resume path', () => {
    const status = derivePanelStatus(makeInputs({ implAgentState: 'stopped' }));
    expect(status.phase).toBe('stopped');
    expect(status.nextAction?.primary).toEqual({ label: 'Resume', action: 'follow_up' });
  });

  it('has no stuck/stale phase — a working session stays implementing', () => {
    // The deterministic lifecycle means "working" is always honest; there is no
    // debounce limbo to paper over.
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'working',
      latestActivitySummary: 'still going',
      elapsedMs: 10 * 60_000,
    }));
    expect(status.phase).toBe('implementing');
  });
});

describe('derivePanelStatus — PR / review phases', () => {
  it('merged short-circuits to a terminal merged phase', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      hasPr: true,
      prState: 'MERGED',
      reviewStats: makeStats({ needsReviewCount: 3 }),
    }));
    expect(status.phase).toBe('merged');
    expect(status.step).toBe('merge');
  });

  it('ready when approved, unblocked, and the queue is clear', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      hasPr: true,
      prState: 'OPEN',
      reviewState: 'APPROVED',
      reviewStats: makeStats(),
    }));
    expect(status.phase).toBe('ready');
    expect(status.step).toBe('merge');
    expect(status.nextAction?.text).toBe('Approved · ready to merge');
  });

  it('review_open with a blocked merge warns to merge predecessors first', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      hasPr: true,
      prState: 'OPEN',
      reviewState: 'APPROVED',
      reviewStats: makeStats(),
      mergeBlockedBy: ['Add schema', 'Wire IPC'],
    }));
    expect(status.phase).toBe('review_open');
    expect(status.nextAction?.tone).toBe('warning');
    expect(status.nextAction?.text).toBe('Merge Add schema, Wire IPC first');
  });

  it('review_open shows "Awaiting review" when a PR is open with an empty queue', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'complete',
      hasPr: true,
      prState: 'OPEN',
      reviewState: 'REVIEW_REQUIRED',
      reviewStats: makeStats(),
    }));
    expect(status.phase).toBe('review_open');
    expect(status.nextAction?.text).toBe('Awaiting review');
  });
});

describe('derivePanelStatus — review queue precedence (review_open)', () => {
  const base = makeInputs({
    implAgentState: 'complete',
    hasPr: true,
    prState: 'OPEN',
  });

  function withStats(overrides: Partial<ReviewPhaseStats>) {
    return derivePanelStatus({ ...base, reviewStats: makeStats(overrides) }).nextAction;
  }

  it('assessment running outranks everything', () => {
    const a = withStats({ assessmentRunning: true, needsReviewCount: 5, implementCount: 2 });
    expect(a?.busy).toBe(true);
    expect(a?.text).toBe('Assessing review threads');
  });

  it('attention (failed/stale) outranks drafts and fixes', () => {
    const a = withStats({ failedCount: 1, staleCount: 1, readyToPostCount: 3, implementCount: 2 });
    expect(a?.tone).toBe('danger');
    expect(a?.text).toBe('2 review tasks need attention');
    expect(a?.primary).toEqual({ label: 'Reassess', action: 'reassess_attention' });
  });

  it('drafts ready only wins when nothing upstream is pending', () => {
    const a = withStats({ readyToPostCount: 2 });
    expect(a?.text).toBe('Post 2 drafted replies');
    expect(a?.primary?.action).toBe('post_all_replies');
  });

  it('decisions-needed (needs you) outranks fixes and assess', () => {
    const a = withStats({ needsInputCount: 1, implementCount: 3, needsReviewCount: 2 });
    expect(a?.tone).toBe('info');
    expect(a?.text).toBe('1 decision need you');
  });

  it('fixes ready prompts to address all when no new threads remain', () => {
    const a = withStats({ implementCount: 3 });
    expect(a?.text).toBe('3 fixes ready for the agent');
    expect(a?.primary).toEqual({ label: 'Address all', action: 'address_all' });
  });

  it('addressed threads prompt to draft replies', () => {
    const a = withStats({ inProgressImplCount: 2 });
    expect(a?.text).toBe('2 addressed threads — draft the replies');
    expect(a?.primary?.action).toBe('draft_replies');
  });

  it('new threads fall through to assess', () => {
    const a = withStats({ needsReviewCount: 4 });
    expect(a?.tone).toBe('warning');
    expect(a?.text).toBe('4 new threads to assess');
    expect(a?.primary?.action).toBe('assess');
  });
});

describe('derivePanelStatus — idle', () => {
  it('returns idle with no action when nothing is running or decided', () => {
    const status = derivePanelStatus(makeInputs());
    expect(status.phase).toBe('idle');
    expect(status.nextAction).toBeNull();
    expect(status.progress).toBeNull();
  });
});

describe('derivePanelStatus — precedence between dimensions', () => {
  it('a running impl agent outranks a stale review queue', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'working',
      hasPr: true,
      prState: 'OPEN',
      reviewStats: makeStats({ needsReviewCount: 3 }),
    }));
    expect(status.phase).toBe('implementing');
  });

  it('a failed impl agent outranks an open review queue', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'failed',
      hasPr: true,
      prState: 'OPEN',
      reviewStats: makeStats({ needsReviewCount: 3 }),
    }));
    expect(status.phase).toBe('failed');
  });

  it('addressing outranks reviewing when both could match', () => {
    const status = derivePanelStatus(makeInputs({
      implAgentState: 'working',
      reviewAgentState: 'working',
      automationPhase: 'addressing_review',
    }));
    expect(status.phase).toBe('addressing');
  });
});
