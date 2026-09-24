import type {
  DevSessionWithPlanItem,
  ReviewActionableSummary,
  ReviewInboxSnapshot,
} from '../../../shared/types';
import { summarizeReviewThreads } from '../../../shared/reviewThreadSummary';
import type { DevSessionsSet, DevSessionsState } from './index';

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

/**
 * Which session ids may key one per-session collection.
 *
 * `impl` collections are written only for the implementation session the user
 * started. `runtime` collections are also written for the runtimes launched on
 * its behalf — the review twin and every playbook subagent — whose ids are
 * derived from the implementation id and cannot be enumerated from the session
 * list, because they depend on the cursor and attempt count.
 */
export type SessionKeying = 'impl' | 'runtime';

type PerSessionKey = {
  [K in keyof DevSessionsState]: DevSessionsState[K] extends Map<string, unknown> | Set<string>
    ? K
    : never;
}[keyof DevSessionsState];

interface PerSessionCollection {
  kind: 'map' | 'set';
  keying: SessionKeying;
}

/**
 * Every collection the store keys by session id, declared once. The type is
 * exhaustive over `DevSessionsState`, so a new per-session map cannot compile
 * until it says whose ids may key it — which is what stops it being missed by
 * one disposal path and dropped by another.
 *
 * Three collections are deliberately absent: `mergeOrderBySessionId` is
 * replaced wholesale on every load, and `sessionById` / `sessionsByPlanItemId`
 * are indexes `buildSessionIndexes` rebuilds from the session list.
 */
export const PER_SESSION_STATE = {
  deletingSessionIds: { kind: 'set', keying: 'impl' },
  diffBySessionId: { kind: 'map', keying: 'impl' },
  diffErrorBySessionId: { kind: 'map', keying: 'runtime' },
  diffLoadingIds: { kind: 'set', keying: 'impl' },
  commitStateBySessionId: { kind: 'map', keying: 'impl' },
  reviewInboxBySessionId: { kind: 'map', keying: 'impl' },
  reviewLoadingIds: { kind: 'set', keying: 'impl' },
  reviewErrorBySessionId: { kind: 'map', keying: 'impl' },
  reviewFiltersBySessionId: { kind: 'map', keying: 'impl' },
  reviewActionableBySessionId: { kind: 'map', keying: 'impl' },
  reviewAssessmentPendingBySessionId: { kind: 'map', keying: 'impl' },
  prContextBySessionId: { kind: 'map', keying: 'impl' },
  prContextLoadingIds: { kind: 'set', keying: 'impl' },
  agentStateBySessionId: { kind: 'map', keying: 'runtime' },
  activityFeedBySessionId: { kind: 'map', keying: 'runtime' },
  latestActivityBySessionId: { kind: 'map', keying: 'runtime' },
  questionBySessionId: { kind: 'map', keying: 'runtime' },
  completionBySessionId: { kind: 'map', keying: 'runtime' },
  reviewFindingsBySessionId: { kind: 'map', keying: 'runtime' },
  stepCostsBySessionId: { kind: 'map', keying: 'runtime' },
  reviewHistoryBySessionId: { kind: 'map', keying: 'impl' },
  reviewRunsByImplementationId: { kind: 'map', keying: 'impl' },
} as const satisfies Record<
  Exclude<PerSessionKey, 'mergeOrderBySessionId' | 'sessionById' | 'sessionsByPlanItemId'>,
  PerSessionCollection
>;

type DeclaredKey = keyof typeof PER_SESSION_STATE;

/** A runtime id is the implementation id, or derived from it by suffix. */
function belongsToSession(key: string, sessionId: string): boolean {
  return key === sessionId || key.startsWith(`${sessionId}-`);
}

function keepsKey(key: string, keying: SessionKeying, liveSessionIds: Set<string>): boolean {
  if (keying === 'impl') return liveSessionIds.has(key);
  if (liveSessionIds.has(key)) return true;
  for (const sessionId of liveSessionIds) {
    if (belongsToSession(key, sessionId)) return true;
  }
  return false;
}

function retain(
  collection: Map<string, unknown> | Set<string>,
  keep: (key: string) => boolean,
): Map<string, unknown> | Set<string> {
  if (collection instanceof Set) {
    const next = new Set<string>();
    for (const key of collection) if (keep(key)) next.add(key);
    return next;
  }
  const next = new Map<string, unknown>();
  for (const [key, value] of collection) if (keep(key)) next.set(key, value);
  return next;
}

/**
 * Drops every per-session entry whose session is no longer loaded. The one
 * statable invariant afterwards: a key survives only if it is a live session's
 * id, or derived from one.
 */
export function retainPerSessionState(
  state: DevSessionsState,
  sessions: DevSessionWithPlanItem[],
): Partial<DevSessionsState> {
  const liveSessionIds = new Set(sessions.map((session) => session.id));
  const next: Record<string, unknown> = {};
  for (const [key, collection] of Object.entries(PER_SESSION_STATE)) {
    next[key] = retain(
      state[key as DeclaredKey],
      (entryKey) => keepsKey(entryKey, collection.keying, liveSessionIds),
    );
  }
  return next;
}

/** Drops one session's per-session entries, including its derived runtimes. */
export function dropPerSessionState(
  state: DevSessionsState,
  sessionId: string,
): Partial<DevSessionsState> {
  const next: Record<string, unknown> = {};
  for (const [key, collection] of Object.entries(PER_SESSION_STATE)) {
    next[key] = retain(
      state[key as DeclaredKey],
      (entryKey) => collection.keying === 'impl'
        ? entryKey !== sessionId
        : !belongsToSession(entryKey, sessionId),
    );
  }
  return next;
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
  return summarizeReviewThreads(sessionId, inbox).attention;
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

export type ReviewInboxOpResult =
  | { success: true; inbox: ReviewInboxSnapshot }
  | { success: false; error: string };

type ReviewInboxCall = () => Promise<
  | { success: true; inbox: ReviewInboxSnapshot }
  | { success: false; error?: string }
>;

export async function runReviewInboxOp(
  set: DevSessionsSet,
  sessionId: string,
  fallbackError: string,
  call: ReviewInboxCall,
  options?: { ensureFilters?: boolean }
): Promise<ReviewInboxOpResult> {
  try {
    const result = await call();
    if (!result.success) {
      const error = result.error || fallbackError;
      set((state) => setReviewError(state, sessionId, error));
      return { success: false, error };
    }
    set((state) => setReviewInbox(state, sessionId, result.inbox, options));
    return { success: true, inbox: result.inbox };
  } catch (error) {
    const message = error instanceof Error ? error.message : fallbackError;
    set((state) => setReviewError(state, sessionId, message));
    return { success: false, error: message };
  }
}
