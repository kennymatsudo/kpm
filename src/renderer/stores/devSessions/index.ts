  // Data
  projectId: string | null;
  sessions: DevSessionWithPlanItem[];
  /** Alias for `sessions` retained so existing board code (`allSessions`) keeps working. */
  allSessions: DevSessionWithPlanItem[];
  selectedSessionId: string | null;
  isLoading: boolean;
  deletingSessionIds: Set<string>;

  // Actions
  setSessions: (sessions: DevSessionWithPlanItem[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;

  // Delete tracking
  markDeleting: (sessionId: string) => void;
  unmarkDeleting: (sessionId: string) => void;

  // Load function
  loadSessions: (projectId: string) => Promise<void>;
  dismissSession: (session: DevSessionWithPlanItem) => Promise<{ success: boolean; error?: string }>;
  updateSessionName: (session: DevSessionWithPlanItem, name: string) => Promise<{ success: boolean; error?: string }>;

  // Reset
  reset: () => void;
}

const initialState = {
  projectId: null as string | null,
  sessions: [] as DevSessionWithPlanItem[],
  allSessions: [] as DevSessionWithPlanItem[],
  selectedSessionId: null as string | null,
  isLoading: false,
  deletingSessionIds: new Set<string>(),
};


export const useDevSessionsStore = create<DevSessionsState>((set, get) => ({
  ...initialState,

  setSelectedSessionId: (sessionId) => set({ selectedSessionId: sessionId }),
  setIsLoading: (isLoading) => set({ isLoading }),

  reset: () => {
    set({
      ...initialState,
      deletingSessionIds: new Set<string>(),
    });
  },
}));
