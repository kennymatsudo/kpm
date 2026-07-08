import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import { deriveDomainApi } from '../shared/ipc/endpoints';
import { deriveEventSubscriptions } from '../shared/ipc/appEvents';
import { chatEvents } from '../shared/ipc/chatEvents';
import { reviewEvents } from '../shared/ipc/reviewEvents';
import { devSessionEvents } from '../shared/ipc/devSessionEvents';
import { agentSessionEvents } from '../shared/ipc/agentSessionEvents';
import { usageEvents } from '../shared/ipc/usageEvents';
import { permissionEvents } from '../shared/ipc/permissionEvents';
import { terminalEvents } from '../shared/ipc/terminalEvents';
import { briefingEvents } from '../shared/ipc/briefingEvents';
import { menuEvents } from '../shared/ipc/menuEvents';
import { notificationEvents } from '../shared/ipc/notificationEvents';
import { planEvents } from '../shared/ipc/planEvents';
import { repoEvents } from '../shared/ipc/repoEvents';
import { fileExplorerEvents } from '../shared/ipc/fileExplorerEvents';
import { trackerEvents } from '../shared/ipc/trackerEvents';
import { customPromptEvents } from '../shared/ipc/customPromptEvents';
import { onboardingEvents } from '../shared/ipc/onboardingEvents';
import { scheduledLoopEvents } from '../shared/ipc/scheduledLoopEvents';
import { toolLogEvents } from '../shared/ipc/toolLogEvents';
import { planEndpoints } from '../shared/ipc/planEndpoints';
import { groupEndpoints } from '../shared/ipc/groupEndpoints';
import { exportEndpoints } from '../shared/ipc/exportEndpoints';
import { confluenceEndpoints } from '../shared/ipc/confluenceEndpoints';
import { scheduledLoopEndpoints } from '../shared/ipc/scheduledLoopEndpoints';
import { slackEndpoints } from '../shared/ipc/slackEndpoints';
import { trackerEndpoints } from '../shared/ipc/trackerEndpoints';
import { fileExplorerEndpoints } from '../shared/ipc/fileExplorerEndpoints';
import { repoFilesEndpoints } from '../shared/ipc/repoFilesEndpoints';
import { attachmentEndpoints } from '../shared/ipc/attachmentEndpoints';
import { tempImageEndpoints } from '../shared/ipc/tempImageEndpoints';
import { artifactEndpoints } from '../shared/ipc/artifactEndpoints';
import { searchEndpoints } from '../shared/ipc/searchEndpoints';
import { mcpServersEndpoints } from '../shared/ipc/mcpServersEndpoints';
import { briefingEndpoints } from '../shared/ipc/briefingEndpoints';
import { usageEndpoints } from '../shared/ipc/usageEndpoints';
import { chatEndpoints } from '../shared/ipc/chatEndpoints';
import { terminalEndpoints } from '../shared/ipc/terminalEndpoints';
import { settingsEndpoints } from '../shared/ipc/settingsEndpoints';
import { permissionEndpoints } from '../shared/ipc/permissionEndpoints';
import { promptOverridesEndpoints } from '../shared/ipc/promptOverridesEndpoints';
import { toolLogEndpoints } from '../shared/ipc/toolLogEndpoints';
import { storybookEndpoints } from '../shared/ipc/storybookEndpoints';
import { devSessionEndpoints } from '../shared/ipc/devSessionEndpoints';
import { agentSessionEndpoints } from '../shared/ipc/agentSessionEndpoints';
import { reviewEndpoints } from '../shared/ipc/reviewEndpoints';
import { githubEndpoints } from '../shared/ipc/githubEndpoints';
import { projectEndpoints } from '../shared/ipc/projectEndpoints';
import { repoEndpoints } from '../shared/ipc/repoEndpoints';
import { taskPromptTemplateEndpoints } from '../shared/ipc/taskPromptTemplateEndpoints';
import { customThemeEndpoints } from '../shared/ipc/customThemeEndpoints';
import { themeEndpoints } from '../shared/ipc/themeEndpoints';
import { perfEndpoints } from '../shared/ipc/perfEndpoints';
import { shellEndpoints } from '../shared/ipc/shellEndpoints';
import type {
  Project,
  Repo,
  RepoEnvironmentMode,
  Attachment,
  PlanItem,
  PlanRelation,
  PlanAction,
  PlanActionResult,
  PlanItemUpdates,
  Activity,
  ToolCallLogEntry,
  ToolCallTurnSummary,
  TrackerCredentialInfo,
  TrackerConnection,
  TrackerProjectScope,
  TrackerAssociation,
  TrackerAssociationWithScope,
  TrackerType,
  StatusMapping,
  ImportPreview,
  ImportResult,
  SyncPreview,
  SyncResult,
  ConflictResolution,
  DeletedItemAction,
  TrackerTypeMapping,
  SyncQueueEntryWithPlanItem,
  ExportPreview,
  ExportResult,
  SyncReviewData,
  ChatMessage,
  ChatSessionSummary,
  SlashCommandInfo,
  PermissionRequest,
  PermissionAction,
  FocusedResource,
  TaskPromptTemplate,
  SessionState,
  DevSession,
  DevSessionWithPlanItem,
  ChatProvider,
  ClaudeModel,
  ChatSessionScope,
  ChatViewMode,
  FileNode,
  Group,
  ConfluencePageLink,
  ConfluenceSyncPreview,
  CustomPrompt,
  CustomPromptIcon,
  CustomPromptTargetType,
  CustomPromptRunMode,
  ScheduledLoop,
  LoopRun,
  LoopOutputMode,
  SearchResult,
  PromptDefinitionInfo,
  PromptCategory,
  BriefingResult,
  ToolPermission,
  FocusChatDocument,
  ReviewInboxSnapshot,
  SlackChannelLink,
  SlackTriageItem,
  AgentExecutionMode,
  AgentReviewPolicy,
  CustomTheme,
  ImportedCustomThemeResult,
} from '../shared/types';

type IpcSuccess<T extends object | void> = T extends void ? { success: true } : { success: true } & T;
interface IpcFailure {
  success: false;
  error: string;
}
type FlatIpcResponse<T extends object | void> = IpcSuccess<T> | IpcFailure;

async function invokeFlat<T extends object | void>(
  channel: string,
  payload?: unknown,
): Promise<FlatIpcResponse<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<FlatIpcResponse<T>>;
}

async function invokeOrThrow<T extends object, TResult>(
  channel: string,
  payload: unknown,
  pick: (response: IpcSuccess<T>) => TResult,
): Promise<TResult> {
  const response = await invokeFlat<T>(channel, payload);
  if (!response.success) {
    throw new Error(response.error);
  }
  return pick(response);
}

// Re-export shared types for renderer consumers
export type {
  Project,
  Repo,
  RepoEnvironmentMode,
  Attachment,
  PlanItem,
  PlanRelation,
  PlanAction,
  PlanActionResult,
  Activity,
  ToolCallLogEntry,
  ToolCallTurnSummary,
  TrackerCredentialInfo,
  TrackerConnection,
  TrackerProjectScope,
  TrackerAssociation,
  TrackerAssociationWithScope,
  TrackerType,
  StatusMapping,
  ImportPreview,
  ImportResult,
  SyncPreview,
  SyncResult,
  ConflictResolution,
  DeletedItemAction,
  TrackerTypeMapping,
  SyncQueueEntryWithPlanItem,
  ExportPreview,
  ExportResult,
  SyncReviewData,
  ChatMessage,
  ChatSessionSummary,
  SlashCommandInfo,
  PermissionRequest,
  PermissionAction,
  TaskPromptTemplate,
  SessionState,
  DevSession,
  DevSessionWithPlanItem,
  ClaudeModel,
  FileNode,
  Group,
  ConfluencePageLink,
  ConfluenceSyncPreview,
  CustomPrompt,
  CustomPromptIcon,
  CustomPromptTargetType,
  CustomPromptRunMode,
  SearchResult,
  PromptDefinitionInfo,
  PromptCategory,
  BriefingResult,
  ToolPermission,
  ReviewInboxSnapshot,
  SlackChannelLink,
  SlackTriageItem,
  CustomTheme,
  ImportedCustomThemeResult,
  AgentExecutionMode,
  AgentReviewPolicy,
};

const tempImageInvoke = deriveDomainApi(tempImageEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const tempImages = {
  save: tempImageInvoke.save,
  delete: tempImageInvoke.delete,
};

const chatInvoke = deriveDomainApi(chatEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const chatSubscriptions = deriveEventSubscriptions(chatEvents, ipcRenderer);

const chat = {
  sendMessage: (payload: {
    projectId: string;
    message: string;
    focusedResources: FocusedResource[];
    model?: ClaudeModel;
    tempImages?: string[];
    chatSessionId?: string;
    currentView?: ChatViewMode;
    clientMessageId?: string;
    // Narrower than board agents' effort levels (no `xhigh`) — matches
    // `chatEndpoints.send.params.effort` and `ChatService`'s `SendMessageInput.effort`.
    effort?: 'low' | 'medium' | 'high' | 'max';
    focusDocument?: FocusChatDocument;
    provider?: ChatProvider;
  }) => chatInvoke.send(payload),
  newSession: chatInvoke.newSession,
  cancel: chatInvoke.cancel,
  cancelQueued: chatInvoke.cancelQueued,
  getUsage: (projectId: string): Promise<{ totalTokens: number; inputTokens: number; outputTokens: number }> =>
    invokeOrThrow<
      { usage: { totalTokens: number; inputTokens: number; outputTokens: number } },
      { totalTokens: number; inputTokens: number; outputTokens: number }
    >(IPC_CHANNELS.chat.getUsage, { projectId }, ({ usage }) => usage),
  getMessages: (projectId: string): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> =>
    invokeFlat<{ messages: ChatMessage[] }>(IPC_CHANNELS.chat.getMessages, { projectId }).then((result) =>
      result.success ? { success: true, messages: result.messages } : result
    ),
  getSlashCommands: chatInvoke.getSlashCommands,
  getSessionHistory: (projectId: string, limit?: number): Promise<{ success: boolean; sessions?: ChatSessionSummary[]; error?: string }> =>
    invokeFlat<{ sessions: ChatSessionSummary[] }>(IPC_CHANNELS.chat.getSessionHistory, { projectId, limit }).then((result) =>
      result.success ? { success: true, sessions: result.sessions } : result
    ),
  loadSession: (projectId: string, chatSessionId: string): Promise<{ success: boolean; messages?: ChatMessage[]; chatSessionId?: string; error?: string }> =>
    invokeFlat<{ messages: ChatMessage[]; chatSessionId: string }>(
      IPC_CHANNELS.chat.loadSession,
      { projectId, chatSessionId },
    ).then((result) => (result.success ? result : result)),
  getFocusDocumentSession: (projectId: string, path: string, title: string, contentHash: string): Promise<{ success: boolean; messages?: ChatMessage[]; chatSessionId?: string; error?: string }> =>
    invokeFlat<{ messages: ChatMessage[]; chatSessionId: string }>(
      IPC_CHANNELS.chat.getFocusDocumentSession,
      { projectId, path, title, contentHash },
    ).then((result) => (result.success ? result : result)),
  onChunk: chatSubscriptions.chunk,
  onPlanActions: chatSubscriptions.planActions,
  onDone: chatSubscriptions.done,
  onQueued: chatSubscriptions.queued,
  onQueueCleared: chatSubscriptions.queueCleared,
  onError: chatSubscriptions.error,
  onActivity: chatSubscriptions.activity,
  onThinking: chatSubscriptions.thinking,
  onFileUpdate: chatSubscriptions.fileUpdate,
  onFileDelete: chatSubscriptions.fileDelete,

  // ─── Streaming Session Methods ───

  /** Connect streaming session for a project (called on project open) */
  connectSession: chatInvoke.connectSession,

  /** Disconnect streaming session for a project (all sessions) */
  disconnectSession: chatInvoke.disconnectSession,

  /** Get all active sessions for a project (multi-session support) */
  getActiveSessions: (projectId: string): Promise<{
    success: boolean;
    sessions?: { chatSessionId: string; scope: ChatSessionScope; state: SessionState; isProcessing: boolean; title?: string | null }[];
    error?: string;
  }> => invokeFlat<{ sessions: { chatSessionId: string; scope: ChatSessionScope; state: SessionState; isProcessing: boolean; title?: string | null }[] }>(
    IPC_CHANNELS.chat.getActiveSessions,
    { projectId },
  ).then((result) => (result.success ? { success: true, sessions: result.sessions } : result)),

  /** Disconnect a specific session (multi-session support) */
  disconnectSpecificSession: chatInvoke.disconnectSpecificSession,

  /** Get current session state */
  getSessionState: (projectId: string, chatSessionId: string): Promise<{ success: boolean; state?: SessionState; error?: string }> =>
    invokeFlat<{ state: SessionState }>(IPC_CHANNELS.chat.getSessionState, { projectId, chatSessionId }).then((result) =>
      result.success ? { success: true, state: result.state } : result
    ),

  /** Session connecting event */
  onSessionConnecting: chatSubscriptions.sessionConnecting,

  /** Session ready event */
  onSessionReady: chatSubscriptions.sessionReady,

  /** Session title event — SDK-derived summary used to label the session tab. */
  onSessionTitle: chatSubscriptions.sessionTitle,

  /** Session error event */
  onSessionError: chatSubscriptions.sessionError,

  /** Prompt suggestions event (after turn completes) */
  onSuggestions: chatSubscriptions.suggestions,

  /** Slash command list event — SDK-derived full list; replaces any scanned list */
  onSlashCommands: chatSubscriptions.slashCommands,

  /** Session deactivated event (multi-session support) */
  onSessionDeactivated: chatSubscriptions.sessionDeactivated,

  /** MCP server status change event (health monitoring) */
  onMcpStatus: chatSubscriptions.mcpStatus,

};

const projectInvoke = deriveDomainApi(projectEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const projects = {
  create: (payload: { name: string; folderPath?: string }): Promise<Project> =>
    invokeOrThrow<{ project: Project }, Project>(IPC_CHANNELS.project.create, payload, ({ project }) => project),
  get: (payload: { projectId: string }): Promise<Project | undefined> =>
    invokeOrThrow<{ project: Project | undefined }, Project | undefined>(IPC_CHANNELS.project.get, payload, ({ project }) => project),
  list: (): Promise<Project[]> =>
    invokeOrThrow<{ projects: Project[] }, Project[]>(IPC_CHANNELS.project.list, undefined, ({ projects }) => projects),
  getDefaultLocation: (): Promise<string> =>
    invokeOrThrow<{ defaultLocation: string }, string>(
      IPC_CHANNELS.project.getDefaultLocation,
      undefined,
      ({ defaultLocation }) => defaultLocation,
    ),
  update: (payload: { projectId: string; updates: { name?: string; phase?: string } }): Promise<Project | undefined> =>
    invokeOrThrow<{ project: Project | undefined }, Project | undefined>(IPC_CHANNELS.project.update, payload, ({ project }) => project),
  delete: projectInvoke.delete,
  openFolder: projectInvoke.openFolder,
};

const repoInvoke = deriveDomainApi(repoEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const repoSubscriptions = deriveEventSubscriptions(repoEvents, ipcRenderer);

const repos = {
  add: (payload: { projectId: string; path: string }): Promise<Repo> =>
    invokeOrThrow<{ repo: Repo }, Repo>(IPC_CHANNELS.repo.add, payload, ({ repo }) => repo),
  remove: repoInvoke.remove,
  list: (payload: { projectId: string }): Promise<Repo[]> =>
    invokeOrThrow<{ repos: Repo[] }, Repo[]>(IPC_CHANNELS.repo.list, payload, ({ repos }) => repos),
  selectDialog: (): Promise<string[]> =>
    invokeOrThrow<{ paths: string[] }, string[]>(IPC_CHANNELS.repo.selectDialog, undefined, ({ paths }) => paths),
  getBranch: (payload: { path: string }): Promise<string | null> =>
    invokeOrThrow<{ branch: string | null }, string | null>(IPC_CHANNELS.repo.getBranch, payload, ({ branch }) => branch),
  getBranches: (payload: { paths: string[] }): Promise<Record<string, string | null>> =>
    invokeOrThrow<{ branches: Record<string, string | null> }, Record<string, string | null>>(IPC_CHANNELS.repo.getBranches, payload, ({ branches }) => branches),
  watch: repoInvoke.watch,
  unwatch: repoInvoke.unwatch,
  updateEnvironmentMode: repoInvoke.updateEnvironmentMode,
  listDirectories: (payload: { repoPath: string; prefix?: string; depth?: number }): Promise<string[]> =>
    invokeOrThrow<{ directories: string[] }, string[]>(
      IPC_CHANNELS.repo.listDirectories,
      { ...payload, prefix: payload.prefix ?? '' },
      ({ directories }) => directories,
    ),
  listAllBranches: (payload: { repoPath: string }): Promise<string[]> =>
    invokeOrThrow<{ branches: string[] }, string[]>(IPC_CHANNELS.repo.listAllBranches, payload, ({ branches }) => branches),
  listWorktrees: (payload: { repoPath: string }): Promise<{ path: string; branch: string | null; isMain: boolean }[]> =>
    invokeOrThrow<{ worktrees: { path: string; branch: string | null; isMain: boolean }[] }, { path: string; branch: string | null; isMain: boolean }[]>(
      IPC_CHANNELS.repo.listWorktrees, payload, ({ worktrees }) => worktrees,
    ),
  setActiveWorktreePath: repoInvoke.setActiveWorktreePath,
  showInFolder: repoInvoke.showInFolder,
  openEditor: repoInvoke.openEditor,
  onBranchChanged: repoSubscriptions.branchChanged,
};

interface PickedChatAttachment {
  path: string;
  filename: string;
  kind: 'image' | 'pdf' | 'text';
  mediaType: string;
}

const attachmentInvoke = deriveDomainApi(attachmentEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const attachments = {
  add: attachmentInvoke.add,
  remove: attachmentInvoke.remove,
  list: attachmentInvoke.list,
  selectDialog: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.attachment.selectDialog),
  pickForChat: (): Promise<{
    picked: PickedChatAttachment[];
    errors: { filename: string; error: string }[];
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.attachment.pickForChat),
  saveDropped: attachmentInvoke.saveDropped,
  readAsDataUrl: attachmentInvoke.readAsDataUrl,
  openTemp: attachmentInvoke.openTemp,
};

const planSubscriptions = deriveEventSubscriptions(planEvents, ipcRenderer);
const plan = {
  listItems: (payload: { projectId: string }): Promise<PlanItem[]> =>
    invokeOrThrow<{ items: PlanItem[] }, PlanItem[]>(planEndpoints.listItems.channel, payload, ({ items }) => items),
  executeActions: (payload: { projectId: string; actions: PlanAction[] }): Promise<PlanActionResult> =>
    invokeOrThrow<{ result: PlanActionResult }, PlanActionResult>(planEndpoints.executeActions.channel, payload, ({ result }) => result),
  addRelation: (payload: Omit<PlanRelation, 'id'>): Promise<PlanRelation> =>
    invokeOrThrow<{ relation: PlanRelation }, PlanRelation>(planEndpoints.addRelation.channel, payload, ({ relation }) => relation),
  removeRelation: (payload: { relationId: string }): Promise<{ success: boolean }> =>
    invokeFlat<void>(planEndpoints.removeRelation.channel, payload),
  getRelations: (payload: { projectId: string }): Promise<PlanRelation[]> =>
    invokeOrThrow<{ relations: PlanRelation[] }, PlanRelation[]>(planEndpoints.getRelations.channel, payload, ({ relations }) => relations),
  updatePosition: (payload: { itemId: string; x: number; y: number }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(planEndpoints.updatePosition.channel, payload),
  updatePositions: (payload: { updates: { id: string; x: number; y: number }[] }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(planEndpoints.updatePositions.channel, payload),
  updateItem: (payload: { itemId: string; updates: PlanItemUpdates }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(planEndpoints.updateItem.channel, payload),
  deleteItem: (payload: { itemId: string }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(planEndpoints.deleteItem.channel, payload),
  deleteItemWithDescendants: (payload: { itemId: string }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(planEndpoints.deleteItemWithDescendants.channel, payload),
  getChildCount: (payload: { itemId: string }): Promise<number> =>
    invokeOrThrow<{ count: number }, number>(planEndpoints.getChildCount.channel, payload, ({ count }) => count),
  onRefreshRequested: planSubscriptions.refreshRequested,
};

const groupInvoke = deriveDomainApi(groupEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

// Groups API (Visual containers - Figma-style frames)
const groups = {
  list: groupInvoke.list,
  get: groupInvoke.get,
  create: groupInvoke.create,
  update: groupInvoke.update,
  delete: groupInvoke.delete,
  updatePosition: groupInvoke.updatePosition,
  updateSize: groupInvoke.updateSize,
  assignItem: groupInvoke.assignItem,
};

const trackerInvoke = deriveDomainApi(trackerEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const trackerSubscriptions = deriveEventSubscriptions(trackerEvents, ipcRenderer);
const exportInvoke = deriveDomainApi(exportEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const tracker = {
  credentials: {
    list: trackerInvoke['credentials.get'],
    saveJira: trackerInvoke['credentials.saveJira'],
    saveLinear: trackerInvoke['credentials.saveLinear'],
    delete: trackerInvoke['credentials.delete'],
    deleteLinear: trackerInvoke['credentials.deleteLinear'],
    testJira: trackerInvoke['credentials.testJira'],
    testLinear: trackerInvoke['credentials.testLinear'],
  },
  connections: {
    list: trackerInvoke['connections.get'],
  },
  scopes: {
    list: trackerInvoke['scopes.get'],
    add: trackerInvoke['scopes.add'],
  },
  associations: {
    list: trackerInvoke['associations.get'],
    add: trackerInvoke['associations.add'],
    remove: trackerInvoke['associations.remove'],
    hasImported: trackerInvoke['associations.hasImported'],
    updateStatusMapping: trackerInvoke['associations.updateStatusMapping'],
    updateCustomFieldValues: trackerInvoke['associations.updateCustomFieldValues'],
    updateEpicKey: trackerInvoke['associations.updateEpicKey'],
  },
  customFields: {
    getAvailable: trackerInvoke['customFields.get'],
  },
  projects: {
    list: trackerInvoke['projects.listJira'],
    listLinearTeams: trackerInvoke['projects.listLinearTeams'],
    listLinearProjects: trackerInvoke['projects.listLinearProjects'],
    getLabels: trackerInvoke['project.labels'],
    getComponents: trackerInvoke['project.components'],
    getStatuses: trackerInvoke['project.statuses'],
  },
  issues: {
    search: trackerInvoke['issues.search'],
    searchByJql: trackerInvoke['issues.searchJql'],
    getRecent: trackerInvoke['issues.recent'],
  },
  import: {
    getPreview: trackerInvoke['import.preview'],
    apply: trackerInvoke['import.apply'],
    importAll: trackerInvoke['import.all'],
    onProgress: trackerSubscriptions.importProgress,
  },
  sync: {
    getPreview: trackerInvoke['sync.preview'],
    applyChanges: trackerInvoke['sync.apply'],
    onProgress: trackerSubscriptions.syncProgress,
  },
  exportQueue: {
    get: exportInvoke['queue.get'],
    add: exportInvoke['queue.add'],
    remove: exportInvoke['queue.remove'],
    updateStatus: exportInvoke['queue.updateStatus'],
    updateCustomFieldOverrides: exportInvoke['queue.updateCustomFields'],
    clear: exportInvoke['queue.clear'],
    count: exportInvoke['queue.count'],
  },
  export: {
    getPreview: exportInvoke.preview,
    getReview: exportInvoke.review,
    executeApproved: exportInvoke.executeApproved,
  },
  typeMappings: {
    get: exportInvoke['mappings.get'],
    getByScope: exportInvoke['mappings.getByScope'],
    save: exportInvoke['mappings.save'],
    remove: exportInvoke['mappings.remove'],
    createDefaults: exportInvoke['mappings.createDefaults'],
  },
  issueTypes: {
    get: exportInvoke['issueTypes.get'],
  },
};

const claudeMd = {
  read: (projectId: string): Promise<{ success: boolean; content: string | null; error?: string }> =>
    invokeFlat<{ content: string | null; filename?: string }>(IPC_CHANNELS.claudeMd.read, { projectId }).then((result) =>
      result.success
        ? { success: true, content: result.content }
        : { success: false, content: null, error: result.error }
    ),
  write: (projectId: string, content: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.claudeMd.write, { projectId, content }),
};

const contextFiles = {
  list: (projectId: string): Promise<{
    success: boolean;
  files?: {
      path: string;
      name: string;
      isClaudeMd: boolean;
      modifiedAt: string;
    }[];
    error?: string;
  }> => invokeFlat<{ files: {
      path: string;
      name: string;
      isClaudeMd: boolean;
      modifiedAt: string;
    }[] }>(IPC_CHANNELS.context.list, { projectId }),
  read: (projectId: string, path: string): Promise<{ success: boolean; content: string | null; error?: string }> =>
    invokeFlat<{ content: string | null }>(IPC_CHANNELS.context.read, { projectId, path }).then((result) =>
      result.success
        ? { success: true, content: result.content }
        : { success: false, content: null, error: result.error }
    ),
  write: (projectId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.context.write, { projectId, path, content }),
  delete: (projectId: string, path: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.context.delete, { projectId, path }),
  import: (projectId: string, sourcePath: string): Promise<{ success: boolean; filename?: string; error?: string }> =>
    invokeFlat<{ filename: string }>(IPC_CHANNELS.context.import, { projectId, sourcePath }),
  selectDialog: (): Promise<string[]> =>
    invokeOrThrow<{ paths: string[] }, string[]>(IPC_CHANNELS.context.selectDialog, undefined, ({ paths }) => paths),
};

const menuSubscriptions = deriveEventSubscriptions(menuEvents, ipcRenderer);
const menu = {
  onNewProject: menuSubscriptions.newProject,
  onOpenProject: menuSubscriptions.openProject,
  onCloseContext: menuSubscriptions.closeContext,
  closeWindow: (): void => {
    ipcRenderer.send('window:close');
  },
};

const storybookInvoke = deriveDomainApi(storybookEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const storybook = {
  updateUrl: storybookInvoke.updateUrl,
  testConnection: storybookInvoke.testConnection,
};

const settingsInvoke = deriveDomainApi(settingsEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const settings = {
  anthropic: {
    hasKey: settingsInvoke['anthropic.hasKey'],
    saveKey: settingsInvoke['anthropic.saveKey'],
    deleteKey: settingsInvoke['anthropic.deleteKey'],
    testKey: settingsInvoke['anthropic.testKey'],
  },
  app: {
    get: settingsInvoke['app.get'],
    set: settingsInvoke['app.set'],
    getAll: settingsInvoke['app.getAll'],
  },
  claude: {
    getAvailability: settingsInvoke['claude.getAvailability'],
    refreshAvailability: settingsInvoke['claude.refreshAvailability'],
  },
};

const customThemeInvoke = deriveDomainApi(customThemeEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const customThemes = {
  list: () => customThemeInvoke.list(),
  importFromUrl: (url: string) => customThemeInvoke.importFromUrl({ url }),
  delete: (themeId: string) => customThemeInvoke.delete({ themeId }),
};

const themeInvoke = deriveDomainApi(themeEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const theme = {
  reportResolved: themeInvoke.reportResolved,
};

const permissionInvoke = deriveDomainApi(permissionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const permissionSubscriptions = deriveEventSubscriptions(permissionEvents, ipcRenderer);

const permission = {
  respond: permissionInvoke.respond,
  onRequest: permissionSubscriptions.request,
};

const permissions = {
  list: (projectId: string): Promise<ToolPermission[]> =>
    invokeOrThrow<{ permissions: ToolPermission[] }, ToolPermission[]>(
      IPC_CHANNELS.permission.list,
      { projectId },
      ({ permissions }) => permissions,
    ),
  revoke: permissionInvoke.revoke,
  revokeAll: permissionInvoke.revokeAll,
};

const artifactInvoke = deriveDomainApi(artifactEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const artifacts = {
  list: artifactInvoke.list,
  read: artifactInvoke.read,
  delete: artifactInvoke.delete,
  import: artifactInvoke.import,
  selectDialog: (): Promise<string[]> => artifactInvoke.selectDialog().then(({ paths }) => paths),
};

const taskPromptTemplateInvoke = deriveDomainApi(taskPromptTemplateEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const taskPromptTemplates = {
  list: (projectId?: string | null) => taskPromptTemplateInvoke.list({ projectId }),
  get: (templateId: string) => taskPromptTemplateInvoke.get({ templateId }),
  getEffective: (projectId: string) => taskPromptTemplateInvoke.getEffective({ projectId }),
  getBuiltinDefault: () => taskPromptTemplateInvoke.getBuiltinDefault({}),
  create: (projectId: string | null, name: string, promptContent: string) =>
    taskPromptTemplateInvoke.create({ projectId, name, promptContent }),
  update: (templateId: string, updates: { name?: string; promptContent?: string }) =>
    taskPromptTemplateInvoke.update({ templateId, ...updates }),
  delete: (templateId: string) => taskPromptTemplateInvoke.delete({ templateId }),
  setDefault: (templateId: string) => taskPromptTemplateInvoke.setDefault({ templateId }),
  ensureDefault: () => taskPromptTemplateInvoke.ensureDefault(),
};

// Custom Prompts API (Command+K palette prompts)
const customPromptSubscriptions = deriveEventSubscriptions(customPromptEvents, ipcRenderer);
const customPrompts = {
  // List all custom prompts
  list: (): Promise<{ success: boolean; data?: CustomPrompt[]; error?: string }> =>
    invokeFlat<{ prompts: CustomPrompt[] }>(IPC_CHANNELS.customPrompts.list, {}).then((result) =>
      result.success ? { success: true, data: result.prompts } : result
    ),

  // Get a single custom prompt
  get: (promptId: string): Promise<{ success: boolean; data?: CustomPrompt; error?: string }> =>
    invokeFlat<{ prompt: CustomPrompt }>(IPC_CHANNELS.customPrompts.get, { promptId }).then((result) =>
      result.success ? { success: true, data: result.prompt } : result
    ),

  // Create a new custom prompt
  create: (
    name: string,
    promptContent: string,
    options?: {
      description?: string | null;
      icon?: CustomPromptIcon;
      keywords?: string | null;
      targetType?: CustomPromptTargetType;
      runMode?: CustomPromptRunMode;
    }
  ): Promise<{ success: boolean; data?: CustomPrompt; error?: string }> =>
    invokeFlat<{ prompt: CustomPrompt }>(IPC_CHANNELS.customPrompts.create, { name, promptContent, ...options }).then((result) =>
      result.success ? { success: true, data: result.prompt } : result
    ),

  // Update a custom prompt
  update: (
    promptId: string,
    updates: {
      name?: string;
      description?: string | null;
      promptContent?: string;
      icon?: CustomPromptIcon;
      keywords?: string | null;
      targetType?: CustomPromptTargetType;
      runMode?: CustomPromptRunMode;
    }
  ): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.customPrompts.update, { promptId, ...updates }),

  // Delete a custom prompt (not allowed for built-in prompts)
  delete: (promptId: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.customPrompts.delete, { promptId }),

  // Execute a custom prompt
  execute: (
    projectId: string,
    promptId: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> =>
    invokeFlat<{ taskId: string }>(IPC_CHANNELS.customPrompts.execute, { promptId, projectId }),

  // Ensure built-in prompts exist
  ensureBuiltins: (): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.customPrompts.ensureBuiltins),

  // Progress callback
  onProgress: customPromptSubscriptions.progress,

  // Complete callback
  onComplete: customPromptSubscriptions.complete,

  // Error callback
  onError: customPromptSubscriptions.error,
};

// Scheduled Loops API (recurring AI-driven prompts, managed from Command+K)
const scheduledLoopSubscriptions = deriveEventSubscriptions(scheduledLoopEvents, ipcRenderer);
const scheduledLoops = {
  list: (payload: { projectId: string }): Promise<{ success: boolean; data?: ScheduledLoop[]; error?: string }> =>
    invokeFlat<{ loops: ScheduledLoop[] }>(scheduledLoopEndpoints.list.channel, payload).then((result) =>
      result.success ? { success: true, data: result.loops } : result
    ),

  get: (payload: { id: string }): Promise<{ success: boolean; data?: ScheduledLoop; error?: string }> =>
    invokeFlat<{ loop: ScheduledLoop }>(scheduledLoopEndpoints.get.channel, payload).then((result) =>
      result.success ? { success: true, data: result.loop } : result
    ),

  create: (payload: {
    projectId: string;
    name: string;
    prompt: string;
    outputMode: LoopOutputMode;
    intervalMinutes: number;
    enabled?: boolean;
  }): Promise<{ success: boolean; data?: ScheduledLoop; error?: string }> =>
    invokeFlat<{ loop: ScheduledLoop }>(scheduledLoopEndpoints.create.channel, payload).then((result) =>
      result.success ? { success: true, data: result.loop } : result
    ),

  update: (payload: {
    id: string;
    name?: string;
    prompt?: string;
    outputMode?: LoopOutputMode;
    intervalMinutes?: number;
    enabled?: boolean;
  }): Promise<{ success: boolean; data?: ScheduledLoop; error?: string }> =>
    invokeFlat<{ loop: ScheduledLoop }>(scheduledLoopEndpoints.update.channel, payload).then((result) =>
      result.success ? { success: true, data: result.loop } : result
    ),

  setEnabled: (payload: { id: string; enabled: boolean }): Promise<{ success: boolean; data?: ScheduledLoop; error?: string }> =>
    invokeFlat<{ loop: ScheduledLoop }>(scheduledLoopEndpoints.setEnabled.channel, payload).then((result) =>
      result.success ? { success: true, data: result.loop } : result
    ),

  delete: (payload: { id: string }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(scheduledLoopEndpoints.delete.channel, payload),

  runNow: (payload: { id: string }): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(scheduledLoopEndpoints.runNow.channel, payload),

  history: (payload: { loopId: string; limit?: number }): Promise<{ success: boolean; data?: LoopRun[]; error?: string }> =>
    invokeFlat<{ runs: LoopRun[] }>(scheduledLoopEndpoints.history.channel, payload).then((result) =>
      result.success ? { success: true, data: result.runs } : result
    ),

  onRun: scheduledLoopSubscriptions.run,
};

// Notifications (kind-agnostic; fed by NotificationService's `notification:new` broadcast)
const notificationSubscriptions = deriveEventSubscriptions(notificationEvents, ipcRenderer);
const notifications = {
  onNew: notificationSubscriptions.new,
};

const githubInvoke = deriveDomainApi(githubEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const github = {
  checkAuth: githubInvoke.checkAuth,
  createPr: githubInvoke.createPr,
  getPrStatus: githubInvoke.getPrStatus,
  getPrComments: githubInvoke.getPrComments,
  buildPrContext: githubInvoke.buildPrContext,
  generatePrContent: githubInvoke.generatePrContent,
  buildAddressCommentsContext: githubInvoke.buildAddressCommentsContext,
  detectAndLinkPr: githubInvoke.detectAndLinkPr,
  linkPr: githubInvoke.linkPr,
  linkPrToItem: githubInvoke.linkPrToItem,
};

const reviewInvoke = deriveDomainApi(reviewEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const reviewSubscriptions = deriveEventSubscriptions(reviewEvents, ipcRenderer);

const review = {
  getInbox: reviewInvoke.getInbox,
  refreshSession: reviewInvoke.refreshSession,
  assignOwnership: reviewInvoke.assignOwnership,
  assessThreads: reviewInvoke.assessThreads,
  draftPostImplReplies: reviewInvoke.draftPostImplReplies,
  triggerAutomation: reviewInvoke.triggerAutomation,
  replyToThread: reviewInvoke.replyToThread,
  resolveThread: reviewInvoke.resolveThread,
  unresolveThread: reviewInvoke.unresolveThread,
  ignoreTask: reviewInvoke.ignoreTask,
  overrideDisposition: reviewInvoke.overrideDisposition,
  pollNow: () => reviewInvoke.pollNow(undefined),
  pollSession: reviewInvoke.pollSession,
  onSyncUpdated: reviewSubscriptions.syncUpdated,
  onActionableChanged: reviewSubscriptions.pollActionable,
};

const devSessionInvoke = deriveDomainApi(devSessionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const devSessionSubscriptions = deriveEventSubscriptions(devSessionEvents, ipcRenderer);

const devSessions = {
  getByProject: devSessionInvoke.getByProject,

  getByProjectWithPlanItems: devSessionInvoke.getByProjectWithPlanItems,

  getActive: devSessionInvoke.getActive,

  get: devSessionInvoke.get,

  hasActive: devSessionInvoke.hasActive,

  openEditor: devSessionInvoke.openEditor,

  updateStatus: devSessionInvoke.updateStatus,

  delete: devSessionInvoke.delete,

  destroy: devSessionInvoke.destroy,

  checkDirty: devSessionInvoke.checkDirty,

  getDiff: devSessionInvoke.getDiff,

  getCommitsAhead: devSessionInvoke.getCommitsAhead,

  // Session status change event listener (replaces polling)
  onStatusChanged: devSessionSubscriptions.statusChanged,

  updateName: devSessionInvoke.updateName,

  getMergeOrder: devSessionInvoke.getMergeOrder,

  updateMergeOrder: devSessionInvoke.updateMergeOrder,
};

// =============================================================================
// Agent Sessions (Board-Driven Execution)
// =============================================================================

const agentSessionInvoke = deriveDomainApi(agentSessionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const agentSessionSubscriptions = deriveEventSubscriptions(agentSessionEvents, ipcRenderer);

const agentSessions = {
  // Create pending session + start agent in one call (primary entry point from board UI)
  createAndStart: agentSessionInvoke.createAndStart,

  // Start an agent session for an existing pending/inactive dev session
  startAgent: agentSessionInvoke.startAgent,

  respond: agentSessionInvoke.respond,

  followUp: agentSessionInvoke.followUp,

  stop: agentSessionInvoke.stop,

  getActivities: agentSessionInvoke.getActivities,

  getState: agentSessionInvoke.getState,

  getAvailableAgents: agentSessionInvoke.getAvailableAgents,

  // Launch opposing-agent auto-review for a completed session
  launchReview: agentSessionInvoke.launchReview,

  // Generate a commit message for the session's changes using the configured instructions
  generateCommitMessage: agentSessionInvoke.generateCommitMessage,

  // Commit uncommitted changes in the session's worktree
  commit: agentSessionInvoke.commit,

  // Get structured commit log (commits ahead of base branch)
  getCommitLog: agentSessionInvoke.getCommitLog,

  // Get file stats for a single commit
  getCommitFiles: agentSessionInvoke.getCommitFiles,

  // Dismiss an "Automation interrupted" banner (clears needs_attention -> idle)
  dismissInterruption: agentSessionInvoke.dismissInterruption,

  // Event listeners
  onStateChanged: agentSessionSubscriptions.stateChanged,
  onActivity: agentSessionSubscriptions.activity,
  onQuestion: agentSessionSubscriptions.question,
  onComplete: agentSessionSubscriptions.complete,
  onError: agentSessionSubscriptions.error,
};

const fileExplorerInvoke = deriveDomainApi(fileExplorerEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const fileExplorerSubscriptions = deriveEventSubscriptions(fileExplorerEvents, ipcRenderer);

const fileExplorer = {
  // List directory contents
  listDirectory: fileExplorerInvoke.listDirectory,

  // Create a new folder
  createFolder: fileExplorerInvoke.createFolder,

  // Create a new file
  createFile: fileExplorerInvoke.createFile,

  // Copy an external file into the project
  copyExternalFile: fileExplorerInvoke.copyExternalFile,

  // Create a new binary file (images, PDFs, etc.)
  createBinaryFile: fileExplorerInvoke.createBinaryFile,

  // Create a symlink to external path
  createSymlink: fileExplorerInvoke.createSymlink,

  // Delete a file or folder
  delete: fileExplorerInvoke.delete,

  // Rename/move a file or folder
  rename: fileExplorerInvoke.rename,

  // Get info about a single file/folder
  getInfo: fileExplorerInvoke.getInfo,

  // Read file content
  readFile: fileExplorerInvoke.readFile,

  // Read binary file content (images, etc.)
  readBinaryFile: fileExplorerInvoke.readBinaryFile,

  // Write file content
  writeFile: fileExplorerInvoke.writeFile,

  // Get symlink information
  getSymlinkInfo: fileExplorerInvoke.getSymlinkInfo,

  // Show a project file/folder in Finder/Explorer
  showItemInFolder: fileExplorerInvoke.showItemInFolder,

  // Open a project file/folder in the user's code editor
  openInEditor: fileExplorerInvoke.openInEditor,

  // Show folder selection dialog for linking external folders
  selectFolderDialog: fileExplorerInvoke.selectFolderDialog,

  // Listen for file change events (real-time updates when files are created/updated/deleted)
  onFileChange: fileExplorerSubscriptions.fileChanged,

  // Listen for cross-boundary write/delete/rename/symlink events. Fires when
  // an IPC file op succeeded against a path whose realpath sits outside the
  // project root (i.e. via a symlink). Renderer can surface this in an
  // activity feed for audit / observability.
  onExternalAccess: fileExplorerSubscriptions.externalAccess,

  // Watch project folder for external file changes (Finder, terminal, etc.)
  watchProject: fileExplorerInvoke.watchProject,

  // Stop watching project folder
  unwatchProject: fileExplorerInvoke.unwatchProject,
};

const repoFilesInvoke = deriveDomainApi(repoFilesEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

// Repo Files API (Workspace file browser for connected repos)
const repoFiles = {
  // List directory contents within a repo
  listDirectory: repoFilesInvoke.listDirectory,

  // Read file content from a repo
  readFile: repoFilesInvoke.readFile,

  // Write file content to a repo (markdown/text files only)
  writeFile: repoFilesInvoke.writeFile,

  // Get info about a single file/folder
  getInfo: repoFilesInvoke.getInfo,

  // Show a repo file/folder in Finder/Explorer
  showItemInFolder: repoFilesInvoke.showItemInFolder,
};

// Shell API (for OS-level operations)
const shellInvoke = deriveDomainApi(shellEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const shell = {
  // Open URL in default browser
  openExternal: (url: string) => shellInvoke.openExternal({ url }),
};

// Terminal API (embedded developer terminal panel)
const terminalInvoke = deriveDomainApi(terminalEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const terminalSubscriptions = deriveEventSubscriptions(terminalEvents, ipcRenderer);
const terminal = {
  create: terminalInvoke.create,
  write: terminalInvoke.write,
  resize: terminalInvoke.resize,
  kill: terminalInvoke.kill,
  onData: terminalSubscriptions.data,
  onExit: terminalSubscriptions.exit,
};

const perfInvoke = deriveDomainApi(perfEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const perf = {
  enabled: process.env.KPM_PERF === '1' || process.env.KPM_PERF === 'true',
  log: (event: { name: string; durationMs?: number; meta?: Record<string, unknown> }) => perfInvoke.log(event),
  getLogInfo: () => perfInvoke.getLogInfo(),
};


const confluenceInvoke = deriveDomainApi(confluenceEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const confluence = {
  link: confluenceInvoke.link,
  unlink: confluenceInvoke.unlink,
  getLinks: confluenceInvoke.getLinks,
  getLinkForDocument: confluenceInvoke.getLinkForDocument,
  getSyncPreview: confluenceInvoke.syncPreview,
  push: confluenceInvoke.pushExecute,
  pull: confluenceInvoke.pullExecute,
  parseUrl: confluenceInvoke.parseUrl,
};

// Tool Call Logging API (DevTools panel)
const toolLogInvoke = deriveDomainApi(toolLogEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const toolLogSubscriptions = deriveEventSubscriptions(toolLogEvents, ipcRenderer);
const toolLog = {
  getEntries: toolLogInvoke.getEntries,
  getSessionStats: toolLogInvoke.getSessionStats,
  getInfo: toolLogInvoke.getInfo,
  setEnabled: toolLogInvoke.setEnabled,
  onCall: toolLogSubscriptions.call,
  onTurnSummary: toolLogSubscriptions.turnSummary,
};

const searchInvoke = deriveDomainApi(searchEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

// Search API (Global search across project entities)
const search = {
  global: searchInvoke.global,
};

// Prompt Overrides API (configurable system prompts)
const promptOverridesInvoke = deriveDomainApi(promptOverridesEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const promptOverrides = {
  list: promptOverridesInvoke.list,
  get: promptOverridesInvoke.get,
  set: promptOverridesInvoke.set,
  reset: promptOverridesInvoke.reset,
};

// Briefing API (project state synthesis)
const briefingInvoke = deriveDomainApi(briefingEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const briefingSubscriptions = deriveEventSubscriptions(briefingEvents, ipcRenderer);
const briefing = {
  generate: briefingInvoke.generate,
  get: briefingInvoke.get,
  /**
   * Subscribe to streaming briefing chunks. Fires per text delta as Stage 2
   * synthesizes. Returns an unsubscribe function.
   */
  onChunk: briefingSubscriptions.chunk,
};

// Claude usage tracking API
const usageInvoke = deriveDomainApi(usageEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const usageSubscriptions = deriveEventSubscriptions(usageEvents, ipcRenderer);
const usage = {
  getProjectStats: usageInvoke.getProjectStats,
  getGlobalStats: usageInvoke.getGlobalStats,
  listEvents: usageInvoke.listEvents,
  resetProject: usageInvoke.resetProject,
  /**
   * Subscribe to live usage events broadcast every time a Claude turn
   * finishes. Returns an unsubscribe function.
   */
  onUsageEvent: usageSubscriptions.event,
};

// MCP Servers API
const mcpServersInvoke = deriveDomainApi(mcpServersEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const mcpServers = {
  listAvailable: () => mcpServersInvoke.listAvailable({}),
  getPreferences: () => mcpServersInvoke.getPreferences({}),
  setEnabled: mcpServersInvoke.setEnabled,
};

// Testing API - only available when NODE_ENV=test
// Used by E2E tests for database reset and test isolation
const testing = {
  // Reset database - truncates all tables while preserving schema
  resetDatabase: (): Promise<{ success: boolean; tablesReset?: number; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.testing.resetDatabase),
  // Report which database file the app actually opened (isolation check)
  getDbPath: (): Promise<{ dbPath: string | null }> =>
    ipcRenderer.invoke(IPC_CHANNELS.testing.getDbPath),
};

// Debug API - console-only toggle used to gate other diagnostic handlers.
// Usage in console:
//   await window.api.debug.enable()
const debug = {
  enable: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.debug.setEnabled, true),
  disable: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.debug.setEnabled, false),
  isEnabled: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.debug.isEnabled),
};

// Onboarding API (project setup wizard)
const onboardingSubscriptions = deriveEventSubscriptions(onboardingEvents, ipcRenderer);
const onboarding = {
  generate: (taskId: string, projectId: string, description: string, repoDirectories: Record<string, string[]>): Promise<{ taskId: string }> =>
    invokeOrThrow<{ taskId: string }, { taskId: string }>(
      IPC_CHANNELS.onboarding.generate,
      { taskId, projectId, description, repoDirectories },
      ({ taskId: nextTaskId }) => ({ taskId: nextTaskId }),
    ),
  saveContext: (projectId: string, content: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.onboarding.saveContext, { projectId, content }),
  saveContextDirectories: (
    projectId: string,
    repoDirectories: Record<string, string[]>,
  ): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.onboarding.saveContextDirectories, { projectId, repoDirectories }),
  getContextDirectories: (projectId: string): Promise<Record<string, string[]> | null> =>
    invokeOrThrow<{ directories: Record<string, string[]> | null }, Record<string, string[]> | null>(
      IPC_CHANNELS.onboarding.getContextDirectories,
      { projectId },
      ({ directories }) => directories,
    ),
  onProgress: onboardingSubscriptions.progress,
  onThinking: onboardingSubscriptions.thinking,
  onComplete: onboardingSubscriptions.complete,
  onError: onboardingSubscriptions.error,
};

// Slack Triage API
const slackInvoke = deriveDomainApi(slackEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const slack = {
  availability: {
    get: slackInvoke['availability.get'],
  },
  links: {
    list: slackInvoke['links.list'],
    create: slackInvoke['links.create'],
    delete: slackInvoke['links.delete'],
  },
  triage: {
    trigger: slackInvoke['triage.trigger'],
    getPending: slackInvoke['triage.getPending'],
    getAll: slackInvoke['triage.getAll'],
    countPending: slackInvoke['triage.countPending'],
    approve: slackInvoke['triage.approve'],
    edit: slackInvoke['triage.edit'],
    dismiss: slackInvoke['triage.dismiss'],
    restore: slackInvoke['triage.restore'],
    execute: slackInvoke['triage.execute'],
  },
};

export const api = {
  tempImages,
  chat,
  projects,
  repos,
  attachments,
  plan,
  groups,
  tracker,
  claudeMd,
  contextFiles,
  menu,
  storybook,
  settings,
  customThemes,
  theme,
  permission,
  permissions,
  artifacts,
  taskPromptTemplates,
  customPrompts,
  scheduledLoops,
  notifications,
  github,
  review,
  devSessions,
  agentSessions,
  fileExplorer,
  repoFiles,
  shell,
  terminal,
  perf,
  confluence,
  debug,
  testing,
  toolLog,
  search,
  promptOverrides,
  briefing,
  usage,
  mcpServers,
  onboarding,
  slack,
};

export type API = typeof api;
