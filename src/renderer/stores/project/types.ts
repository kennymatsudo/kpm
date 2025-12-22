import type { StateCreator } from 'zustand';
import type {
  Project,
  Repo,
  Attachment,
  PlanItem,
  PlanItemUpdates,
  PlanRelation,
  PlanAction,
  StatusCategory,
  FocusedResource,
} from '../../../shared/types';
import type { API } from '../../../preload/api';
import type { emit } from '../storeEvents';

// Re-export shared types for consumers of the store

export interface ProjectStoreDependencies {
  api: API;
  emit: typeof emit;
}

export interface ProjectStoreValues {
  projects: Project[];
  currentProjectId: string | null;
  planItems: PlanItem[];
  relations: PlanRelation[];
  repos: Repo[];
  repoBranches: Record<string, string | null>;  // repoId -> branch name
  attachments: Attachment[];
  isLoading: boolean;
  error: string | null;
  editingItemId: string | null;  // For edit panel - which task is being edited
}

export interface ProjectSlice {
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  setCurrentProject: (projectId: string | null) => void;
  reset: () => void;
}

export interface PlanSlice {
  updatePlanItems: (items: PlanItem[]) => void;
  setRelations: (relations: PlanRelation[]) => void;
  executePlanActions: (actions: PlanAction[]) => Promise<void>;
  addRelation: (fromId: string, toId: string, type: PlanRelation['relation_type']) => Promise<void>;
  removeRelation: (relationId: string) => Promise<void>;
  updateItemPosition: (itemId: string, x: number, y: number) => Promise<void>;
  updatePlanItem: (itemId: string, updates: PlanItemUpdates) => Promise<void>;
  updateStatusCategory: (itemId: string, statusCategory: StatusCategory) => Promise<void>;
  deletePlanItem: (itemId: string) => Promise<void>;
  deletePlanItemWithDescendants: (itemId: string) => Promise<void>;
  refreshPlanItems: () => Promise<void>;
}

export interface ResourceSlice {
  setRepos: (repos: Repo[]) => void;
  setAttachments: (attachments: Attachment[]) => void;
  addRepo: (repo: Repo) => void;
  removeRepo: (repoId: string) => void;
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (attachmentId: string) => void;
  setRepoBranches: (branches: Record<string, string | null>) => void;
  setRepoBranch: (repoId: string, branch: string | null) => void;
}

export interface UiSlice {
  setFocusedResources: (resources: FocusedResource[]) => void;
  removeFocusedResource: (resource: FocusedResource) => void;
  clearFocusedResources: () => void;
  setEditingItemId: (itemId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export type ProjectState = ProjectStoreValues &
  ProjectSlice &
  PlanSlice &
  ResourceSlice &
  UiSlice;

export type SliceCreator<TSlice> = (deps: ProjectStoreDependencies) => StateCreator<ProjectState, [], [], TSlice>;
