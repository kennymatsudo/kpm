import { create, type StoreApi } from 'zustand';
import type {
  DevSessionWithPlanItem,
  PrStatus,
  ReviewActionableSummary,
  ReviewInboxSnapshot,
  AgentSessionState,
} from '../../../shared/types';
import type { AgentActivity, AgentQuestion, AgentCompletionSummary, ReviewFinding } from '../../../shared/agent-types';
import { createDevSessionsLifecycleSlice } from './lifecycleSlice';
import { createDevSessionsPrSlice } from './prSlice';
import { invalidateLoadSessionsRequests } from './requestState';
import { createDevSessionsReviewSlice } from './reviewSlice';
import { getAgentState } from '../../services/agentSessionService';

export interface BackgroundCommitState {
  status: 'running' | 'failed';
  message: string;
  startedAt: number;
  error?: string;
  moveToReviewOnSuccess?: boolean;
}

export interface DevSessionsState {
  // Data
  projectId: string | null;
  sessions: DevSessionWithPlanItem[];
  /** Alias for `sessions` retained so existing board code (`allSessions`) keeps working. */
  allSessions: DevSessionWithPlanItem[];
  sessionById: Map<string, DevSessionWithPlanItem>;
  sessionsByPlanItemId: Map<string, DevSessionWithPlanItem[]>;
  selectedSessionId: string | null;
  isLoading: boolean;
  deletingSessionIds: Set<string>;
  lastActivityMap: Map<string, number>;
  diffBySessionId: Map<string, string | null>;
  diffErrorBySessionId: Map<string, string>;
  diffLoadingIds: Set<string>;
  commitStateBySessionId: Map<string, BackgroundCommitState>;
  reviewInboxBySessionId: Map<string, ReviewInboxSnapshot>;
  reviewLoadingIds: Set<string>;
  reviewErrorBySessionId: Map<string, string | null>;
  reviewFiltersBySessionId: Map<string, ReviewFilters>;
  reviewActionableBySessionId: Map<string, ReviewActionableSummary>;
  prContextBySessionId: Map<string, PrCreationContext>;
  prContextLoadingIds: Set<string>;

  // PR status cache (transient, keyed by sessionId)
  prStatusCache: Map<string, PrStatus>;

  // Computed merge order (refreshed alongside sessions)
  mergeOrderBySessionId: Map<string, { layer: number | null; blockedBy: string[] }>;

  // Agent session state (board-driven execution)
  agentStateBySessionId: Map<string, AgentSessionState>;
  activitiesBySessionId: Map<string, AgentActivity[]>;
  latestActivityBySessionId: Map<string, AgentActivity>;
  questionBySessionId: Map<string, AgentQuestion | null>;
  completionBySessionId: Map<string, AgentCompletionSummary>;
  reviewFindingsBySessionId: Map<string, ReviewFinding[]>;

  // Actions
  setSessions: (sessions: DevSessionWithPlanItem[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  recordActivity: (sessionId: string) => void;
  setCommitState: (sessionId: string, state: BackgroundCommitState | null) => void;

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
  setReviewActionable: (summary: ReviewActionableSummary) => void;
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

  // Agent session actions (called from IPC listeners)
  handleAgentStateChanged: (devSessionId: string, state: AgentSessionState) => void;
  handleAgentActivity: (devSessionId: string, activity: AgentActivity) => void;
  handleAgentQuestion: (devSessionId: string, question: AgentQuestion) => void;
  handleAgentComplete: (devSessionId: string, summary: AgentCompletionSummary, findings?: ReviewFinding[]) => void;
  handleAgentError: (devSessionId: string, error: string) => void;
  hydrateAgentSnapshot: (
    devSessionId: string,
    snapshot: {
      state?: AgentSessionState | null;
      activities?: AgentActivity[];
    }
  ) => void;
  reconcileAgentStates: (devSessionIds: string[]) => Promise<void>;
  getAgentState: (devSessionId: string) => AgentSessionState | undefined;

  // Reset
  reset: () => void;
  resetProjectState: () => void;
}

const initialState = {
  projectId: null as string | null,
  sessions: [] as DevSessionWithPlanItem[],
  allSessions: [] as DevSessionWithPlanItem[],
  sessionById: new Map<string, DevSessionWithPlanItem>(),
  sessionsByPlanItemId: new Map<string, DevSessionWithPlanItem[]>(),
  selectedSessionId: null as string | null,
  isLoading: false,
  deletingSessionIds: new Set<string>(),
  lastActivityMap: new Map<string, number>(),
  diffBySessionId: new Map<string, string | null>(),
  diffErrorBySessionId: new Map<string, string>(),
  diffLoadingIds: new Set<string>(),
  commitStateBySessionId: new Map<string, BackgroundCommitState>(),
  reviewInboxBySessionId: new Map<string, ReviewInboxSnapshot>(),
  reviewLoadingIds: new Set<string>(),
  reviewErrorBySessionId: new Map<string, string | null>(),
  reviewFiltersBySessionId: new Map<string, ReviewFilters>(),
  reviewActionableBySessionId: new Map<string, ReviewActionableSummary>(),
  prContextBySessionId: new Map<string, PrCreationContext>(),
  prContextLoadingIds: new Set<string>(),
  prStatusCache: new Map<string, PrStatus>(),
  mergeOrderBySessionId: new Map<string, { layer: number | null; blockedBy: string[] }>(),
  agentStateBySessionId: new Map<string, AgentSessionState>(),
  activitiesBySessionId: new Map<string, AgentActivity[]>(),
  latestActivityBySessionId: new Map<string, AgentActivity>(),
  questionBySessionId: new Map<string, AgentQuestion | null>(),
  completionBySessionId: new Map<string, AgentCompletionSummary>(),
  reviewFindingsBySessionId: new Map<string, ReviewFinding[]>(),
};

/** Throttle map for recordActivity — tracks last update time per session */
const activityThrottleMap = new Map<string, number>();

export type DevSessionsSet = StoreApi<DevSessionsState>['setState'];
export type DevSessionsGet = StoreApi<DevSessionsState>['getState'];

export const useDevSessionsStore = create<DevSessionsState>((set, get) => ({
  ...initialState,

  setSessions: (sessions) => set({ sessions, ...buildSessionIndexes(sessions) }),
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

  setCommitState: (sessionId, commitState) => {
    set((state) => {
      const next = new Map(state.commitStateBySessionId);
      if (commitState) {
        next.set(sessionId, commitState);
      } else {
        next.delete(sessionId);
      }
      return { commitStateBySessionId: next };
    });
  },

  setReviewActionable: (summary) => {
    set((state) => {
      const next = new Map(state.reviewActionableBySessionId);
      next.set(summary.sessionId, summary);
      return { reviewActionableBySessionId: next };
    });
  },

  // Agent session handlers — called from IPC event listeners
  handleAgentStateChanged: (devSessionId, state) => {
    set((s) => {
      const nextState = new Map(s.agentStateBySessionId);
      nextState.set(devSessionId, state);
      const updates: Partial<typeof s> = { agentStateBySessionId: nextState };
      // Clear the pending question when the session resumes working
      if (state === 'working') {
        const nextQuestion = new Map(s.questionBySessionId);
        nextQuestion.set(devSessionId, null);
        updates.questionBySessionId = nextQuestion;
      }
      return updates;
    });
  },

  handleAgentActivity: (devSessionId, activity) => {
    set((s) => {
      const nextLatest = new Map(s.latestActivityBySessionId);
      nextLatest.set(devSessionId, activity);
      const nextAll = new Map(s.activitiesBySessionId);
      const existing = nextAll.get(devSessionId) ?? [];
      nextAll.set(devSessionId, [...existing, activity]);
      return { latestActivityBySessionId: nextLatest, activitiesBySessionId: nextAll };
    });
  },

  handleAgentQuestion: (devSessionId, question) => {
    set((s) => {
      const next = new Map(s.questionBySessionId);
      next.set(devSessionId, question);
      return { questionBySessionId: next };
    });
  },

  handleAgentComplete: (devSessionId, summary, findings) => {
    set((s) => {
      const nextCompletion = new Map(s.completionBySessionId);
      nextCompletion.set(devSessionId, summary);
      // Clear the pending question on completion
      const nextQuestion = new Map(s.questionBySessionId);
      nextQuestion.set(devSessionId, null);
      const nextFindings = new Map(s.reviewFindingsBySessionId);
      if (findings) {
        nextFindings.set(devSessionId, findings);
      }
      return {
        completionBySessionId: nextCompletion,
        questionBySessionId: nextQuestion,
        reviewFindingsBySessionId: nextFindings,
      };
    });
  },

  handleAgentError: (devSessionId, _error) => {
    set((s) => {
      const nextState = new Map(s.agentStateBySessionId);
      nextState.set(devSessionId, 'failed');
      const nextLatest = new Map(s.latestActivityBySessionId);
      const errorActivity: AgentActivity = {
        type: 'error',
        timestamp: Date.now(),
        summary: _error,
        content: _error,
      };
      nextLatest.set(devSessionId, errorActivity);
      const nextAll = new Map(s.activitiesBySessionId);
      const existing = nextAll.get(devSessionId) ?? [];
      nextAll.set(devSessionId, [...existing, errorActivity]);
      return {
        agentStateBySessionId: nextState,
        latestActivityBySessionId: nextLatest,
        activitiesBySessionId: nextAll,
      };
    });
  },

  hydrateAgentSnapshot: (devSessionId, snapshot) => {
    set((s) => {
      const nextState = new Map(s.agentStateBySessionId);
      if (snapshot.state) {
        nextState.set(devSessionId, snapshot.state);
      }

      const nextActivities = new Map(s.activitiesBySessionId);
      const nextLatest = new Map(s.latestActivityBySessionId);
      if (snapshot.activities) {
        nextActivities.set(devSessionId, snapshot.activities);
        const latest = snapshot.activities.at(-1);
        if (latest) {
          nextLatest.set(devSessionId, latest);
        } else {
          nextLatest.delete(devSessionId);
        }
      }

      return {
        agentStateBySessionId: nextState,
        activitiesBySessionId: nextActivities,
        latestActivityBySessionId: nextLatest,
      };
    });
  },

  getAgentState: (devSessionId) => {
    return get().agentStateBySessionId.get(devSessionId);
  },

  // Pull authoritative state from the main process for each session and merge
  // it into `agentStateBySessionId`. Main is the source of truth; renderer
  // event streams can drop events across HMR/reload, so reconciling here
  // keeps the UI self-healing.
  reconcileAgentStates: async (devSessionIds) => {
    if (devSessionIds.length === 0) return;
    const results = await Promise.allSettled(
      devSessionIds.map(async (id) => ({ id, res: await getAgentState(id) }))
    );
    set((s) => {
      const next = new Map(s.agentStateBySessionId);
      let changed = false;
      for (const entry of results) {
        if (entry.status !== 'fulfilled') continue;
        const { id, res } = entry.value;
        if (!res.success) continue;
        const remote = res.state ?? null;
        if (remote === null) {
          // Main has no session (evicted past TTL). If the local store still
          // thinks it's active, fall through to the completion event stream;
          // don't fabricate a terminal state from a missing lookup.
          continue;
        }
        if (next.get(id) !== remote) {
          next.set(id, remote);
          changed = true;
        }
      }
      return changed ? { agentStateBySessionId: next } : {};
    });
  },

  ...createDevSessionsLifecycleSlice(set, get),
  ...createDevSessionsPrSlice(set, get),

  reset: () => {
    invalidateLoadSessionsRequests();
    set({
      ...initialState,
      sessionById: new Map<string, DevSessionWithPlanItem>(),
      sessionsByPlanItemId: new Map<string, DevSessionWithPlanItem[]>(),
      deletingSessionIds: new Set<string>(),
    });
  },

  resetProjectState: () => {
    invalidateLoadSessionsRequests();
    set({
      ...initialState,
      sessionById: new Map<string, DevSessionWithPlanItem>(),
      sessionsByPlanItemId: new Map<string, DevSessionWithPlanItem[]>(),
      deletingSessionIds: new Set<string>(),
    });
  },
  ...createDevSessionsReviewSlice(set, get),
}));
