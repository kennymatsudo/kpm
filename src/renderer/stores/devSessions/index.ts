  // Data
  projectId: string | null;
  sessions: DevSessionWithPlanItem[];
  /** Alias for `sessions` retained so existing board code (`allSessions`) keeps working. */
  allSessions: DevSessionWithPlanItem[];
  selectedSessionId: string | null;
  isLoading: boolean;
  deletingSessionIds: Set<string>;
  lastActivityMap: Map<string, number>;

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
  dismissSession: (session: DevSessionWithPlanItem) => Promise<{ success: boolean; error?: string }>;
  updateSessionName: (session: DevSessionWithPlanItem, name: string) => Promise<{ success: boolean; error?: string }>;

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
