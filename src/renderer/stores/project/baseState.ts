import type { ProjectStoreValues } from './types';

export const createBaseState = (): ProjectStoreValues => ({
  projects: [],
  currentProjectId: null,
  planItems: [],
  relations: [],
  repos: [],
  repoBranches: {},
  attachments: [],
  isLoading: false,
  isSwitchingProject: false,
  error: null,
  focusedResources: [],
  focusedResourcesBySession: {},
  editingItemId: null,
});
