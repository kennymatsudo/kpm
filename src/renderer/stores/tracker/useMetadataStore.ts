import { create } from 'zustand';

  key: string;
  name: string;
}

  id: string;
  name: string;
  categoryKey: string;
}

  id: string;
  name: string;
  subtask: boolean;
  description?: string;
  iconUrl?: string;
}

  isLoadingProjects: boolean;
  projectsError: string | null;
  projectsLoadedAt: number | null;

  loadingStatusesFor: Set<string>;
  statusesErrorByProject: Record<string, string>;

  loadingIssueTypesFor: Set<string>;
  issueTypesErrorByProject: Record<string, string>;

  statusesLastFetchedAt: Record<string, number>;
  issueTypesLastFetchedAt: Record<string, number>;

  loadProjects: (force?: boolean) => Promise<{ success: boolean; error?: string }>;
  loadIssueTypes: (projectKey: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;

  reset: () => void;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const initialState = {
  isLoadingProjects: false,
  projectsError: null as string | null,
  projectsLoadedAt: null as number | null,

  loadingStatusesFor: new Set<string>(),
  statusesErrorByProject: {} as Record<string, string>,

  loadingIssueTypesFor: new Set<string>(),
  issueTypesErrorByProject: {} as Record<string, string>,

  statusesLastFetchedAt: {} as Record<string, number>,
  issueTypesLastFetchedAt: {} as Record<string, number>,
};

  ...initialState,

  loadProjects: async (force = false) => {
    const state = get();
    const now = Date.now();

    if (
      !force &&
      state.projects.length > 0 &&
      state.projectsLoadedAt &&
      now - state.projectsLoadedAt < CACHE_TTL_MS
    ) {
      return { success: true };
    }

    if (state.isLoadingProjects) {
      return { success: true };
    }

    set({ isLoadingProjects: true, projectsError: null });

    try {
      if (result.success && result.projects) {
        set({
          projects: result.projects,
          isLoadingProjects: false,
          projectsLoadedAt: Date.now(),
        });
        return { success: true };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load projects';
      set({ isLoadingProjects: false, projectsError: error });
      return { success: false, error };
    }
  },

    const state = get();

      if (lastFetched && Date.now() - lastFetched < CACHE_TTL_MS) {
        return { success: true };
      }
    }

      return { success: true };
    }

    set((s) => ({
    }));

    try {
      if (result.success && result.statuses) {
        set((s) => {
          return {
          };
        });
        return { success: true };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load statuses';
      set((s) => {
        return {
        };
      });
      return { success: false, error };
    }
  },

  loadIssueTypes: async (projectKey, force = false) => {
    const state = get();

    if (!force && state.issueTypesByProject[projectKey]?.length > 0) {
      const lastFetched = state.issueTypesLastFetchedAt[projectKey];
      if (lastFetched && Date.now() - lastFetched < CACHE_TTL_MS) {
        return { success: true };
      }
    }

    if (state.loadingIssueTypesFor.has(projectKey)) {
      return { success: true };
    }

    set((s) => ({
      loadingIssueTypesFor: new Set(s.loadingIssueTypesFor).add(projectKey),
      issueTypesErrorByProject: { ...s.issueTypesErrorByProject, [projectKey]: '' },
    }));

    try {
      if (result.success && result.issueTypes) {
        set((s) => {
          return {
            issueTypesLastFetchedAt: { ...s.issueTypesLastFetchedAt, [projectKey]: Date.now() },
          };
        });
        return { success: true };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load issue types';
      set((s) => {
        return {
          issueTypesErrorByProject: { ...s.issueTypesErrorByProject, [projectKey]: error },
        };
      });
      return { success: false, error };
    }
  },

  reset: () => set({
    ...initialState,
    loadingStatusesFor: new Set<string>(),
    loadingIssueTypesFor: new Set<string>(),
  }),
}));
