/**
 * reviewActions - Review-queue decision logic shared by the Review tab.
 *
 * Lifted out of ReviewTab (the same move as reviewStats) so the verdict rules —
 * what the user should do next, which tasks can be reassessed, how threads
 * order and render at a glance — live behind a pure, unit-testable interface
 * instead of inside a rendered component.
 *
 * Pure functions only — no store or React dependency.
 */

import type {
  PrReviewThread,
  PrTopLevelReview,
  ReviewDisposition,
  ReviewTask,
  ReviewTaskStatus,
} from '../../../shared/types';
import type { BadgeVariant } from '../ui/Badge';
import { isThreadClosed, type ReviewStats } from './reviewStats';

export const STATUS_LABEL: Record<ReviewTaskStatus, string> = {
  needs_review: 'To assess',
  assessed: 'Assessed',
  in_progress: 'Updating',
  ready_to_post: 'Draft ready',
  done: 'Done',
};

export const DISPOSITION_LABEL: Record<ReviewDisposition, string> = {
  implement: 'Implement',
  push_back: 'Push back',
  needs_user_input: 'Needs you',
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const THREAD_STATUS_ORDER: Record<ReviewTaskStatus, number> = {
  needs_review: 0,
  assessed: 1,
  in_progress: 2,
  ready_to_post: 3,
  done: 4,
};

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm ?? `${singular}s`;
}

export function canReassessTask(task: ReviewTask | undefined, thread: PrReviewThread | undefined): boolean {
  if (!task || !thread || isThreadClosed(thread)) return false;
  if (task.internal_state === 'ignored') return false;
  const reassessableStatus = task.status === 'needs_review'
    || task.status === 'assessed'
    || task.status === 'ready_to_post';
  if (!reassessableStatus) return false;
  return task.status === 'assessed'
    || task.status === 'ready_to_post'
    || task.internal_state === 'failed'
    || task.internal_state === 'stale'
    || task.error != null;
}

export function sortThreads(a: PrReviewThread, b: PrReviewThread, taskMap: Map<string, ReviewTask>): number {
  const ta = taskMap.get(a.id);
  const tb = taskMap.get(b.id);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  if (ta && tb) {
    const statusDelta = THREAD_STATUS_ORDER[ta.status] - THREAD_STATUS_ORDER[tb.status];
    if (statusDelta !== 0) return statusDelta;

    const priorityDelta = (PRIORITY_ORDER[ta.priority] ?? 2) - (PRIORITY_ORDER[tb.priority] ?? 2);
    if (priorityDelta !== 0) return priorityDelta;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function getThreadRailClass(task: ReviewTask | undefined, thread: PrReviewThread): string {
  if (thread.isResolved) return 'bg-success/55';
  if (thread.isOutdated) return 'bg-text-tertiary/50';
  if (!task) return 'bg-border-default';
  if (task.error || task.internal_state === 'failed') return 'bg-danger';
  if (task.internal_state === 'stale') return 'bg-warning';
  if (task.disposition === 'needs_user_input') return 'bg-info';
  if (task.status === 'ready_to_post') return 'bg-accent';
  if (task.disposition === 'implement') return 'bg-accent';
  if (task.disposition === 'push_back') return 'bg-warning';
  return 'bg-border-default';
}

/** Single status pill shown on every thread row — the at-a-glance state. */
export function getThreadPill(
  task: ReviewTask | undefined,
  thread: PrReviewThread,
): { label: string; variant: BadgeVariant } | null {
  if (thread.isResolved) return { label: 'Resolved', variant: 'success' };
  if (thread.isOutdated) return { label: 'Outdated', variant: 'default' };
  if (!task) return null;
  if (task.error || task.internal_state === 'failed') return { label: 'Needs attention', variant: 'danger' };
  if (task.internal_state === 'stale') return { label: 'Stale', variant: 'warning' };
  if (task.disposition === 'needs_user_input') return { label: 'Needs you', variant: 'info' };
  if (task.status === 'ready_to_post') return { label: 'Draft ready', variant: 'accent' };
  if (task.disposition === 'implement') return { label: 'Implement', variant: 'accent' };
  if (task.disposition === 'push_back') return { label: 'Push back', variant: 'warning' };
  if (task.status === 'needs_review') return { label: 'To assess', variant: 'warning' };
  return { label: STATUS_LABEL[task.status], variant: 'default' };
}

/**
 * Latest verdict per reviewer. GitHub records one review event per submission,
 * so a single reviewer (especially bots like Cursor) appears many times; the
 * strip collapses those to one row each, showing the most recent stance.
 */
export interface ReviewerVerdict {
  author: string;
  state: PrTopLevelReview['state'];
  submittedAt: string | null;
  url: string;
}

export function summarizeReviewers(reviews: PrTopLevelReview[]): ReviewerVerdict[] {
  const latestByAuthor = new Map<string, PrTopLevelReview>();
  for (const review of reviews) {
    const existing = latestByAuthor.get(review.author);
    const current = review.submittedAt ? Date.parse(review.submittedAt) : 0;
    const prior = existing?.submittedAt ? Date.parse(existing.submittedAt) : 0;
    if (!existing || current >= prior) {
      latestByAuthor.set(review.author, review);
    }
  }
  return [...latestByAuthor.values()]
    .sort((a, b) => (b.submittedAt ? Date.parse(b.submittedAt) : 0) - (a.submittedAt ? Date.parse(a.submittedAt) : 0))
    .map((review) => ({ author: review.author, state: review.state, submittedAt: review.submittedAt, url: review.url }));
}

export function isAddressingReview(
  stats: ReviewStats,
  automationPhase: string | null,
  sessionStatus: string,
): boolean {
  return automationPhase === 'addressing_review'
    || stats.queuedCodeCount > 0
    || (sessionStatus === 'active' && stats.updatingCodeCount > 0);
}

export type NextActionKind =
  | 'assessment-running'
  | 'updating-code'
  | 'needs-attention'
  | 'post-drafted-replies'
  | 'decisions-need-you'
  | 'fixes-ready'
  | 'draft-replies'
  | 'assess-new';

export interface NextActionButtonDecision {
  label: string;
  actionKey: string;
  variant?: 'secondary';
  disabled: boolean;
  title?: string;
}

export interface NextActionDecision {
  kind: NextActionKind;
  tone: 'accent' | 'danger' | 'warning' | 'info' | 'neutral';
  text: string;
  busy?: boolean;
  button?: NextActionButtonDecision;
}

export interface NextActionInputs {
  stats: ReviewStats;
  assessmentPending: { taskIds: string[]; scope: 'queue' | 'selected' | 'all' } | null;
  addressingReview: boolean;
  isOwner: boolean;
  ownerTitle: string | undefined;
}

/**
 * The single most important next step. Mirrors the workflow state machine:
 * running work first, then blockers, then the next advancing action.
 */
export function deriveNextAction(inputs: NextActionInputs): NextActionDecision | null {
  const { stats, assessmentPending, addressingReview, isOwner, ownerTitle } = inputs;

  if (assessmentPending) {
    const isReassessment = assessmentPending.scope === 'selected' || assessmentPending.scope === 'all';
    const pendingCount = assessmentPending.taskIds.length;
    const detail = pendingCount > 0
      ? `${pendingCount} review ${plural(pendingCount, 'task')} running`
      : 'Assessment is running';
    return {
      kind: 'assessment-running',
      tone: 'accent',
      busy: true,
      text: `${isReassessment ? 'Reassessing' : 'Assessing'} — ${detail}`,
    };
  }
  if (addressingReview) {
    const count = Math.max(stats.queuedCodeCount, stats.updatingCodeCount);
    const detail = stats.queuedCodeCount > 0
      ? `${stats.queuedCodeCount} ${plural(stats.queuedCodeCount, 'task')} queued for the current update`
      : `${count} ${plural(count, 'task')} sent to the dev session`;
    return {
      kind: 'updating-code',
      tone: 'accent',
      busy: true,
      text: `Updating code for review feedback — ${detail}`,
    };
  }
  if (stats.failedCount > 0 || stats.staleCount > 0) {
    const count = stats.failedCount + stats.staleCount;
    const retryable = stats.retryableAttentionTaskIds.length;
    return {
      kind: 'needs-attention',
      tone: 'danger',
      text: `${count} review ${plural(count, 'task')} need attention`,
      button: {
        label: 'Reassess',
        actionKey: 'assess-attention',
        variant: 'secondary',
        disabled: !isOwner || retryable === 0,
        title: !isOwner ? ownerTitle : retryable === 0 ? 'No assessable tasks to retry' : undefined,
      },
    };
  }
  if (
    stats.readyToPostTasks.length > 0
    && stats.needsInputCount === 0
    && stats.needsReviewCount === 0
    && stats.implementCount === 0
  ) {
    const count = stats.readyToPostTasks.length;
    return {
      kind: 'post-drafted-replies',
      tone: 'accent',
      text: `Post ${count} drafted ${plural(count, 'reply', 'replies')}`,
      button: {
        label: 'Post all',
        actionKey: 'approve',
        disabled: !isOwner,
        title: ownerTitle,
      },
    };
  }
  if (stats.needsInputCount > 0) {
    return {
      kind: 'decisions-need-you',
      tone: 'info',
      text: `${stats.needsInputCount} ${plural(stats.needsInputCount, 'decision')} need you — implement, push back, or reply`,
    };
  }
  if (stats.implementCount > 0 && stats.needsReviewCount === 0) {
    const count = stats.implementCount;
    return {
      kind: 'fixes-ready',
      tone: 'accent',
      text: `${count} ${plural(count, 'fix', 'fixes')} ready for the agent`,
      button: {
        label: 'Address all',
        actionKey: 'address',
        disabled: !isOwner || addressingReview,
        title: ownerTitle,
      },
    };
  }
  if (stats.inProgressImplCount > 0 && stats.needsReviewCount === 0) {
    const count = stats.inProgressImplCount;
    return {
      kind: 'draft-replies',
      tone: 'neutral',
      text: `${count} addressed ${plural(count, 'thread')} — draft the replies`,
      button: {
        label: 'Draft replies',
        actionKey: 'draft',
        variant: 'secondary',
        disabled: !isOwner,
        title: ownerTitle,
      },
    };
  }
  if (stats.needsReviewCount > 0) {
    const count = stats.needsReviewCount;
    return {
      kind: 'assess-new',
      tone: 'warning',
      text: `${count} new ${plural(count, 'thread')} to assess`,
      button: {
        label: 'Assess',
        actionKey: 'assess',
        disabled: !isOwner,
        title: ownerTitle,
      },
    };
  }
  return null;
}
