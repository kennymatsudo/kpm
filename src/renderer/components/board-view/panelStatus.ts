/**
 * panelStatus - The single, canonical projection of a board session's state.
 *
 * The detail panel's state is split across four backing sources: the running
 * agent's moment-to-moment `AgentSessionState`, the persisted
 * `automation_phase` workflow, the GitHub review inbox, and the plan item's
 * status. No single field answers "where is this session, and what's the one
 * thing to do next" — so historically each surface (header indicator, board
 * card line, review next-action bar) re-derived that answer independently and
 * could drift.
 *
 * `derivePanelStatus` re-unifies those sources into one `PanelStatus`. It is a
 * pure function of explicit inputs so it can be unit-tested exhaustively and
 * reused by every surface. The `usePanelStatus` hook is a thin wrapper that
 * gathers store state for a single session and calls it; `BoardCard.tsx`
 * calls `derivePanelStatus` directly instead, since it first has to pick
 * *which* session among an item's several sessions counts as "active" —
 * logic upstream of what the hook (built for one already-known session)
 * covers — then feeds the same canonical inputs through the same function.
 *
 * This models the *deterministic* agent lifecycle (turn ends when the SDK
 * stream ends): a Claude board session moves working -> complete|failed|stopped
 * with no debounce limbo, so there is intentionally no "stuck/stale" phase here.
 * `awaiting_input` is retained only for agent types that still pause (Gemini).
 * BoardCard layers its own 5-minute no-activity heuristic on top for exactly
 * that reason — see `isSessionStale` there.
 */

import {
  isCommitHookRepairPhase,
  type AgentSessionState,
  type DevSessionAutomationPhase,
  type StatusCategory,
} from '../../../shared/types';

/** The canonical, agent-agnostic phase a session sits in. */
export type PanelPhase =
  | 'committing'      // a git commit (hooks) is running
  | 'fixing_hooks'    // implementation agent is repairing commit-hook failures
  | 'implementing'    // implementation agent is producing the first cut
  | 'awaiting_input'  // agent paused with a question (Gemini-only path)
  | 'reviewing'       // opposing-agent review is running
  | 'addressing'      // a code update is running to address review feedback
  | 'paused'         // playbook intentionally stopped at a user gate
  | 'needs_attention' // automation was interrupted and needs a user decision
  | 'review_open'     // PR exists with review work waiting on the user
  | 'ready'           // PR approved and unblocked — ready to merge
  | 'merged'          // PR merged — nothing left to do
  | 'implemented'     // agent finished, no PR yet — decision point
  | 'failed'          // agent run failed
  | 'stopped'         // agent run stopped by the user
  | 'idle';           // no agent state / nothing actionable

/** Macro-orientation node for the phase stepper (Build › Review › Address › Merge). */
export type PanelStep = 'build' | 'review' | 'address' | 'merge';

/**
 * Semantic id for a next-action button. The component maps these to handlers;
 * the derivation stays pure (no callbacks, fully serializable/testable).
 */
export type PanelActionId =
  | 'stop'
  | 'retry'
  | 'resume'
  | 'proceed'
  | 'one_more_pass'
  | 'dismiss'
  | 'follow_up'
  | 'ready_for_review'
  | 'run_review'
  | 'create_pr'
  | 'open_pr'
  | 'view_changes'
  | 'focus_input'
  | 'assess'
  | 'reassess_attention'
  | 'address_all'
  | 'draft_replies'
  | 'post_all_replies';

export interface NextActionButton {
  label: string;
  action: PanelActionId;
}

export interface NextAction {
  tone: 'accent' | 'danger' | 'warning' | 'info' | 'neutral';
  text: string;
  /** True while a background process is in flight — render a spinner. */
  busy?: boolean;
  primary?: NextActionButton;
  secondary?: NextActionButton;
  /**
   * When true, render an icon-only dismiss control that emits the `dismiss`
   * action — lets the user acknowledge a non-blocking state (e.g. "Automation
   * interrupted") and clear it without re-running or committing.
   */
  dismissible?: boolean;
}

/** Live-progress detail, present only while a process is running. */
export interface ProgressInfo {
  label: string;
  /** The current step — the agent's latest narration. */
  detail: string | null;
  elapsedMs: number | null;
  diffStats: DiffStats | null;
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

/**
 * The subset of the GitHub review inbox the phase model needs. Mirrors the
 * counts produced by the review store's `getStats`; kept as an explicit input
 * so the derivation has no store dependency.
 */
export interface ReviewPhaseStats {
  queueCount: number;
  needsReviewCount: number;
  implementCount: number;
  inProgressImplCount: number;
  readyToPostCount: number;
  needsInputCount: number;
  failedCount: number;
  staleCount: number;
  queuedCodeCount: number;
  updatingCodeCount: number;
  /** A disposition assessment pass is running. */
  assessmentRunning: boolean;
}

export interface PanelStatusInputs {
  /** Implementation agent state (undefined = no session yet). */
  implAgentState: AgentSessionState | undefined;
  /** Opposing-review agent state, if a review session is running. */
  reviewAgentState: AgentSessionState | undefined;
  automationPhase: DevSessionAutomationPhase | null;
  pausedReason?: 'gate' | 'max_passes' | null;
  /** PR linkage / status. */
  hasPr: boolean;
  prState: string | null;      // 'OPEN' | 'CLOSED' | 'MERGED'
  reviewState: string | null;  // 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
  /** Plan item status category — used to suppress "Ready for Review" once moved. */
  itemStatus: StatusCategory | null;
  /** Background commit state. */
  commitStatus: 'running' | 'failed' | null;
  /** Review inbox snapshot counts; null when no PR / not loaded. */
  reviewStats: ReviewPhaseStats | null;
  /** Latest agent narration — the "current step" shown while running. */
  latestActivitySummary: string | null;
  /** Terminal reason captured at completion (e.g. 'max turns'), if abnormal. */
  terminalReason: string | null;
  /** Elapsed run time in ms, for the progress display. */
  elapsedMs: number | null;
  diffStats: DiffStats | null;
  /** Names of unmerged predecessor PRs that block this one, if any. */
  mergeBlockedBy: string[];
}

export interface PanelStatus {
  phase: PanelPhase;
  step: PanelStep;
  stepIndex: number;
  nextAction: NextAction | null;
  /** Present only while a process is running (busy phases). */
  progress: ProgressInfo | null;
}

const STEP_ORDER: PanelStep[] = ['build', 'review', 'address', 'merge'];

const PHASE_TO_STEP: Record<PanelPhase, PanelStep> = {
  committing: 'build',
  fixing_hooks: 'build',
  implementing: 'build',
  awaiting_input: 'build',
  implemented: 'build',
  failed: 'build',
  stopped: 'build',
  idle: 'build',
  paused: 'build',
  needs_attention: 'build',
  reviewing: 'review',
  review_open: 'review',
  addressing: 'address',
  ready: 'merge',
  merged: 'merge',
};

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm ?? `${singular}s`;
}

function isActive(state: AgentSessionState | undefined): boolean {
  return state === 'starting' || state === 'working' || state === 'waiting_for_input';
}

function isAddressing(i: PanelStatusInputs): boolean {
  if (i.automationPhase === 'addressing_review') return true;
  const s = i.reviewStats;
  return !!s && (s.queuedCodeCount > 0 || s.updatingCodeCount > 0);
}

function isReviewing(i: PanelStatusInputs): boolean {
  return isActive(i.reviewAgentState) || i.automationPhase === 'reviewing';
}

function hasReviewWork(s: ReviewPhaseStats): boolean {
  return (
    s.queueCount > 0 ||
    s.needsReviewCount > 0 ||
    s.implementCount > 0 ||
    s.inProgressImplCount > 0 ||
    s.readyToPostCount > 0 ||
    s.needsInputCount > 0 ||
    s.failedCount > 0 ||
    s.staleCount > 0 ||
    s.assessmentRunning
  );
}

/** Build the change-magnitude suffix, e.g. " (+120 −34)". */
function diffSuffix(diff: DiffStats | null): string {
  if (!diff || (diff.additions === 0 && diff.deletions === 0)) return '';
  return ` (+${diff.additions} −${diff.deletions})`;
}

function doneText(diff: DiffStats | null): string {
  if (!diff || diff.files === 0) return 'Done';
  return `Done · ${diff.files} ${plural(diff.files, 'file')} changed${diffSuffix(diff)}`;
}

/**
 * Next action for an open review, mirroring the review queue's own precedence:
 * attention > drafts ready > decisions needed > fixes ready > addressed-needs-reply
 * > new-to-assess. Returns null when the queue is clear.
 */
function reviewNextAction(s: ReviewPhaseStats, mergeBlockedBy: string[]): NextAction {
  if (s.assessmentRunning) {
    return { tone: 'accent', busy: true, text: 'Assessing review threads' };
  }
  if (s.failedCount > 0 || s.staleCount > 0) {
    const count = s.failedCount + s.staleCount;
    return {
      tone: 'danger',
      text: `${count} review ${plural(count, 'task')} need attention`,
      primary: { label: 'Reassess', action: 'reassess_attention' },
    };
  }
  if (
    s.readyToPostCount > 0 &&
    s.needsInputCount === 0 &&
    s.needsReviewCount === 0 &&
    s.implementCount === 0
  ) {
    return {
      tone: 'accent',
      text: `Post ${s.readyToPostCount} drafted ${plural(s.readyToPostCount, 'reply', 'replies')}`,
      primary: { label: 'Post all', action: 'post_all_replies' },
    };
  }
  if (s.needsInputCount > 0) {
    return {
      tone: 'info',
      text: `${s.needsInputCount} ${plural(s.needsInputCount, 'decision')} need you`,
    };
  }
  if (s.implementCount > 0 && s.needsReviewCount === 0) {
    return {
      tone: 'accent',
      text: `${s.implementCount} ${plural(s.implementCount, 'fix', 'fixes')} ready for the agent`,
      primary: { label: 'Address all', action: 'address_all' },
    };
  }
  if (s.inProgressImplCount > 0 && s.needsReviewCount === 0) {
    return {
      tone: 'neutral',
      text: `${s.inProgressImplCount} addressed ${plural(s.inProgressImplCount, 'thread')} — draft the replies`,
      primary: { label: 'Draft replies', action: 'draft_replies' },
    };
  }
  if (s.needsReviewCount > 0) {
    return {
      tone: 'warning',
      text: `${s.needsReviewCount} new ${plural(s.needsReviewCount, 'thread')} to assess`,
      primary: { label: 'Assess', action: 'assess' },
    };
  }
  // Queue clear, but the PR is still open / awaiting the reviewer.
  if (mergeBlockedBy.length > 0) {
    return {
      tone: 'warning',
      text: `Merge ${mergeBlockedBy.join(', ')} first`,
      primary: { label: 'Open PR', action: 'open_pr' },
    };
  }
  return {
    tone: 'neutral',
    text: 'Awaiting review',
    primary: { label: 'Open PR', action: 'open_pr' },
  };
}

function progressFor(label: string, i: PanelStatusInputs): ProgressInfo {
  return {
    label,
    detail: i.latestActivitySummary,
    elapsedMs: i.elapsedMs,
    diffStats: i.diffStats,
  };
}

function withStep(phase: PanelPhase, nextAction: NextAction | null, progress: ProgressInfo | null): PanelStatus {
  const step = PHASE_TO_STEP[phase];
  return { phase, step, stepIndex: STEP_ORDER.indexOf(step), nextAction, progress };
}

/**
 * Fold the four backing state sources into one canonical phase + next action.
 * First match wins; the ordering encodes priority (running work and terminal
 * errors outrank quiet decision points).
 */
export function derivePanelStatus(i: PanelStatusInputs): PanelStatus {
  // 1. A commit (with hooks) is running — block everything else.
  if (i.commitStatus === 'running') {
    return withStep('committing', { tone: 'accent', busy: true, text: 'Committing — running hooks' }, progressFor('Committing', i));
  }

  // 2-5. Something is actively running right now.
  if (isCommitHookRepairPhase(i.automationPhase)) {
    return withStep('fixing_hooks', {
      tone: 'accent',
      busy: true,
      text: 'Fixing commit checks',
      primary: isActive(i.implAgentState) ? { label: 'Stop', action: 'stop' } : undefined,
    }, progressFor('Fixing commit checks', i));
  }
  if (isAddressing(i)) {
    const count = Math.max(i.reviewStats?.queuedCodeCount ?? 0, i.reviewStats?.updatingCodeCount ?? 0);
    const text = count > 0
      ? `Updating code for ${count} review ${plural(count, 'thread')}`
      : 'Updating code for review feedback';
    return withStep('addressing', { tone: 'accent', busy: true, text }, progressFor('Addressing review', i));
  }
  if (isReviewing(i)) {
    return withStep('reviewing', { tone: 'accent', busy: true, text: 'Reviewer checking the diff' }, progressFor('Reviewing', i));
  }
  if (i.implAgentState === 'waiting_for_input') {
    return withStep('awaiting_input', {
      tone: 'info',
      text: 'Agent needs an answer',
      primary: { label: 'Answer', action: 'focus_input' },
    }, null);
  }
  if (i.implAgentState === 'starting' || i.implAgentState === 'working') {
    return withStep('implementing', {
      tone: 'accent',
      busy: true,
      text: 'Implementing',
      primary: { label: 'Stop', action: 'stop' },
    }, progressFor('Implementing', i));
  }

  // 6. Persisted automation interruptions outrank quiet decision points.
  if (i.automationPhase === 'paused') {
    return withStep('paused', i.pausedReason === 'max_passes' ? {
      tone: 'warning',
      text: 'Findings remain after the pass limit',
      primary: { label: 'One more pass', action: 'one_more_pass' },
      secondary: { label: 'Proceed', action: 'proceed' },
    } : {
      tone: 'info',
      text: 'Paused at playbook gate',
      primary: { label: 'Resume', action: 'resume' },
    }, null);
  }

  if (i.automationPhase === 'needs_attention') {
    return withStep('needs_attention', {
      tone: 'warning',
      text: 'Automation interrupted',
      primary: { label: 'Resume', action: 'resume' },
      secondary: { label: 'New instructions', action: 'follow_up' },
      dismissible: true,
    }, null);
  }

  // 7-8. Terminal agent failures outrank quiet decision points.
  if (i.implAgentState === 'failed') {
    return withStep('failed', {
      tone: 'danger',
      text: i.terminalReason ? `Failed: ${i.terminalReason}` : 'Run failed',
      primary: { label: 'Retry', action: 'retry' },
      secondary: { label: 'New instructions', action: 'follow_up' },
    }, null);
  }
  if (i.implAgentState === 'stopped') {
    return withStep('stopped', {
      tone: 'neutral',
      text: 'Stopped',
      primary: { label: 'Resume', action: 'follow_up' },
    }, null);
  }

  // 9. PR merged — nothing left.
  if (i.prState === 'MERGED') {
    return withStep('merged', {
      tone: 'neutral',
      text: 'Merged',
      primary: { label: 'Open PR', action: 'open_pr' },
    }, null);
  }

  const stats = i.reviewStats;
  const reviewWork = stats ? hasReviewWork(stats) : false;

  // 10. Approved, unblocked, queue clear — ready to merge.
  if (i.hasPr && i.reviewState === 'APPROVED' && i.mergeBlockedBy.length === 0 && !reviewWork) {
    return withStep('ready', {
      tone: 'accent',
      text: 'Approved · ready to merge',
      primary: { label: 'Open PR', action: 'open_pr' },
    }, null);
  }

  // 11. PR open — surface the review queue's next action (or awaiting/blocked).
  if (i.hasPr) {
    const action = stats ? reviewNextAction(stats, i.mergeBlockedBy) : {
      tone: 'neutral' as const,
      text: 'Awaiting review',
      primary: { label: 'Open PR' as const, action: 'open_pr' as const },
    };
    return withStep('review_open', action, null);
  }

  // 12. Agent finished, no PR — the decision point.
  if (i.implAgentState === 'complete') {
    const moved = i.itemStatus === 'in_review' || i.itemStatus === 'done';
    return withStep('implemented', {
      tone: 'accent',
      text: doneText(i.diffStats),
      primary: moved
        ? { label: 'Create PR', action: 'create_pr' }
        : { label: 'Ready for Review', action: 'ready_for_review' },
      secondary: { label: 'Review changes', action: 'view_changes' },
    }, null);
  }

  // 13. Nothing running, nothing decided.
  return withStep('idle', null, null);
}
