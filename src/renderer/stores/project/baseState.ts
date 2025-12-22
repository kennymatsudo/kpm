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
  error: null,
  focusedResources: [],
  editingItemId: null,
});
