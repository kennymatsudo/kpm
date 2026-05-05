/**
 * IPC Types
 *
 * TypeScript types inferred from Zod schemas for type-safe IPC communication.
 * These types can be used in both main and renderer processes.
 *
 * Usage:
 *   import type { ProjectCreateInput, PlanUpdateItemInput } from '@/main/ipc/validation/types';
 */

import type { z } from 'zod';

// Import all schemas
import type { ProjectSchemas, RepoSchemas, AttachmentSchemas, StorybookSchemas } from './project';
import type { PlanSchemas, planActionSchema } from './plan';
import type { ChatSchemas, StreamingSessionSchemas } from './chat';
import type { FileSchemas, FileExplorerSchemas } from './files';
import type { TrackerSchemas, ExportSchemas } from './tracker';
import type { DevSessionSchemas, WorktreeSchemas } from './dev-session';
import type { SettingsSchemas } from './settings';
import type { ArtifactSchemas, TempImageSchemas } from './artifacts';
import type { TaskPromptTemplateSchemas } from './agents';
import type { ShellSchemas } from './shell';

// =============================================================================
// Project Types
// =============================================================================

export type ProjectCreateInput = z.infer<typeof ProjectSchemas.create>;
export type ProjectGetInput = z.infer<typeof ProjectSchemas.get>;
export type ProjectUpdateInput = z.infer<typeof ProjectSchemas.update>;
export type ProjectDeleteInput = z.infer<typeof ProjectSchemas.delete>;
export type ProjectOpenFolderInput = z.infer<typeof ProjectSchemas.openFolder>;

// =============================================================================
// Repository Types
// =============================================================================

export type RepoAddInput = z.infer<typeof RepoSchemas.add>;
export type RepoRemoveInput = z.infer<typeof RepoSchemas.remove>;
export type RepoListInput = z.infer<typeof RepoSchemas.list>;
export type RepoGetBranchInput = z.infer<typeof RepoSchemas.getBranch>;
export type RepoGetBranchesInput = z.infer<typeof RepoSchemas.getBranches>;
export type RepoWatchInput = z.infer<typeof RepoSchemas.watch>;
export type RepoUnwatchInput = z.infer<typeof RepoSchemas.unwatch>;
export type RepoShowInFolderInput = z.infer<typeof RepoSchemas.showInFolder>;

// =============================================================================
// Attachment Types
// =============================================================================

export type AttachmentAddInput = z.infer<typeof AttachmentSchemas.add>;
export type AttachmentRemoveInput = z.infer<typeof AttachmentSchemas.remove>;
export type AttachmentListInput = z.infer<typeof AttachmentSchemas.list>;

// =============================================================================
// Storybook Types
// =============================================================================

export type StorybookUpdateUrlInput = z.infer<typeof StorybookSchemas.updateUrl>;
export type StorybookTestConnectionInput = z.infer<typeof StorybookSchemas.testConnection>;

// =============================================================================
// Plan Types
// =============================================================================

export type PlanAction = z.infer<typeof planActionSchema>;
export type PlanListItemsInput = z.infer<typeof PlanSchemas.listItems>;
export type PlanExecuteActionsInput = z.infer<typeof PlanSchemas.executeActions>;
export type PlanAddRelationInput = z.infer<typeof PlanSchemas.addRelation>;
export type PlanRemoveRelationInput = z.infer<typeof PlanSchemas.removeRelation>;
export type PlanGetRelationsInput = z.infer<typeof PlanSchemas.getRelations>;
export type PlanUpdatePositionInput = z.infer<typeof PlanSchemas.updatePosition>;
export type PlanUpdatePositionsInput = z.infer<typeof PlanSchemas.updatePositions>;
export type PlanUpdateItemInput = z.infer<typeof PlanSchemas.updateItem>;
export type PlanDeleteItemInput = z.infer<typeof PlanSchemas.deleteItem>;
export type PlanDeleteItemWithDescendantsInput = z.infer<typeof PlanSchemas.deleteItemWithDescendants>;
export type PlanGetChildCountInput = z.infer<typeof PlanSchemas.getChildCount>;

// =============================================================================
// Chat Types
// =============================================================================

export type ChatSendInput = z.infer<typeof ChatSchemas.send>;
export type ChatCancelInput = z.infer<typeof ChatSchemas.cancel>;
export type ChatNewSessionInput = z.infer<typeof ChatSchemas.newSession>;
export type ChatDisconnectSessionInput = z.infer<typeof ChatSchemas.disconnectSession>;
export type ChatGetUsageInput = z.infer<typeof ChatSchemas.getUsage>;
export type ChatGetMessagesInput = z.infer<typeof ChatSchemas.getMessages>;
export type ChatGetSessionStateInput = z.infer<typeof ChatSchemas.getSessionState>;

// =============================================================================
// Streaming Session Types
// =============================================================================

export type StreamingSessionConnectInput = z.infer<typeof StreamingSessionSchemas.connectSession>;
export type StreamingSessionDisconnectInput = z.infer<typeof StreamingSessionSchemas.disconnectSession>;
export type StreamingSessionGetStateInput = z.infer<typeof StreamingSessionSchemas.getSessionState>;

// =============================================================================
// File Types
// =============================================================================

export type FileReadInput = z.infer<typeof FileSchemas.read>;
export type FileWriteInput = z.infer<typeof FileSchemas.write>;
export type FileListContextInput = z.infer<typeof FileSchemas.listContext>;
export type FileReadContextInput = z.infer<typeof FileSchemas.readContext>;
export type FileWriteContextInput = z.infer<typeof FileSchemas.writeContext>;
export type FileDeleteContextInput = z.infer<typeof FileSchemas.deleteContext>;
export type FileImportContextInput = z.infer<typeof FileSchemas.importContext>;

// =============================================================================
// File Explorer Types
// =============================================================================

export type FileExplorerListDirectoryInput = z.infer<typeof FileExplorerSchemas.listDirectory>;
export type FileExplorerCreateFolderInput = z.infer<typeof FileExplorerSchemas.createFolder>;
export type FileExplorerCreateFileInput = z.infer<typeof FileExplorerSchemas.createFile>;
export type FileExplorerCopyExternalFileInput = z.infer<typeof FileExplorerSchemas.copyExternalFile>;
export type FileExplorerCreateSymlinkInput = z.infer<typeof FileExplorerSchemas.createSymlink>;
export type FileExplorerDeleteEntryInput = z.infer<typeof FileExplorerSchemas.deleteEntry>;
export type FileExplorerRenameInput = z.infer<typeof FileExplorerSchemas.rename>;
export type FileExplorerGetInfoInput = z.infer<typeof FileExplorerSchemas.getInfo>;
export type FileExplorerReadFileInput = z.infer<typeof FileExplorerSchemas.readFile>;
export type FileExplorerWriteFileInput = z.infer<typeof FileExplorerSchemas.writeFile>;
export type FileExplorerGetSymlinkInfoInput = z.infer<typeof FileExplorerSchemas.getSymlinkInfo>;
export type FileExplorerShowItemInFolderInput = z.infer<typeof FileExplorerSchemas.showItemInFolder>;
export type FileExplorerSelectFolderDialogInput = z.infer<typeof FileExplorerSchemas.selectFolderDialog>;

// =============================================================================
// Tracker Types
// =============================================================================

export type TrackerSaveJiraCredentialsInput = z.infer<typeof TrackerSchemas.saveJiraCredentials>;
export type TrackerTestJiraConnectionInput = z.infer<typeof TrackerSchemas.testJiraConnection>;
export type TrackerGetScopesInput = z.infer<typeof TrackerSchemas.getScopes>;
export type TrackerAddScopeInput = z.infer<typeof TrackerSchemas.addScope>;
export type TrackerGetAssociationsInput = z.infer<typeof TrackerSchemas.getAssociations>;
export type TrackerAddAssociationInput = z.infer<typeof TrackerSchemas.addAssociation>;
export type TrackerRemoveAssociationInput = z.infer<typeof TrackerSchemas.removeAssociation>;
export type TrackerHasImportedInput = z.infer<typeof TrackerSchemas.hasImported>;
export type TrackerSearchIssuesInput = z.infer<typeof TrackerSchemas.searchIssues>;
export type TrackerSearchIssuesByJqlInput = z.infer<typeof TrackerSchemas.searchIssuesByJql>;
export type TrackerRecentIssuesInput = z.infer<typeof TrackerSchemas.recentIssues>;
export type TrackerProjectLabelsInput = z.infer<typeof TrackerSchemas.projectLabels>;
export type TrackerProjectComponentsInput = z.infer<typeof TrackerSchemas.projectComponents>;
export type TrackerImportPreviewInput = z.infer<typeof TrackerSchemas.importPreview>;
export type TrackerImportApplyInput = z.infer<typeof TrackerSchemas.importApply>;
export type TrackerSyncPreviewInput = z.infer<typeof TrackerSchemas.syncPreview>;
export type TrackerSyncApplyInput = z.infer<typeof TrackerSchemas.syncApply>;
export type TrackerGetProjectStatusesInput = z.infer<typeof TrackerSchemas.getProjectStatuses>;
export type TrackerUpdateStatusMappingInput = z.infer<typeof TrackerSchemas.updateStatusMapping>;

// =============================================================================
// Export Types
// =============================================================================

export type ExportGetQueueInput = z.infer<typeof ExportSchemas.getQueue>;
export type ExportAddToQueueInput = z.infer<typeof ExportSchemas.addToQueue>;
export type ExportRemoveFromQueueInput = z.infer<typeof ExportSchemas.removeFromQueue>;
export type ExportClearQueueInput = z.infer<typeof ExportSchemas.clearQueue>;
export type ExportUpdateQueueStatusInput = z.infer<typeof ExportSchemas.updateQueueStatus>;
export type ExportUpdateQueueCustomFieldsInput = z.infer<typeof ExportSchemas.updateQueueCustomFields>;
export type ExportPreviewInput = z.infer<typeof ExportSchemas.preview>;
export type ExportExecuteApprovedInput = z.infer<typeof ExportSchemas.executeApproved>;
export type ExportGetMappingsInput = z.infer<typeof ExportSchemas.getMappings>;
export type ExportGetMappingsByScopeInput = z.infer<typeof ExportSchemas.getMappingsByScope>;
export type ExportSaveMappingInput = z.infer<typeof ExportSchemas.saveMapping>;
export type ExportRemoveMappingInput = z.infer<typeof ExportSchemas.removeMapping>;
export type ExportCreateDefaultMappingsInput = z.infer<typeof ExportSchemas.createDefaultMappings>;
export type ExportGetIssueTypesInput = z.infer<typeof ExportSchemas.getIssueTypes>;

// =============================================================================
// Dev Session Types
// =============================================================================

export type DevSessionGetByProjectInput = z.infer<typeof DevSessionSchemas.getByProject>;
export type DevSessionGetByProjectWithPlanItemsInput = z.infer<typeof DevSessionSchemas.getByProjectWithPlanItems>;
export type DevSessionGetActiveInput = z.infer<typeof DevSessionSchemas.getActive>;
export type DevSessionGetInput = z.infer<typeof DevSessionSchemas.get>;
export type DevSessionHasActiveInput = z.infer<typeof DevSessionSchemas.hasActive>;
export type DevSessionUpdateStatusInput = z.infer<typeof DevSessionSchemas.updateStatus>;
export type DevSessionDeleteInput = z.infer<typeof DevSessionSchemas.delete>;
export type DevSessionGetDiffInput = z.infer<typeof DevSessionSchemas.getDiff>;
export type DevSessionGetCommitsAheadInput = z.infer<typeof DevSessionSchemas.getCommitsAhead>;

// =============================================================================
// Worktree Types
// =============================================================================

export type WorktreeGetByProjectInput = z.infer<typeof WorktreeSchemas.getByProject>;
export type WorktreeGetByPlanItemInput = z.infer<typeof WorktreeSchemas.getByPlanItem>;
export type WorktreeLaunchInput = z.infer<typeof WorktreeSchemas.launch>;
export type WorktreeResumeInput = z.infer<typeof WorktreeSchemas.resume>;
export type WorktreeOpenEditorInput = z.infer<typeof WorktreeSchemas.openEditor>;
export type WorktreeGetStatusInput = z.infer<typeof WorktreeSchemas.getStatus>;
export type WorktreeDeleteInput = z.infer<typeof WorktreeSchemas.delete>;
export type WorktreePushInput = z.infer<typeof WorktreeSchemas.push>;

// =============================================================================
// Settings Types
// =============================================================================

export type SettingsSaveApiKeyInput = z.infer<typeof SettingsSchemas.saveApiKey>;
export type SettingsTestApiKeyInput = z.infer<typeof SettingsSchemas.testApiKey>;
export type SettingsGetAppSettingInput = z.infer<typeof SettingsSchemas.getAppSetting>;
export type SettingsSetAppSettingInput = z.infer<typeof SettingsSchemas.setAppSetting>;

// =============================================================================
// Artifact Types
// =============================================================================

export type ArtifactListInput = z.infer<typeof ArtifactSchemas.list>;
export type ArtifactReadInput = z.infer<typeof ArtifactSchemas.read>;
export type ArtifactDeleteInput = z.infer<typeof ArtifactSchemas.delete>;
export type ArtifactImportInput = z.infer<typeof ArtifactSchemas.import>;

// =============================================================================
// Temp Image Types
// =============================================================================

export type TempImageSaveInput = z.infer<typeof TempImageSchemas.save>;
export type TempImageDeleteInput = z.infer<typeof TempImageSchemas.delete>;

// =============================================================================
// Custom Agent Types
// =============================================================================


// =============================================================================
// Task Prompt Template Types
// =============================================================================

export type TaskPromptTemplateListInput = z.infer<typeof TaskPromptTemplateSchemas.list>;
export type TaskPromptTemplateGetInput = z.infer<typeof TaskPromptTemplateSchemas.get>;
export type TaskPromptTemplateGetEffectiveInput = z.infer<typeof TaskPromptTemplateSchemas.getEffective>;
export type TaskPromptTemplateGetBuiltinDefaultInput = z.infer<typeof TaskPromptTemplateSchemas.getBuiltinDefault>;
export type TaskPromptTemplateCreateInput = z.infer<typeof TaskPromptTemplateSchemas.create>;
export type TaskPromptTemplateUpdateInput = z.infer<typeof TaskPromptTemplateSchemas.update>;
export type TaskPromptTemplateDeleteInput = z.infer<typeof TaskPromptTemplateSchemas.delete>;
export type TaskPromptTemplateSetDefaultInput = z.infer<typeof TaskPromptTemplateSchemas.setDefault>;

// =============================================================================
// Shell Types
// =============================================================================

export type ShellOpenExternalInput = z.infer<typeof ShellSchemas.openExternal>;
