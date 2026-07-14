import {
  DEFAULT_REVIEW_FILTERS,
  runReviewInboxOp,
  setMapValue,
  setReviewError,
  setReviewInbox,
  setReviewLoading,
  type ReviewAssessmentOptions,
  type ReviewAssessmentPending,
} from './helpers';
import type { DevSessionsGet, DevSessionsSet, DevSessionsState } from './index';
import type { ReviewInboxSnapshot, ReviewTask } from '../../../shared/types';
import {
  assessSessionReviewThreads,
  assignSessionReviewOwnership,
  draftSessionPostImplReplies,
  getReviewInbox,
  ignoreSessionReviewTask,
  overrideSessionReviewDisposition,
  refreshSessionReviewInbox,
  replyToSessionReviewThread,
  resolveSessionReviewThread,
  triggerSessionReviewAutomation,
  unresolveSessionReviewThread,
} from '../../services/reviewService';

function isAssessableReviewTask(task: ReviewTask): boolean {
  return task.internal_state !== 'ignored'
    && (task.status === 'needs_review' || task.status === 'assessed' || task.status === 'ready_to_post');
}

function buildAssessmentPending(
  sessionId: string,
  inbox: ReviewInboxSnapshot | undefined,
  options: ReviewAssessmentOptions | undefined
): ReviewAssessmentPending {
  if (options?.taskIds) {
    return {
      taskIds: Array.from(new Set(options.taskIds)),
      scope: 'selected',
      startedAt: Date.now(),
    };
  }

  const scope = options?.reassessAll ? 'all' : 'queue';
  const taskIds = (inbox?.tasks ?? [])
    .filter((task) => task.session_id === sessionId)
    .filter((task) => options?.reassessAll
      ? isAssessableReviewTask(task)
      : task.internal_state !== 'ignored' && task.status === 'needs_review')
    .map((task) => task.id);

  return { taskIds, scope, startedAt: Date.now() };
}

function setAssessmentPending<State extends Pick<DevSessionsState, 'reviewAssessmentPendingBySessionId'>>(
  state: State,
  sessionId: string,
  pending: ReviewAssessmentPending | null
) {
  const next = new Map(state.reviewAssessmentPendingBySessionId);
  if (pending) {
    next.set(sessionId, pending);
  } else {
    next.delete(sessionId);
  }
  return { reviewAssessmentPendingBySessionId: next };
}

export function createDevSessionsReviewSlice(
  set: DevSessionsSet,
  get: DevSessionsGet
): Pick<DevSessionsState,
  | 'loadReviewInbox'
  | 'refreshReviewInbox'
  | 'assignReviewOwnership'
  | 'assessReviewThreads'
  | 'draftPostImplReplies'
  | 'triggerReviewAutomation'
  | 'replyToReviewThread'
  | 'resolveReviewThread'
  | 'unresolveReviewThread'
  | 'ignoreReviewTask'
  | 'overrideReviewDisposition'
  | 'setReviewFilters'
> {
  return {
    loadReviewInbox: async (sessionId, options) => {
      const force = options?.force ?? false;
      const cachedInbox = get().reviewInboxBySessionId.get(sessionId);
      const cachedError = get().reviewErrorBySessionId.get(sessionId);
      if (!force && cachedInbox && !cachedError) {
        return { success: true, inbox: cachedInbox };
      }

      set((state) => setReviewLoading(state, sessionId, true));

      try {
        return await runReviewInboxOp(
          set,
          sessionId,
          'Failed to load review inbox',
          () => getReviewInbox({ sessionId }),
          { ensureFilters: true }
        );
      } finally {
        set((state) => setReviewLoading(state, sessionId, false));
      }
    },

    refreshReviewInbox: async (sessionId) => {
      set((state) => setReviewLoading(state, sessionId, true));

      try {
        return await runReviewInboxOp(
          set,
          sessionId,
          'Failed to refresh review inbox',
          () => refreshSessionReviewInbox({ sessionId })
        );
      } finally {
        set((state) => setReviewLoading(state, sessionId, false));
      }
    },

    assignReviewOwnership: (sessionId) =>
      runReviewInboxOp(
        set,
        sessionId,
        'Failed to assign review ownership',
        () => assignSessionReviewOwnership({ sessionId })
      ),

    assessReviewThreads: async (sessionId, options) => {
      const pending = buildAssessmentPending(sessionId, get().reviewInboxBySessionId.get(sessionId), options);
      set((state) => setAssessmentPending(state, sessionId, pending));

      try {
        const result = await assessSessionReviewThreads({ sessionId, ...options });
        if (!result.success) {
          const error = result.error || 'Failed to assess review threads';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to assess review threads';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      } finally {
        set((state) => setAssessmentPending(state, sessionId, null));
      }
    },

    draftPostImplReplies: (sessionId) =>
      runReviewInboxOp(
        set,
        sessionId,
        'Failed to draft post-implementation replies',
        () => draftSessionPostImplReplies({ sessionId })
      ),

    triggerReviewAutomation: async (sessionId, taskIds) => {
      try {
        const result = await triggerSessionReviewAutomation({ sessionId, taskIds });
        if (!result.success) {
          const error = result.error || 'Failed to trigger review automation';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        if (result.inbox) {
          const inbox = result.inbox;
          set((state) => setReviewInbox(state, sessionId, inbox));
        }

        const projectId = get().projectId;
        if (projectId) {
          await get().loadSessions(projectId);
        }

        return {
          success: true,
          inbox: result.inbox,
          taskIds: result.taskIds,
          context: result.context,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to trigger review automation';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

    replyToReviewThread: async (sessionId, threadId, body, resolve) => {
      try {
        const result = await replyToSessionReviewThread({ sessionId, threadId, body, resolve });
        if (!result.success) {
          const error = result.error || 'Failed to reply to review thread';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        if (result.inbox) {
          const inbox = result.inbox;
          set((state) => setReviewInbox(state, sessionId, inbox));
        }

        return {
          success: true,
          inbox: result.inbox,
          replyId: result.replyId,
          resolved: result.resolved,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reply to review thread';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

    resolveReviewThread: (sessionId, threadId) =>
      runReviewInboxOp(
        set,
        sessionId,
        'Failed to resolve review thread',
        () => resolveSessionReviewThread({ sessionId, threadId })
      ),

    unresolveReviewThread: (sessionId, threadId) =>
      runReviewInboxOp(
        set,
        sessionId,
        'Failed to reopen review thread',
        () => unresolveSessionReviewThread({ sessionId, threadId })
      ),

    ignoreReviewTask: (sessionId, taskId) =>
      runReviewInboxOp(
        set,
        sessionId,
        'Failed to ignore review task',
        () => ignoreSessionReviewTask({ taskId })
      ),

    overrideReviewDisposition: (sessionId, taskId, disposition) =>
      runReviewInboxOp(
        set,
        sessionId,
        'Failed to override disposition',
        () => overrideSessionReviewDisposition({ taskId, disposition })
      ),

    setReviewFilters: (sessionId, filters) =>
      set((state) => {
        const current = state.reviewFiltersBySessionId.get(sessionId) ?? DEFAULT_REVIEW_FILTERS;
        return {
          reviewFiltersBySessionId: setMapValue(state.reviewFiltersBySessionId, sessionId, {
            ...current,
            ...filters,
          }),
        };
      }),
  };
}
