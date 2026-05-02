import type { StateCreator } from 'zustand';
import type {
  Project,
  Repo,
  RepoEnvironmentMode,
  Attachment,
  PlanItem,
  PlanItemUpdates,
  PlanRelation,
  PlanAction,
  StatusCategory,
  FocusedResource,
  Worktree,
} from '../../../shared/types';
import type { API } from '../../../preload/api';
import type { emit } from '../storeEvents';

// Re-export shared types for consumers of the store
export type { Project, Repo, Attachment, PlanItem, PlanRelation, FocusedResource, Worktree };

export interface ProjectStoreDependencies {
  api: API;
  emit: typeof emit;
}

/** Worktree operation types for loading state */
export type WorktreeOperation = 'launch' | 'resume' | 'delete' | 'openEditor';

export interface ProjectStoreValues {
  projects: Project[];
  currentProjectId: string | null;
  planItems: PlanItem[];
  relations: PlanRelation[];
  repos: Repo[];
  repoBranches: Record<string, string | null>;  // repoId -> branch name
  attachments: Attachment[];
  worktrees: Worktree[];  // Git worktrees for agent development
  worktreeLoading: Record<string, WorktreeOperation | null>;  // planItemId or worktreeId -> operation in progress
  isLoading: boolean;
  isSwitchingProject: boolean;  // True while loading a different project
  error: string | null;
  focusedResources: FocusedResource[];  // Active chat session context - items user wants to discuss
  focusedResourcesBySession: Record<string, FocusedResource[]>;  // chatSessionId -> focused resources
  editingItemId: string | null;  // For edit panel - which task is being edited
}

export interface ProjectSlice {
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  setCurrentProject: (projectId: string | null) => void;
  refreshProjects: () => Promise<Project[]>;
  updateProjectStorybookUrl: (projectId: string, storybookUrl: string | null) => Promise<Project[]>;
  testStorybookConnection: (url: string) => Promise<{ success: boolean; componentCount?: number; error?: string }>;
  reset: () => void;
  resetProjectState: () => void;  // Clears project-specific state while preserving project list
}

export interface PlanSlice {
  updatePlanItems: (items: PlanItem[]) => void;
  setRelations: (relations: PlanRelation[]) => void;
  executePlanActions: (actions: PlanAction[]) => Promise<void>;
  addRelation: (fromId: string, toId: string, type: PlanRelation['relation_type']) => Promise<void>;
  removeRelation: (relationId: string) => Promise<void>;
  updateItemPosition: (itemId: string, x: number, y: number) => Promise<void>;
  updateItemPositions: (updates: { id: string; x: number; y: number }[]) => Promise<void>;
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
  addReposToProject: (projectId: string, repoPaths: string[]) => Promise<Repo[]>;
  addReposFromDialog: (projectId: string) => Promise<Repo[]>;
  removeRepo: (repoId: string) => void;
  removeRepoFromProject: (projectId: string, repoId: string) => Promise<void>;
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (attachmentId: string) => void;
  refreshRepos: (projectId: string) => Promise<Repo[]>;
  setRepoBranches: (branches: Record<string, string | null>) => void;
  setRepoBranch: (repoId: string, branch: string | null) => void;
  updateRepoEnvironmentMode: (projectId: string, repoId: string, mode: RepoEnvironmentMode) => Promise<boolean>;
  setActiveWorktreePath: (projectId: string, repoId: string, worktreePath: string | null) => Promise<boolean>;
  // Worktree actions
  setWorktrees: (worktrees: Worktree[]) => void;
  addWorktree: (worktree: Worktree) => void;
  removeWorktree: (worktreeId: string) => void;
  openWorktreeInEditor: (worktreeId: string) => Promise<void>;
  deleteWorktree: (worktreeId: string, force?: boolean) => Promise<void>;
  destroyWorktree: (worktreeId: string) => Promise<void>;
}

export interface AddFocusedResourcesResult {
  /** Number of resources newly added (not already in the focus list). */
  added: number;
  /** Number of resources that were already present and skipped. */
  alreadyPresent: number;
}

export interface UiSlice {
  setFocusedResources: (resources: FocusedResource[]) => void;
  /** Append a single resource. Returns whether it was newly added (false = duplicate). */
  addFocusedResource: (resource: FocusedResource) => { added: boolean };
  /** Append multiple resources in a single state update. Returns added/alreadyPresent counts. */
  addFocusedResources: (resources: FocusedResource[]) => AddFocusedResourcesResult;
  removeFocusedResource: (resource: FocusedResource) => void;
  clearFocusedResources: () => void;
  syncFocusedResourcesForSession: (chatSessionId: string | null) => void;
  setEditingItemId: (itemId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setSwitchingProject: (switching: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export type ProjectState = ProjectStoreValues &
  ProjectSlice &
  PlanSlice &
  ResourceSlice &
  UiSlice;

// Domain-focused store views. These keep consumers scoped to the state/actions
// they actually need, instead of depending on the entire project store surface.
export type ProjectDomainState = Pick<
  ProjectState,
  'projects' | 'currentProjectId' |
  'setProjects' | 'addProject' | 'removeProject' | 'setCurrentProject' |
  'refreshProjects' | 'updateProjectStorybookUrl' | 'testStorybookConnection' |
  'reset' | 'resetProjectState'
>;

export type PlanDomainState = Pick<
  ProjectState,
  'planItems' | 'relations' |
  'updatePlanItems' | 'setRelations' | 'executePlanActions' | 'addRelation' | 'removeRelation' |
  'updateItemPosition' | 'updateItemPositions' | 'updatePlanItem' | 'updateStatusCategory' |
  'deletePlanItem' | 'deletePlanItemWithDescendants' | 'refreshPlanItems'
>;

export type ResourceDomainState = Pick<
  ProjectState,
  'repos' | 'repoBranches' | 'attachments' | 'worktrees' | 'worktreeLoading' |
  'setRepos' | 'setAttachments' | 'addRepo' | 'addReposToProject' | 'addReposFromDialog' |
  'removeRepo' | 'removeRepoFromProject' | 'addAttachment' | 'removeAttachment' | 'refreshRepos' |
  'setRepoBranches' | 'setRepoBranch' | 'updateRepoEnvironmentMode' | 'setActiveWorktreePath' |
  'setWorktrees' | 'addWorktree' | 'removeWorktree' |
  'openWorktreeInEditor' | 'deleteWorktree' | 'destroyWorktree'
>;

export type UiDomainState = Pick<
  ProjectState,
  'isLoading' | 'isSwitchingProject' | 'error' | 'focusedResources' | 'focusedResourcesBySession' | 'editingItemId' |
  'setFocusedResources' | 'addFocusedResource' | 'addFocusedResources' | 'removeFocusedResource' | 'clearFocusedResources' |
  'syncFocusedResourcesForSession' | 'setEditingItemId' | 'setLoading' | 'setSwitchingProject' |
>;

export type SliceCreator<TSlice> = (deps: ProjectStoreDependencies) => StateCreator<ProjectState, [], [], TSlice>;
