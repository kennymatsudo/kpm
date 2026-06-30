import type {
  DevSessionWithPlanItem,
  PrStatus,
  ReviewActionableSummary,
  ReviewInboxSnapshot,
} from '../../../shared/types';
import type { BackgroundCommitState } from './index';

export interface PrCreationContext {
  suggestedTitle: string;
  body: string;
  branch?: string;
  baseBranch?: string;
  hasCommits?: boolean;
  prTemplate?: string | null;
  aiGenerated?: boolean;
  featureContextPath?: string | null;
}

export interface ReviewFilters {
  showResolved: boolean;
  showTopLevelReviews: boolean;
  showConversation: boolean;
}

export interface ReviewAssessmentOptions {
  taskIds?: string[];
  reassessAll?: boolean;
}

export interface ReviewAssessmentPending {
  taskIds: string[];
  scope: 'queue' | 'selected' | 'all';
  startedAt: number;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  showResolved: false,
  showTopLevelReviews: false,
  showConversation: false,
};

export function addToSet(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  next.add(value);
  return next;
}

export function removeFromSet(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  next.delete(value);
  return next;
}

export function pruneMapByKeys<T>(current: Map<string, T>, validKeys: Set<string>): Map<string, T> {
  const next = new Map<string, T>();
  for (const [key, value] of current.entries()) {
    if (validKeys.has(key)) {
      next.set(key, value);
    }
  }
  return next;
}

export function pruneSetByKeys(current: Set<string>, validKeys: Set<string>): Set<string> {
  const next = new Set<string>();
  for (const key of current.values()) {
    if (validKeys.has(key)) {
      next.add(key);
    }
  }
  return next;
}

export function setMapValue<T>(current: Map<string, T>, key: string, value: T): Map<string, T> {
  const next = new Map(current);
  next.set(key, value);
  return next;
}

export function buildSessionIndexes(sessions: DevSessionWithPlanItem[]): {
  sessionById: Map<string, DevSessionWithPlanItem>;
  sessionsByPlanItemId: Map<string, DevSessionWithPlanItem[]>;
} {
  const sessionById = new Map<string, DevSessionWithPlanItem>();
  const sessionsByPlanItemId = new Map<string, DevSessionWithPlanItem[]>();

  for (const session of sessions) {
    sessionById.set(session.id, session);
    if (!session.plan_item_id) continue;
    const itemSessions = sessionsByPlanItemId.get(session.plan_item_id) ?? [];
    itemSessions.push(session);
    sessionsByPlanItemId.set(session.plan_item_id, itemSessions);
  }

  return { sessionById, sessionsByPlanItemId };
}

interface SessionCacheState {
  diffBySessionId: Map<string, string | null>;
  diffLoadingIds: Set<string>;
  commitStateBySessionId: Map<string, BackgroundCommitState>;
  reviewInboxBySessionId: Map<string, ReviewInboxSnapshot>;
  reviewLoadingIds: Set<string>;
  reviewErrorBySessionId: Map<string, string | null>;
  reviewFiltersBySessionId: Map<string, ReviewFilters>;
  reviewActionableBySessionId: Map<string, ReviewActionableSummary>;
  reviewAssessmentPendingBySessionId: Map<string, ReviewAssessmentPending>;
  prContextBySessionId: Map<string, PrCreationContext>;
  prContextLoadingIds: Set<string>;
  prStatusCache: Map<string, PrStatus>;
}

export function dropSessionCacheEntries<State extends SessionCacheState>(
  state: State,
  sessionId: string
) {
  const diffBySessionId = new Map(state.diffBySessionId);
  diffBySessionId.delete(sessionId);

  const commitStateBySessionId = new Map(state.commitStateBySessionId);
  commitStateBySessionId.delete(sessionId);

  const reviewInboxBySessionId = new Map(state.reviewInboxBySessionId);
  reviewInboxBySessionId.delete(sessionId);

  const reviewErrorBySessionId = new Map(state.reviewErrorBySessionId);
  reviewErrorBySessionId.delete(sessionId);

  const reviewFiltersBySessionId = new Map(state.reviewFiltersBySessionId);
  reviewFiltersBySessionId.delete(sessionId);

  const reviewActionableBySessionId = new Map(state.reviewActionableBySessionId);
  reviewActionableBySessionId.delete(sessionId);

  const reviewAssessmentPendingBySessionId = new Map(state.reviewAssessmentPendingBySessionId);
  reviewAssessmentPendingBySessionId.delete(sessionId);

  const prContextBySessionId = new Map(state.prContextBySessionId);
  prContextBySessionId.delete(sessionId);

  const prStatusCache = new Map(state.prStatusCache);
  prStatusCache.delete(sessionId);

  return {
    diffBySessionId,
    diffLoadingIds: removeFromSet(state.diffLoadingIds, sessionId),
    commitStateBySessionId,
    reviewInboxBySessionId,
    reviewLoadingIds: removeFromSet(state.reviewLoadingIds, sessionId),
    reviewErrorBySessionId,
    reviewFiltersBySessionId,
    reviewActionableBySessionId,
    reviewAssessmentPendingBySessionId,
    prContextBySessionId,
    prContextLoadingIds: removeFromSet(state.prContextLoadingIds, sessionId),
    prStatusCache,
  };
}

interface ReviewState {
  reviewInboxBySessionId: Map<string, ReviewInboxSnapshot>;
  reviewLoadingIds: Set<string>;
  reviewErrorBySessionId: Map<string, string | null>;
  reviewFiltersBySessionId: Map<string, ReviewFilters>;
  reviewActionableBySessionId: Map<string, ReviewActionableSummary>;
}

export function computeActionableFromInbox(
  inbox: ReviewInboxSnapshot,
  sessionId: string
): ReviewActionableSummary {
  const counts = { needsInput: 0, failed: 0, stale: 0, errored: 0 };
  const openThreadIds = inbox.snapshot
    ? new Set(
      inbox.snapshot.threads
        .filter((thread) => !thread.isResolved && !thread.isOutdated)
        .map((thread) => thread.id)
    )
    : null;
  for (const t of inbox.tasks) {
    if (t.session_id !== sessionId) continue;
    if (t.status === 'done') continue;
    if (t.internal_state === 'ignored') continue;
    if (openThreadIds != null && !openThreadIds.has(t.thread_id)) continue;
    if (t.disposition === 'needs_user_input') counts.needsInput++;
    else if (t.internal_state === 'failed') counts.failed++;
    else if (t.internal_state === 'stale') counts.stale++;
    else if (t.error != null) counts.errored++;
  }
  const hasActionable =
    counts.needsInput > 0 || counts.failed > 0 || counts.stale > 0 || counts.errored > 0;
  return { sessionId, hasActionable, counts };
}

export function setReviewLoading<State extends ReviewState>(
  state: State,
  sessionId: string,
  isLoading: boolean
) {
  return {
    reviewLoadingIds: isLoading
      ? addToSet(state.reviewLoadingIds, sessionId)
      : removeFromSet(state.reviewLoadingIds, sessionId),
  };
}

export function setReviewError<State extends ReviewState>(
  state: State,
  sessionId: string,
  error: string | null
) {
  return {
    reviewErrorBySessionId: setMapValue(state.reviewErrorBySessionId, sessionId, error),
  };
}

export function setReviewInbox<State extends ReviewState>(
  state: State,
  sessionId: string,
  inbox: ReviewInboxSnapshot,
  options?: { ensureFilters?: boolean }
) {
  const nextFilters = new Map(state.reviewFiltersBySessionId);
  if (options?.ensureFilters && !nextFilters.has(sessionId)) {
    nextFilters.set(sessionId, { ...DEFAULT_REVIEW_FILTERS });
  }

  return {
    reviewInboxBySessionId: setMapValue(state.reviewInboxBySessionId, sessionId, inbox),
    reviewErrorBySessionId: setMapValue(state.reviewErrorBySessionId, sessionId, null),
    reviewFiltersBySessionId: nextFilters,
    reviewActionableBySessionId: setMapValue(
      state.reviewActionableBySessionId,
      sessionId,
      computeActionableFromInbox(inbox, sessionId)
    ),
  };
}
