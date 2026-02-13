// Main stores
export type {
  ProjectDomainState,
  PlanDomainState,
  ResourceDomainState,
  UiDomainState,
} from './project/types';
export {
  useProjectDomainStore,
  usePlanDomainStore,
  useResourceDomainStore,
  useProjectUiDomainStore,
} from './projectDomains';
export {
  selectProjectSummary,
  selectNormalizedPlanItems,
  selectFilteredPlannedItems,
  selectPlanSearchResultCount,
  selectFocusedPlanItemId,
  selectDescendantIds,
} from './project/selectors';
export type { PlanAction } from '../../shared/types';

export { useTrackerStore, useHasAssociations } from './trackerStore';

export type { Activity, ChatViewMode } from '../../shared/types';

export { useFileTreeStore } from './fileTreeStore';

export { useArtifactsStore } from './artifactsStore';

export { usePermissionStore } from './permissionStore';

export { useGroupStore } from './groupStore';
export type { GroupUpdates } from './groupStore';

export { useStoreSubscriptions } from './useStoreSubscriptions';

// Store events
export { emit, subscribe } from './storeEvents';
export type { StoreEvent, StatusChangedEvent } from './storeEvents';

// Tracker sub-stores (re-export from tracker/index.ts)

// Project-scoped store management
export { resetAllProjectScopedStores, getRegisteredStoreNames } from './projectScopedStores';

// Workspace
export { useWorkspaceStore, isEditableFile, useHasUnsavedChanges } from './workspaceStore';
export type { FileSource, SelectedFile, EditingFile } from './workspaceStore';

// Approval Queue
export type {
  ApprovalItem,
  PendingPlanActionsItem,
  PendingClaudeMdItem,
  PendingDocumentItem,
} from './approvalQueueStore';

// Toast notifications
export { useToastStore, toast } from './toastStore';
export type { Toast, ToastType } from './toastStore';

// Confluence
export { useConfluenceStore } from './confluenceStore';

// Settings UI
export { useSettingsUIStore } from './settingsUIStore';
export type { SettingsTab } from './settingsUIStore';

// Custom Prompts
export { useCustomPromptStore } from './customPromptStore';

// Tool Call Logging
export { useToolLogStore } from './toolLogStore';

// Prompt Overrides
export { usePromptOverrideStore } from './promptOverrideStore';

// Global Search
export { useSearchStore } from './searchStore';
