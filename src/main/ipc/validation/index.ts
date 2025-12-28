/**
 * IPC Validation Schemas
 *
 * Centralized re-exports for all IPC validation schemas and utilities.
 * Each domain has its own file for maintainability.
 */

// =============================================================================
// Utilities and Shared Components
// =============================================================================

export {
  ValidationError,
  createIpcHandler,
  createSimpleIpcHandler,
  type IpcSuccessResponse,
  type IpcErrorResponse,
  type IpcResponse,
} from './utils';

export {
  // Basic types
  uuid,
  nonEmptyString,
  optionalString,
  // Project & Plan types
  projectName,
  projectPhase,
  planItemStatus,
  statusCategory,
  planItemLabel,
  relationType,
  canvasPosition,
  // Path types
  absolutePath,
  existingDirectoryPath,
  existingFilePath,
  relativePath,
  // Tracker types
  jiraSiteUrl,
  email,
  apiToken,
  jiraProjectKey,
  // Claude types
  claudeModel,
  devSessionStatus,
  type DevSessionStatusZod,
  // Misc types
  anthropicApiKey,
  supportedImageFormat,
} from './shared';

// =============================================================================
// Domain Schemas
// =============================================================================

// Project, Repository, Attachment, Storybook
export { ProjectSchemas, RepoSchemas, AttachmentSchemas, StorybookSchemas } from './project';

// Plan Items and Actions
export { PlanSchemas, planActionSchema } from './plan';


// Files, File Explorer
export { FileSchemas, FileExplorerSchemas } from './files';

// Tracker and Export
export { TrackerSchemas, ExportSchemas } from './tracker';

// Dev Sessions and Worktrees
export { DevSessionSchemas, WorktreeSchemas } from './dev-session';

// Settings
export { SettingsSchemas } from './settings';



// Shell
export { ShellSchemas } from './shell';

// =============================================================================
// Inferred Types (for type-safe IPC communication)
// =============================================================================

export type {
  // Project
  ProjectCreateInput,
  ProjectGetInput,
  ProjectUpdateInput,
  ProjectDeleteInput,
  ProjectOpenFolderInput,
  // Repository
  RepoAddInput,
  RepoRemoveInput,
  RepoListInput,
  RepoGetBranchInput,
  RepoGetBranchesInput,
  RepoWatchInput,
  RepoUnwatchInput,
  // Attachment
  AttachmentAddInput,
  AttachmentRemoveInput,
  AttachmentListInput,
  // Storybook
  StorybookUpdateUrlInput,
  StorybookTestConnectionInput,
  // Plan
  PlanAction,
  PlanListItemsInput,
  PlanExecuteActionsInput,
  PlanAddRelationInput,
  PlanRemoveRelationInput,
  PlanGetRelationsInput,
  PlanUpdatePositionInput,
  PlanUpdateItemInput,
  PlanDeleteItemInput,
  PlanDeleteItemWithDescendantsInput,
  PlanGetChildCountInput,
  // Chat
  ChatSendInput,
  ChatCancelInput,
  ChatNewSessionInput,
  ChatDisconnectSessionInput,
  ChatGetUsageInput,
  ChatGetMessagesInput,
  // Streaming Session
  StreamingSessionConnectInput,
  StreamingSessionDisconnectInput,
  StreamingSessionGetStateInput,
  // Files
  FileReadInput,
  FileWriteInput,
  FileListContextInput,
  FileReadContextInput,
  FileWriteContextInput,
  FileDeleteContextInput,
  FileImportContextInput,
  // File Explorer
  FileExplorerListDirectoryInput,
  FileExplorerCreateFolderInput,
  FileExplorerCreateFileInput,
  FileExplorerCreateSymlinkInput,
  FileExplorerDeleteEntryInput,
  FileExplorerRenameInput,
  FileExplorerGetInfoInput,
  FileExplorerReadFileInput,
  FileExplorerWriteFileInput,
  FileExplorerGetSymlinkInfoInput,
  FileExplorerSelectFolderDialogInput,
  // Tracker
  TrackerSaveJiraCredentialsInput,
  TrackerTestJiraConnectionInput,
  TrackerGetScopesInput,
  TrackerAddScopeInput,
  TrackerGetAssociationsInput,
  TrackerAddAssociationInput,
  TrackerRemoveAssociationInput,
  TrackerHasImportedInput,
  TrackerSearchIssuesInput,
  TrackerSearchIssuesByJqlInput,
  TrackerRecentIssuesInput,
  TrackerProjectLabelsInput,
  TrackerProjectComponentsInput,
  TrackerImportPreviewInput,
  TrackerImportApplyInput,
  TrackerSyncPreviewInput,
  TrackerSyncApplyInput,
  TrackerGetProjectStatusesInput,
  TrackerUpdateStatusMappingInput,
  // Export
  ExportGetQueueInput,
  ExportAddToQueueInput,
  ExportRemoveFromQueueInput,
  ExportClearQueueInput,
  ExportUpdateQueueStatusInput,
  ExportPreviewInput,
  ExportExecuteApprovedInput,
  ExportGetMappingsInput,
  ExportGetMappingsByScopeInput,
  ExportSaveMappingInput,
  ExportRemoveMappingInput,
  ExportCreateDefaultMappingsInput,
  ExportGetIssueTypesInput,
  // Dev Session
  DevSessionGetByProjectInput,
  DevSessionGetByProjectWithPlanItemsInput,
  DevSessionGetActiveInput,
  DevSessionGetInput,
  DevSessionHasActiveInput,
  DevSessionUpdateStatusInput,
  DevSessionDeleteInput,
  DevSessionGetDiffInput,
  DevSessionGetCommitsAheadInput,
  // Worktree
  WorktreeGetByProjectInput,
  WorktreeGetByPlanItemInput,
  WorktreeLaunchInput,
  WorktreeResumeInput,
  WorktreeOpenEditorInput,
  WorktreeGetStatusInput,
  WorktreeDeleteInput,
  WorktreePushInput,
  // Settings
  SettingsSaveApiKeyInput,
  SettingsTestApiKeyInput,
  SettingsGetAppSettingInput,
  SettingsSetAppSettingInput,
  // Artifact
  ArtifactListInput,
  ArtifactReadInput,
  ArtifactDeleteInput,
  ArtifactImportInput,
  // Temp Image
  TempImageSaveInput,
  TempImageDeleteInput,
  // Shell
} from './types';
