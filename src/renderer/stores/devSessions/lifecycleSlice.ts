import {
  addToSet,
  dropSessionCacheEntries,
  pruneMapByKeys,
  pruneSetByKeys,
  removeFromSet,
  type PrCreationContext,
  type ReviewFilters,
import {
  beginLoadSessionsRequest,
  isCurrentLoadSessionsRequest,
import {
  checkDevSessionDirty,
  deleteDevSessionRecord,
  dismissExistingSession,
  loadDevSessionDiff,
  loadDevSessions,
  updateExistingSessionName,

export function createDevSessionsLifecycleSlice(
  set: DevSessionsSet,
  get: DevSessionsGet
): Pick<DevSessionsState,
  | 'markDeleting'
  | 'unmarkDeleting'
  | 'loadSessions'
  | 'checkSessionDirty'
  | 'deleteDevSession'
  | 'dismissSession'
  | 'updateSessionName'
  | 'loadDiff'
> {
  return {
    markDeleting: (sessionId) =>
      set((state) => ({
        deletingSessionIds: addToSet(state.deletingSessionIds, sessionId),
      })),

    unmarkDeleting: (sessionId) =>
      set((state) => ({
        deletingSessionIds: removeFromSet(state.deletingSessionIds, sessionId),
      })),

    loadSessions: async (projectId) => {
      if (!projectId) {
        set({
          projectId: null,
          sessions: [],
          allSessions: [],
          selectedSessionId: null,
          isLoading: false,
          diffBySessionId: new Map<string, string | null>(),
          diffLoadingIds: new Set<string>(),
          reviewInboxBySessionId: new Map<string, ReviewInboxSnapshot>(),
          reviewLoadingIds: new Set<string>(),
          reviewErrorBySessionId: new Map<string, string | null>(),
          reviewFiltersBySessionId: new Map<string, ReviewFilters>(),
          prContextBySessionId: new Map<string, PrCreationContext>(),
          prContextLoadingIds: new Set<string>(),
          prStatusCache: new Map<string, PrStatus>(),
        });
        return;
      }

      const requestId = beginLoadSessionsRequest();
      const state = get();
      const isSameProject = state.projectId === projectId;

      if (!isSameProject) {
        set({
          projectId,
          sessions: [],
          allSessions: [],
          selectedSessionId: null,
          isLoading: true,
        });
      } else if (state.allSessions.length === 0) {
        set({ isLoading: true });
      }

      try {
        const { devSessions } = await loadDevSessions(projectId);

        if (!isCurrentLoadSessionsRequest(requestId) || get().projectId !== projectId) {
          return;
        }

        const allSessions = [...devSessions].sort(
          (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        );
        const validSessionIds = new Set(allSessions.map((session) => session.id));
        const currentSelectedId = get().selectedSessionId;

        let newSelectedId = currentSelectedId;
        if (!currentSelectedId || !allSessions.find((session) => session.id === currentSelectedId)) {
          const activeSession = allSessions.find((session) => session.status === 'active');
          newSelectedId = activeSession?.id || allSessions[0]?.id || null;
        }

        set({
          projectId,
          sessions: devSessions,
          allSessions,
          selectedSessionId: newSelectedId,
          isLoading: false,
          diffBySessionId: pruneMapByKeys(get().diffBySessionId, validSessionIds),
          diffLoadingIds: pruneSetByKeys(get().diffLoadingIds, validSessionIds),
          reviewInboxBySessionId: pruneMapByKeys(get().reviewInboxBySessionId, validSessionIds),
          reviewLoadingIds: pruneSetByKeys(get().reviewLoadingIds, validSessionIds),
          reviewErrorBySessionId: pruneMapByKeys(get().reviewErrorBySessionId, validSessionIds),
          reviewFiltersBySessionId: pruneMapByKeys(get().reviewFiltersBySessionId, validSessionIds),
          prContextBySessionId: pruneMapByKeys(get().prContextBySessionId, validSessionIds),
          prContextLoadingIds: pruneSetByKeys(get().prContextLoadingIds, validSessionIds),
          prStatusCache: pruneMapByKeys(get().prStatusCache, validSessionIds),
        });
      } catch (error) {
        console.error('[DevSessionsStore] Failed to load sessions:', error);
        if (!isCurrentLoadSessionsRequest(requestId) || get().projectId !== projectId) {
          return;
        }
        set({ isLoading: false });
      }
    },

    checkSessionDirty: async (sessionId) => {
      try {
        const result = await checkDevSessionDirty(sessionId);
        if (!result.success) {
          return {
            success: false,
            isDirty: false,
            files: [],
            error: result.error || 'Failed to check session status',
          };
        }

        return {
          success: true,
          isDirty: result.isDirty ?? false,
          files: result.files ?? [],
        };
      } catch (error) {
        return {
          success: false,
          isDirty: false,
          files: [],
          error: error instanceof Error ? error.message : 'Failed to check session status',
        };
      }
    },

    deleteDevSession: async (sessionId, mode) => {
      get().markDeleting(sessionId);
      try {
        const result = await deleteDevSessionRecord(sessionId, mode);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to delete session' };
        }

        if (projectId) {
          await get().loadSessions(projectId);
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete session',
        };
      } finally {
        get().unmarkDeleting(sessionId);
      }
    },

    dismissSession: async (session) => {
      const sessionId = session.id;
      get().markDeleting(sessionId);
      try {
        const result = await dismissExistingSession(session);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to dismiss session' };
        }

        if (get().selectedSessionId === sessionId) {
          set({ selectedSessionId: null });
        }

        const projectId = get().projectId;
        if (projectId) {
          await get().loadSessions(projectId);
        }

        set((state) => ({
          ...dropSessionCacheEntries(state, sessionId),
        }));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to dismiss session',
        };
      } finally {
        get().unmarkDeleting(sessionId);
      }
    },

    updateSessionName: async (session, name) => {
      try {
        const result = await updateExistingSessionName(session, name);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to update name' };
        }

        set((state) => ({
          allSessions: state.allSessions.map((entry) =>
            entry.id === session.id ? { ...entry, name } : entry
          ),
        }));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update name',
        };
      }
    },

    loadDiff: async (sessionId, options) => {
      const force = options?.force ?? false;
      const cachedDiff = get().diffBySessionId.get(sessionId);
      if (!force && get().diffBySessionId.has(sessionId)) {
        return { success: true, diff: cachedDiff ?? null };
      }

      set((state) => ({
        diffLoadingIds: addToSet(state.diffLoadingIds, sessionId),
      }));

      try {
        const result = await loadDevSessionDiff(sessionId);
        if (!result.success) {
        }

        const diff = result.diff && result.diff.length > 0 ? result.diff : null;
        set((state) => {
        });
        return { success: true, diff };
      } catch (error) {
      } finally {
        set((state) => ({
          diffLoadingIds: removeFromSet(state.diffLoadingIds, sessionId),
        }));
      }
    },
  };
}
