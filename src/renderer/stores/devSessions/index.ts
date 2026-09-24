import { create, type StoreApi } from 'zustand';
import type {
  DevSessionWithPlanItem,
  ReviewActionableSummary,
  ReviewDisposition,
  ReviewInboxSnapshot,
  AgentSessionState,
} from '../../../shared/types';
import type { AgentActivity, AgentQuestion, AgentCompletionSummary, PersistedAgentReview, ReviewFinding } from '../../../shared/agent-types';
import { appendActivity, createActivityFeed, type ActivityFeed } from '../../components/board-view/activityPresentation';
import {
  buildSessionIndexes,
  type PrCreationContext,
  type ReviewAssessmentOptions,
  type ReviewAssessmentPending,
  type ReviewFilters,
} from './helpers';
import { createDevSessionsLifecycleSlice } from './lifecycleSlice';
import { createDevSessionsPrSlice } from './prSlice';
import { invalidateLoadSessionsRequests } from './requestState';
import { createDevSessionsReviewSlice } from './reviewSlice';
import { getAgentState, listAgentReviewHistory } from '../../services/agentSessionService';
import { getDevSessionStepCosts } from '../../services/usageService';

export interface BackgroundCommitState {
  status: 'running' | 'failed';
  message: string;
  startedAt: number;
  error?: string;
  moveToReviewOnSuccess?: boolean;
}

/** One review-role runtime observed for an implementation session (opposing review or a playbook subagent). */
export interface ReviewRunRecord {
  sessionId: string;
  stepId?: string;
  runIndex?: number;
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
  diffBySessionId: Map<string, string | null>;
  diffErrorBySessionId: Map<string, string>;
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

  // Computed merge order (refreshed alongside sessions)
  mergeOrderBySessionId: Map<string, { layer: number | null; blockedBy: string[] }>;

  // Agent session state (board-driven execution)
  agentStateBySessionId: Map<string, AgentSessionState>;
  activityFeedBySessionId: Map<string, ActivityFeed>;
  latestActivityBySessionId: Map<string, AgentActivity>;
  questionBySessionId: Map<string, AgentQuestion | null>;
  completionBySessionId: Map<string, AgentCompletionSummary>;
  reviewFindingsBySessionId: Map<string, ReviewFinding[]>;
  stepCostsBySessionId: Map<string, Record<string, number>>;
  /** Every saved review run of an implementation session, oldest first, with findings and the implementer's replies. */
  reviewHistoryBySessionId: Map<string, PersistedAgentReview[]>;
  /** Review-role runtimes seen for each implementation session, keyed by that session's id. */
  reviewRunsByImplementationId: Map<string, ReviewRunRecord[]>;

  // Actions
  setSessions: (sessions: DevSessionWithPlanItem[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setCommitState: (sessionId: string, state: BackgroundCommitState | null) => void;

  // PR polling
  pollPrStatuses: () => Promise<void>;

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
  assessReviewThreads: (sessionId: string, options?: ReviewAssessmentOptions) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  draftPostImplReplies: (sessionId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  triggerReviewAutomation: (sessionId: string, taskIds?: string[]) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; taskIds?: string[]; context?: string; error?: string }>;
  replyToReviewThread: (sessionId: string, threadId: string, body: string, resolve?: boolean) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; replyId?: string; resolved?: boolean; error?: string }>;
  resolveReviewThread: (sessionId: string, threadId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  unresolveReviewThread: (sessionId: string, threadId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  ignoreReviewTask: (sessionId: string, taskId: string) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  overrideReviewDisposition: (sessionId: string, taskId: string, disposition: ReviewDisposition) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>;
  setReviewFilters: (sessionId: string, filters: Partial<ReviewFilters>) => void;
  setReviewActionable: (summary: ReviewActionableSummary) => void;
  loadPrContext: (
    sessionId: string,
    options?: { force?: boolean; featureContextPath?: string | null }
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
  /** Record that `run.sessionId` is a review-role runtime for `implementationSessionId`. Idempotent per session id. */
  recordReviewRun: (implementationSessionId: string, run: ReviewRunRecord) => void;
  hydrateAgentSnapshot: (
    devSessionId: string,
    snapshot: {
      state?: AgentSessionState | null;
      activities?: AgentActivity[];
    }
  ) => void;
  reconcileAgentStates: (devSessionIds: string[]) => Promise<void>;
  loadStepCosts: (devSessionId: string) => Promise<void>;
  loadReviewHistory: (devSessionId: string) => Promise<void>;
  getAgentState: (devSessionId: string) => AgentSessionState | undefined;

  // Reset
  reset: () => void;
  resetProjectState: () => void;
}

/**
 * Fresh, non-aliased initial state. Every Map/Set is constructed anew on each
 * call so spreading this into `set()` (at store creation and on reset) never
 * re-shares a collection instance across store lifetimes.
 */
function createInitialState() {
  return {
    projectId: null as string | null,
    sessions: [] as DevSessionWithPlanItem[],
    allSessions: [] as DevSessionWithPlanItem[],
    sessionById: new Map<string, DevSessionWithPlanItem>(),
    sessionsByPlanItemId: new Map<string, DevSessionWithPlanItem[]>(),
    selectedSessionId: null as string | null,
    isLoading: false,
    deletingSessionIds: new Set<string>(),
    diffBySessionId: new Map<string, string | null>(),
    diffErrorBySessionId: new Map<string, string>(),
    diffLoadingIds: new Set<string>(),
    commitStateBySessionId: new Map<string, BackgroundCommitState>(),
    reviewInboxBySessionId: new Map<string, ReviewInboxSnapshot>(),
    reviewLoadingIds: new Set<string>(),
    reviewErrorBySessionId: new Map<string, string | null>(),
    reviewFiltersBySessionId: new Map<string, ReviewFilters>(),
    reviewActionableBySessionId: new Map<string, ReviewActionableSummary>(),
    reviewAssessmentPendingBySessionId: new Map<string, ReviewAssessmentPending>(),
    prContextBySessionId: new Map<string, PrCreationContext>(),
    prContextLoadingIds: new Set<string>(),
    mergeOrderBySessionId: new Map<string, { layer: number | null; blockedBy: string[] }>(),
    agentStateBySessionId: new Map<string, AgentSessionState>(),
    activityFeedBySessionId: new Map<string, ActivityFeed>(),
    latestActivityBySessionId: new Map<string, AgentActivity>(),
    questionBySessionId: new Map<string, AgentQuestion | null>(),
    completionBySessionId: new Map<string, AgentCompletionSummary>(),
    reviewFindingsBySessionId: new Map<string, ReviewFinding[]>(),
    stepCostsBySessionId: new Map<string, Record<string, number>>(),
    reviewHistoryBySessionId: new Map<string, PersistedAgentReview[]>(),
    reviewRunsByImplementationId: new Map<string, ReviewRunRecord[]>(),
  };
}

export type DevSessionsSet = StoreApi<DevSessionsState>['setState'];
export type DevSessionsGet = StoreApi<DevSessionsState>['getState'];

export const useDevSessionsStore = create<DevSessionsState>((set, get) => ({
  ...createInitialState(),

  setSessions: (sessions) => set({ sessions, ...buildSessionIndexes(sessions) }),
  setSelectedSessionId: (sessionId) => set({ selectedSessionId: sessionId }),
  setIsLoading: (isLoading) => set({ isLoading }),

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
      if (state === 'starting' || state === 'working') {
        const nextCommitState = new Map(s.commitStateBySessionId);
        nextCommitState.delete(devSessionId);
        updates.commitStateBySessionId = nextCommitState;
      }
      return updates;
    });
  },

  handleAgentActivity: (devSessionId, activity) => {
    set((s) => {
      const nextLatest = new Map(s.latestActivityBySessionId);
      nextLatest.set(devSessionId, activity);
      const nextFeeds = new Map(s.activityFeedBySessionId);
      nextFeeds.set(devSessionId, appendActivity(nextFeeds.get(devSessionId) ?? createActivityFeed(), activity));
      return { latestActivityBySessionId: nextLatest, activityFeedBySessionId: nextFeeds };
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
      const nextFeeds = new Map(s.activityFeedBySessionId);
      nextFeeds.set(devSessionId, appendActivity(nextFeeds.get(devSessionId) ?? createActivityFeed(), errorActivity));
      return {
        agentStateBySessionId: nextState,
        latestActivityBySessionId: nextLatest,
        activityFeedBySessionId: nextFeeds,
      };
    });
  },

  recordReviewRun: (implementationSessionId, run) => {
    set((s) => {
      const existing = s.reviewRunsByImplementationId.get(implementationSessionId) ?? [];
      const withoutRun = existing.filter((entry) => entry.sessionId !== run.sessionId);
      const next = new Map(s.reviewRunsByImplementationId);
      next.set(implementationSessionId, [...withoutRun, run]);
      return { reviewRunsByImplementationId: next };
    });
  },

  hydrateAgentSnapshot: (devSessionId, snapshot) => {
    set((s) => {
      const nextState = new Map(s.agentStateBySessionId);
      if (snapshot.state) {
        nextState.set(devSessionId, snapshot.state);
      }

      const nextFeeds = new Map(s.activityFeedBySessionId);
      const nextLatest = new Map(s.latestActivityBySessionId);
      if (snapshot.activities) {
        nextFeeds.set(devSessionId, createActivityFeed(snapshot.activities));
        const latest = snapshot.activities.at(-1);
        if (latest) {
          nextLatest.set(devSessionId, latest);
        } else {
          nextLatest.delete(devSessionId);
        }
      }

      return {
        agentStateBySessionId: nextState,
        activityFeedBySessionId: nextFeeds,
        latestActivityBySessionId: nextLatest,
      };
    });
  },

  getAgentState: (devSessionId) => {
    return get().agentStateBySessionId.get(devSessionId);
  },

  loadStepCosts: async (devSessionId) => {
    const response = await getDevSessionStepCosts(devSessionId);
    set((state) => {
      const next = new Map(state.stepCostsBySessionId);
      next.set(devSessionId, response.costs);
      return { stepCostsBySessionId: next };
    });
  },

  loadReviewHistory: async (devSessionId) => {
    const response = await listAgentReviewHistory({ devSessionId });
    if (!response.success) return;
    set((state) => {
      const next = new Map(state.reviewHistoryBySessionId);
      next.set(devSessionId, response.reviews ?? []);
      return { reviewHistoryBySessionId: next };
    });
  },

  // Pull authoritative state from the main process for each session and merge
  // it into `agentStateBySessionId`. Main is the source of truth; renderer
  // event streams can drop events across HMR/reload, so reconciling here
  // keeps the UI self-healing.
  reconcileAgentStates: async (devSessionIds) => {
    if (devSessionIds.length === 0) return;
    const results = await Promise.allSettled(
      devSessionIds.map(async (id) => ({ id, res: await getAgentState({ devSessionId: id }) }))
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

  reset: () => resetState(set),
  resetProjectState: () => resetState(set),
  ...createDevSessionsReviewSlice(set, get),
}));

/** Shared by the `reset` and `resetProjectState` action names — both fully reinitialize the store with freshly constructed collections. */
function resetState(set: DevSessionsSet): void {
  invalidateLoadSessionsRequests();
  set(createInitialState());
}
