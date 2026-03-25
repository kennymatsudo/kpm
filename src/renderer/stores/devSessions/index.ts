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
  loadPrContext: (
    sessionId: string,
  ) => Promise<{ success: boolean; context?: PrCreationContext; error?: string }>;
  createPullRequest: (
    sessionId: string,
    title: string,
    body: string,
    draft: boolean
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
  prContextBySessionId: new Map<string, PrCreationContext>(),
  prContextLoadingIds: new Set<string>(),
  prStatusCache: new Map<string, PrStatus>(),
};

/** Throttle map for recordActivity — tracks last update time per session */
const activityThrottleMap = new Map<string, number>();


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


  reset: () => {
    set({
      ...initialState,
      deletingSessionIds: new Set<string>(),
    });
  },

  resetProjectState: () => {
    set({
      ...initialState,
      deletingSessionIds: new Set<string>(),
    });
  },
}));
