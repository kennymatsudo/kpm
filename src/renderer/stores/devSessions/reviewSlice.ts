import {
  DEFAULT_REVIEW_FILTERS,
  setMapValue,
  setReviewError,
  setReviewInbox,
  setReviewLoading,
} from './helpers';
import type { DevSessionsGet, DevSessionsSet, DevSessionsState } from './index';
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
        const result = await getReviewInbox(sessionId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to load review inbox';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox, { ensureFilters: true }));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load review inbox';
        set((state) => setReviewError(state, sessionId, message));
        return {
          success: false,
          error: message,
        };
      } finally {
        set((state) => setReviewLoading(state, sessionId, false));
      }
    },

    refreshReviewInbox: async (sessionId) => {
      set((state) => setReviewLoading(state, sessionId, true));

      try {
        const result = await refreshSessionReviewInbox(sessionId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to refresh review inbox';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh review inbox';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      } finally {
        set((state) => setReviewLoading(state, sessionId, false));
      }
    },

    assignReviewOwnership: async (sessionId) => {
      try {
        const result = await assignSessionReviewOwnership(sessionId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to assign review ownership';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to assign review ownership';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

      try {
        if (!result.success || !result.inbox) {
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
      }
    },

    draftPostImplReplies: async (sessionId) => {
      try {
        const result = await draftSessionPostImplReplies(sessionId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to draft post-implementation replies';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to draft post-implementation replies';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

    triggerReviewAutomation: async (sessionId, taskIds) => {
      try {
        const result = await triggerSessionReviewAutomation(sessionId, taskIds);
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
        const result = await replyToSessionReviewThread(sessionId, threadId, body, resolve);
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

    resolveReviewThread: async (sessionId, threadId) => {
      try {
        const result = await resolveSessionReviewThread(sessionId, threadId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to resolve review thread';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resolve review thread';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

    unresolveReviewThread: async (sessionId, threadId) => {
      try {
        const result = await unresolveSessionReviewThread(sessionId, threadId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to reopen review thread';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reopen review thread';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

    ignoreReviewTask: async (sessionId, taskId) => {
      try {
        const result = await ignoreSessionReviewTask(taskId);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to ignore review task';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to ignore review task';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

    overrideReviewDisposition: async (sessionId, taskId, disposition) => {
      try {
        const result = await overrideSessionReviewDisposition(taskId, disposition);
        if (!result.success || !result.inbox) {
          const error = result.error || 'Failed to override disposition';
          set((state) => setReviewError(state, sessionId, error));
          return { success: false, error };
        }

        const inbox = result.inbox;
        set((state) => setReviewInbox(state, sessionId, inbox));
        return { success: true, inbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to override disposition';
        set((state) => setReviewError(state, sessionId, message));
        return { success: false, error: message };
      }
    },

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
