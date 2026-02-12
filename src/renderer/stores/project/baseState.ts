import type { ProjectStoreValues } from './types';

export const createBaseState = (): ProjectStoreValues => ({
  projects: [],
  currentProjectId: null,
  planItems: [],
  relations: [],
  repos: [],
  repoBranches: {},
  attachments: [],
  worktrees: [],
  worktreeLoading: {},
  isLoading: false,
  isSwitchingProject: false,
  error: null,
  focusedResources: [],
  focusedResourcesBySession: {},
  editingItemId: null,
});
