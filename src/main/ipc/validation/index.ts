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

// Chat, Streaming Sessions
export { ChatSchemas, StreamingSessionSchemas, tempImagePath } from './chat';

// Files, File Explorer
export { FileSchemas, FileExplorerSchemas } from './files';

// Tracker and Export
export { TrackerSchemas, ExportSchemas } from './tracker';

// Dev Sessions and Worktrees
export { DevSessionSchemas, WorktreeSchemas } from './dev-session';

// Settings
export { SettingsSchemas } from './settings';

// Custom Themes
export { CustomThemeSchemas } from './customThemes';
export type { CustomThemeImportFromUrlInput, CustomThemeDeleteInput } from './customThemes';

// Permissions
export { PermissionSchemas } from './permission';

// Artifacts, Temp Images, Chat Attachments
export { ArtifactSchemas, TempImageSchemas, ChatAttachmentSchemas } from './artifacts';

// Task Prompt Templates
export { TaskPromptTemplateSchemas } from './agents';

// Agent Prompts

// Custom Prompts
export { CustomPromptSchemas } from './customPrompts';
export type {
  CustomPromptListInput,
  CustomPromptGetInput,
  CustomPromptCreateInput,
  CustomPromptUpdateInput,
  CustomPromptDeleteInput,
  CustomPromptExecuteInput,
} from './customPrompts';

// Shell
export { ShellSchemas } from './shell';

// Repo Files (workspace file browser for connected repos)
export { RepoFileSchemas } from './repoFiles';

// Performance logging
export { PerfSchemas } from './perf';

// Tool call logging
export { ToolLogSchemas } from './toollog';
export type { ToolLogGetEntriesInput, ToolLogGetSessionStatsInput, ToolLogSetEnabledInput } from './toollog';

// Search
export { SearchSchemas } from './search';
export type { SearchGlobalInput } from './search';

// Prompt Overrides
export { PromptOverrideSchemas } from './promptOverrides';
export type {
  PromptOverrideListInput,
  PromptOverrideGetInput,
  PromptOverrideSetInput,
  PromptOverrideResetInput,
} from './promptOverrides';

// GitHub
export { GitHubSchemas } from './github';

// Review workflow
export { ReviewSchemas } from './review';

// MCP Servers
export { McpServerSchemas } from './mcpServers';

// Briefing
export { BriefingSchemas } from './briefing';

// Onboarding
export { OnboardingSchemas } from './onboarding';
export type { OnboardingGenerateInput, OnboardingSaveContextInput } from './onboarding';

// Slack Triage
export { SlackSchemas } from './slack';
export type {
  SlackAvailabilityInput,
  SlackListLinksInput,
  SlackCreateLinkInput,
  SlackDeleteLinkInput,
  SlackTriggerTriageInput,
  SlackGetPendingInput,
  SlackGetAllInput,
  SlackCountPendingInput,
  SlackApproveItemInput,
  SlackEditItemInput,
  SlackDismissItemInput,
  SlackExecuteItemInput,
} from './slack';

// Agent Sessions
export { AgentSessionSchemas } from './agentSession';

// Confluence
export { ConfluenceSchemas } from './confluence';

export type {
  ConfluenceLinkInput,
  ConfluenceUnlinkInput,
  ConfluenceGetLinksInput,
  ConfluenceGetLinkForDocumentInput,
  ConfluenceSyncPreviewInput,
  ConfluencePushExecuteInput,
  ConfluencePullExecuteInput,
  ConfluenceParseUrlInput,
} from './confluence';

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
  RepoShowInFolderInput,
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
  ChatGetSessionStateInput,
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
  FileExplorerShowItemInFolderInput,
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
  // Task Prompt Template
  TaskPromptTemplateListInput,
  TaskPromptTemplateGetInput,
  TaskPromptTemplateGetEffectiveInput,
  TaskPromptTemplateGetBuiltinDefaultInput,
  TaskPromptTemplateCreateInput,
  TaskPromptTemplateUpdateInput,
  TaskPromptTemplateDeleteInput,
  TaskPromptTemplateSetDefaultInput,
  // Shell
  ShellOpenExternalInput,
} from './types';

export type {
  // Repo Files
  RepoFileListDirectoryInput,
  RepoFileReadFileInput,
  RepoFileWriteFileInput,
  RepoFileGetInfoInput,
  RepoFileShowItemInFolderInput,
} from './repoFiles';
