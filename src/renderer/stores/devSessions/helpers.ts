import type {
  PrStatus,
  ReviewInboxSnapshot,

export interface PrCreationContext {
  suggestedTitle: string;
  body: string;
  branch?: string;
  baseBranch?: string;
  hasCommits?: boolean;
  prTemplate?: string | null;
  aiGenerated?: boolean;
}

export interface ReviewFilters {
  showResolved: boolean;
  showTopLevelReviews: boolean;
  showConversation: boolean;
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

interface SessionCacheState {
  diffBySessionId: Map<string, string | null>;
  diffLoadingIds: Set<string>;
  reviewInboxBySessionId: Map<string, ReviewInboxSnapshot>;
  reviewLoadingIds: Set<string>;
  reviewErrorBySessionId: Map<string, string | null>;
  reviewFiltersBySessionId: Map<string, ReviewFilters>;
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

  const reviewInboxBySessionId = new Map(state.reviewInboxBySessionId);
  reviewInboxBySessionId.delete(sessionId);

  const reviewErrorBySessionId = new Map(state.reviewErrorBySessionId);
  reviewErrorBySessionId.delete(sessionId);

  const reviewFiltersBySessionId = new Map(state.reviewFiltersBySessionId);
  reviewFiltersBySessionId.delete(sessionId);

  const prContextBySessionId = new Map(state.prContextBySessionId);
  prContextBySessionId.delete(sessionId);

  const prStatusCache = new Map(state.prStatusCache);
  prStatusCache.delete(sessionId);

  return {
    diffBySessionId,
    diffLoadingIds: removeFromSet(state.diffLoadingIds, sessionId),
    reviewInboxBySessionId,
    reviewLoadingIds: removeFromSet(state.reviewLoadingIds, sessionId),
    reviewErrorBySessionId,
    reviewFiltersBySessionId,
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
  };
}
