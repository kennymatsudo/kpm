import { create } from 'zustand';
import {
  listTrackerIssueTypes,
  listTrackerProjectStatuses,
  listTrackerProjects,
} from '../../services/trackerService';
import type { TrackerType } from '../../../shared/types';

/**
 * Cache key combines trackerType + projectKey so Jira "ENG" and a Linear team
 * "ENG" don't collide. Used internally for all per-project caches.
 */
function cacheKey(trackerType: TrackerType, projectKey: string): string {
  return `${trackerType}:${projectKey}`;
}

export interface TrackerProjectRef {
  key: string;
  name: string;
}

export interface TrackerStatusOption {
  id: string;
  name: string;
  categoryKey: string;
}

export interface TrackerIssueTypeOption {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
  iconUrl?: string;
}

interface TrackerMetadataState {
  projects: TrackerProjectRef[];
  isLoadingProjects: boolean;
  projectsError: string | null;
  projectsLoadedAt: number | null;

  statusesByProject: Record<string, TrackerStatusOption[]>;
  loadingStatusesFor: Set<string>;
  statusesErrorByProject: Record<string, string>;

  issueTypesByProject: Record<string, TrackerIssueTypeOption[]>;
  loadingIssueTypesFor: Set<string>;
  issueTypesErrorByProject: Record<string, string>;

  statusesLastFetchedAt: Record<string, number>;
  issueTypesLastFetchedAt: Record<string, number>;

  loadProjects: (force?: boolean) => Promise<{ success: boolean; error?: string }>;
  loadStatuses: (projectKey: string, trackerType?: TrackerType, force?: boolean) => Promise<{ success: boolean; error?: string }>;
  loadIssueTypes: (projectKey: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;

  reset: () => void;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const initialState = {
  projects: [] as TrackerProjectRef[],
  isLoadingProjects: false,
  projectsError: null as string | null,
  projectsLoadedAt: null as number | null,

  statusesByProject: {} as Record<string, TrackerStatusOption[]>,
  loadingStatusesFor: new Set<string>(),
  statusesErrorByProject: {} as Record<string, string>,

  issueTypesByProject: {} as Record<string, TrackerIssueTypeOption[]>,
  loadingIssueTypesFor: new Set<string>(),
  issueTypesErrorByProject: {} as Record<string, string>,

  statusesLastFetchedAt: {} as Record<string, number>,
  issueTypesLastFetchedAt: {} as Record<string, number>,
};

export const useTrackerMetadataStore = create<TrackerMetadataState>((set, get) => ({
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
      const result = await listTrackerProjects();
      if (result.success && result.projects) {
        set({
          projects: result.projects,
          isLoadingProjects: false,
          projectsLoadedAt: Date.now(),
        });
        return { success: true };
      }

      const error = result.error || 'Failed to load projects';
      set({ isLoadingProjects: false, projectsError: error });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load projects';
      set({ isLoadingProjects: false, projectsError: error });
      return { success: false, error };
    }
  },

  loadStatuses: async (projectKey, trackerType = 'jira', force = false) => {
    const state = get();
    const key = cacheKey(trackerType, projectKey);

    if (!force && state.statusesByProject[key]?.length > 0) {
      const lastFetched = state.statusesLastFetchedAt[key];
      if (lastFetched && Date.now() - lastFetched < CACHE_TTL_MS) {
        return { success: true };
      }
    }

    if (state.loadingStatusesFor.has(key)) {
      return { success: true };
    }

    set((s) => ({
      loadingStatusesFor: new Set(s.loadingStatusesFor).add(key),
      statusesErrorByProject: { ...s.statusesErrorByProject, [key]: '' },
    }));

    try {
      const result = await listTrackerProjectStatuses(projectKey, trackerType);
      if (result.success && result.statuses) {
        set((s) => {
          const nextLoading = new Set(s.loadingStatusesFor);
          nextLoading.delete(key);
          return {
            loadingStatusesFor: nextLoading,
            statusesLastFetchedAt: { ...s.statusesLastFetchedAt, [key]: Date.now() },
          };
        });
        return { success: true };
      }

      const error = result.error || 'Failed to load statuses';
      set((s) => {
        const nextLoading = new Set(s.loadingStatusesFor);
        nextLoading.delete(key);
        return {
          loadingStatusesFor: nextLoading,
          statusesErrorByProject: { ...s.statusesErrorByProject, [key]: error },
        };
      });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load statuses';
      set((s) => {
        const nextLoading = new Set(s.loadingStatusesFor);
        nextLoading.delete(key);
        return {
          loadingStatusesFor: nextLoading,
          statusesErrorByProject: { ...s.statusesErrorByProject, [key]: error },
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
      const result = await listTrackerIssueTypes(projectKey);
      if (result.success && result.issueTypes) {
        set((s) => {
          const nextLoading = new Set(s.loadingIssueTypesFor);
          nextLoading.delete(projectKey);
          return {
            loadingIssueTypesFor: nextLoading,
            issueTypesLastFetchedAt: { ...s.issueTypesLastFetchedAt, [projectKey]: Date.now() },
          };
        });
        return { success: true };
      }

      const error = result.error || 'Failed to load issue types';
      set((s) => {
        const nextLoading = new Set(s.loadingIssueTypesFor);
        nextLoading.delete(projectKey);
        return {
          loadingIssueTypesFor: nextLoading,
          issueTypesErrorByProject: { ...s.issueTypesErrorByProject, [projectKey]: error },
        };
      });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load issue types';
      set((s) => {
        const nextLoading = new Set(s.loadingIssueTypesFor);
        nextLoading.delete(projectKey);
        return {
          loadingIssueTypesFor: nextLoading,
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
