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
  selectProjectById,
  selectNormalizedPlanItems,
  selectFilteredPlannedItems,
  selectPlanSearchResultCount,
  selectFocusedPlanItemId,
  selectDescendantIds,
} from './project/selectors';
export type { PlanAction } from '../../shared/types';

export { useTrackerStore, useHasAssociations } from './trackerStore';

export { useChatStore } from './chat';
export type { Message, ClaudeModel as ChatClaudeModel, ChatProvider, PiProviderOption, MessageSegment, AgentEffortLevel, CodexChatModel } from './chat';
export type { Activity, ChatViewMode } from '../../shared/types';
export { useClaudeAvailabilityStore } from './claudeAvailabilityStore';
export { useProviderReadinessStore } from './providerReadinessStore';

export { useFileTreeStore } from './fileTreeStore';

export { useArtifactsStore } from './artifactsStore';

export { useFocusModeStore } from './focusModeStore';
export type { FocusModeDoc } from './focusModeStore';

export { usePermissionStore } from './permissionStore';
export { useToolPermissionStore } from './toolPermissionStore';

export { useGroupStore } from './groupStore';
export type { GroupUpdates } from './groupStore';

export { useStoreSubscriptions } from './useStoreSubscriptions';

// Store events
export { emit, subscribe } from './storeEvents';
export type { StoreEvent, StatusChangedEvent } from './storeEvents';

// Tracker sub-stores (re-export from tracker/index.ts)
export {
  useCredentialStore,
  useTrackerConfigStore,
  useTrackerMetadataStore,
  useSyncStore,
  useExportStore,
  useSyncReviewStore,
} from './tracker';

// Project-scoped store management
export { resetAllProjectScopedStores, getRegisteredStoreNames } from './projectScopedStores';

// Workspace
export { useWorkspaceStore, isEditableFile, useHasUnsavedChanges } from './workspaceStore';
export type { FileSource, SelectedFile, EditingFile } from './workspaceStore';

// Approval Queue
export { useApprovalQueueStore } from './approvalQueueStore';
export type {
  ApprovalItem,
  PendingPlanActionsItem,
  PendingContextFileItem,
  PendingDocumentItem,
  PendingMoveItem,
  PendingDeleteItem,
} from './approvalQueueStore';

// Toast notifications
export { useToastStore, toast } from './toastStore';
export type { Toast, ToastType } from './toastStore';

// Confluence
export { useConfluenceStore } from './confluenceStore';

// Settings UI
export { useSettingsUIStore } from './settingsUIStore';
export type { SettingsTab } from './settingsUIStore';
export { useGeneralSettingsStore } from './generalSettingsStore';
export { useMcpServersStore } from './mcpServersStore';

// Custom Prompts
export { useCustomPromptStore } from './customPromptStore';

// Scheduled Loops
export { useScheduledLoopStore } from './scheduledLoopStore';
export type { LoopFormInput } from './scheduledLoopStore';
export {
  useCustomPromptTaskStore,
  initCustomPromptTaskListeners,
} from './customPromptTaskStore';
export type { RunningCustomPromptTask } from './customPromptTaskStore';
export { useDevSessionsStore } from './devSessions';

// Tool Call Logging
export { useToolLogStore } from './toolLogStore';

// Embedded Developer Terminal
export { useTerminalStore } from './terminalStore';
export type { TerminalEntry } from './terminalStore';

// Prompt Overrides
export { usePromptOverrideStore } from './promptOverrideStore';

// Briefing
export { useBriefingStore } from './briefingStore';

// Context Regeneration
export { useContextRegenerationStore } from './contextRegenerationStore';

// Background tasks (generic registry for long-running ops surfaced via topbar badge)
export {
  useBackgroundTaskStore,
  selectAllTasks,
} from './backgroundTaskStore';
export type { BackgroundTask, BackgroundTaskStatus } from './backgroundTaskStore';

// Global Search
export { useSearchStore } from './searchStore';

// Notifications (generic registry surfaced via topbar bell)
export {
  useNotificationStore,
  selectUnreadCount,
  initNotificationListener,
} from './notificationStore';
export type { NotificationRecord } from './notificationStore';

// Slack Triage
export { useSlackTriageStore } from './useSlackTriageStore';
