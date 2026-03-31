import { create, type StoreApi } from 'zustand';
import type {
  DevSessionWithPlanItem,
  PrStatus,
  ReviewInboxSnapshot,

export interface DevSessionsState {
  // Data
  projectId: string | null;
  sessions: DevSessionWithPlanItem[];
  /** Alias for `sessions` retained so existing board code (`allSessions`) keeps working. */
  allSessions: DevSessionWithPlanItem[];
  selectedSessionId: string | null;
  isLoading: boolean;
  deletingSessionIds: Set<string>;
  lastActivityMap: Map<string, number>;
  diffBySessionId: Map<string, string | null>;
  diffLoadingIds: Set<string>;
  reviewInboxBySessionId: Map<string, ReviewInboxSnapshot>;
  reviewLoadingIds: Set<string>;
  reviewErrorBySessionId: Map<string, string | null>;
  reviewFiltersBySessionId: Map<string, ReviewFilters>;
  prContextBySessionId: Map<string, PrCreationContext>;
  prContextLoadingIds: Set<string>;

  // PR status cache (transient, keyed by sessionId)
  prStatusCache: Map<string, PrStatus>;

  // Actions
  setSessions: (sessions: DevSessionWithPlanItem[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  recordActivity: (sessionId: string) => void;

  // PR polling
  pollPrStatuses: () => Promise<void>;
  updatePrStatus: (sessionId: string, status: PrStatus) => void;

  // Delete tracking
  markDeleting: (sessionId: string) => void;
  unmarkDeleting: (sessionId: string) => void;

  // Load function
  loadSessions: (projectId: string) => Promise<void>;
  checkSessionDirty: (sessionId: string) => Promise<{ success: boolean; isDirty: boolean; files: string[]; error?: string }>;
  deleteDevSession: (sessionId: string, mode: 'cleanup' | 'destroy') => Promise<{ success: boolean; error?: string }>;
  dismissSession: (session: DevSessionWithPlanItem) => Promise<{ success: boolean; error?: string }>;
  updateSessionName: (session: DevSessionWithPlanItem, name: string) => Promise<{ success: boolean; error?: string }>;
  loadDiff: (sessionId: string, options?: { force?: boolean }) => Promise<{ success: boolean; diff: string | null; error?: string }>;
  loadReviewInbox: (sessionId: string, options?: { force?: boolean }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  refreshReviewInbox: (sessionId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  assignReviewOwnership: (sessionId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  draftPostImplReplies: (sessionId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  triggerReviewAutomation: (sessionId: string, taskIds?: string[]) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; taskIds?: string[]; context?: string; error?: string }>;
  replyToReviewThread: (sessionId: string, threadId: string, body: string, resolve?: boolean) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; replyId?: string; resolved?: boolean; error?: string }>;
  resolveReviewThread: (sessionId: string, threadId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  unresolveReviewThread: (sessionId: string, threadId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  ignoreReviewTask: (sessionId: string, taskId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  overrideReviewDisposition: (sessionId: string, taskId: string, disposition: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  setReviewFilters: (sessionId: string, filters: Partial<ReviewFilters>) => void;
  loadPrContext: (
    sessionId: string,
  ) => Promise<{ success: boolean; context?: PrCreationContext; error?: string }>;
  createPullRequest: (
    sessionId: string,
    title: string,
    body: string,
    draft: boolean
  ) => Promise<{ success: boolean; number?: number; url?: string; error?: string }>;
  linkPullRequest: (
    sessionId: string,
    prIdentifier: string
  ) => Promise<{ success: boolean; number?: number; url?: string; error?: string }>;

  // Reset
  reset: () => void;
  resetProjectState: () => void;
}

const initialState = {
  projectId: null as string | null,
  sessions: [] as DevSessionWithPlanItem[],
  allSessions: [] as DevSessionWithPlanItem[],
  selectedSessionId: null as string | null,
  isLoading: false,
  deletingSessionIds: new Set<string>(),
  lastActivityMap: new Map<string, number>(),
  diffBySessionId: new Map<string, string | null>(),
  diffLoadingIds: new Set<string>(),
  reviewInboxBySessionId: new Map<string, ReviewInboxSnapshot>(),
  reviewLoadingIds: new Set<string>(),
  reviewErrorBySessionId: new Map<string, string | null>(),
  reviewFiltersBySessionId: new Map<string, ReviewFilters>(),
  prContextBySessionId: new Map<string, PrCreationContext>(),
  prContextLoadingIds: new Set<string>(),
  prStatusCache: new Map<string, PrStatus>(),
};

/** Throttle map for recordActivity — tracks last update time per session */
const activityThrottleMap = new Map<string, number>();

export type DevSessionsSet = StoreApi<DevSessionsState>['setState'];
export type DevSessionsGet = StoreApi<DevSessionsState>['getState'];

export const useDevSessionsStore = create<DevSessionsState>((set, get) => ({
  ...initialState,

  setSelectedSessionId: (sessionId) => set({ selectedSessionId: sessionId }),
  setIsLoading: (isLoading) => set({ isLoading }),

  recordActivity: (sessionId) => {
    const now = Date.now();
    const lastUpdate = activityThrottleMap.get(sessionId) || 0;
    if (now - lastUpdate < 1000) return; // throttle to 1 update per second
    activityThrottleMap.set(sessionId, now);
    set((state) => {
      const next = new Map(state.lastActivityMap);
      next.set(sessionId, now);
      return { lastActivityMap: next };
    });
  },


  ...createDevSessionsLifecycleSlice(set, get),
  ...createDevSessionsPrSlice(set, get),

  reset: () => {
    invalidateLoadSessionsRequests();
    set({
      ...initialState,
      deletingSessionIds: new Set<string>(),
    });
  },

  resetProjectState: () => {
    invalidateLoadSessionsRequests();
    set({
      ...initialState,
      deletingSessionIds: new Set<string>(),
    });
  },
  ...createDevSessionsReviewSlice(set, get),
}));
