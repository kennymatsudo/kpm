import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import { deriveDomainApi } from '../shared/ipc/endpoints';
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
import { worktreeEndpoints } from '../shared/ipc/worktreeEndpoints';
import { devSessionEndpoints } from '../shared/ipc/devSessionEndpoints';
import { agentSessionEndpoints } from '../shared/ipc/agentSessionEndpoints';
import { reviewEndpoints } from '../shared/ipc/reviewEndpoints';
import { githubEndpoints } from '../shared/ipc/githubEndpoints';
import { projectEndpoints } from '../shared/ipc/projectEndpoints';
import { repoEndpoints } from '../shared/ipc/repoEndpoints';
import { taskPromptTemplateEndpoints } from '../shared/ipc/taskPromptTemplateEndpoints';
import { customThemeEndpoints } from '../shared/ipc/customThemeEndpoints';
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
  Worktree,
  WorktreeStatus,
  LaunchResult,
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
  ReviewActionableSummary,
  SlackChannelLink,
  SlackTriageItem,
  AgentExecutionMode,
  AgentReviewPolicy,
  CustomTheme,
  ImportedCustomThemeResult,
  AppNotification,
} from '../shared/types';
import type {
  AgentSessionStatePayload,
  AgentSessionActivityPayload,
  AgentSessionQuestionPayload,
  AgentSessionCompletePayload,
} from '../shared/agent-types';
import type {
  UsageLiveEvent,
} from '../shared/usage-types';

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
  Worktree,
  WorktreeStatus,
  LaunchResult,
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
  onChunk: (callback: (data: {
    projectId: string;
    chatSessionId?: string;
    text: string;
    segmentId?: number;
    precedingActivities?: Activity[];
  }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: {
      projectId: string;
      chatSessionId?: string;
      text: string;
      segmentId?: number;
      precedingActivities?: Activity[];
    }) => callback(data);
    ipcRenderer.on('chat:chunk', handler);
    return () => ipcRenderer.removeListener('chat:chunk', handler);
  },
  onPlanActions: (callback: (data: { projectId: string; chatSessionId?: string; actions: PlanAction[] }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; actions: PlanAction[] }) => callback(data);
    ipcRenderer.on('chat:plan-actions', handler);
    return () => ipcRenderer.removeListener('chat:plan-actions', handler);
  },
  onDone: (callback: (data: {
    projectId: string;
    chatSessionId?: string;
    model?: string;
    hasQueuedFollowUp?: boolean;
    queuedClientMessageId?: string;
    consumedQueuedClientMessageId?: string;
  }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: {
      projectId: string;
      chatSessionId?: string;
      model?: string;
      hasQueuedFollowUp?: boolean;
      queuedClientMessageId?: string;
      consumedQueuedClientMessageId?: string;
    }) => callback(data);
    ipcRenderer.on('chat:done', handler);
    return () => ipcRenderer.removeListener('chat:done', handler);
  },
  onQueued: (callback: (data: { projectId: string; chatSessionId?: string; clientMessageId?: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; clientMessageId?: string }) => callback(data);
    ipcRenderer.on('chat:queued', handler);
    return () => ipcRenderer.removeListener('chat:queued', handler);
  },
  onQueueCleared: (callback: (data: {
    projectId: string;
    chatSessionId?: string;
    clientMessageId?: string;
    reason?: 'cancelled' | 'already_sent' | 'session_disconnected';
  }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: {
      projectId: string;
      chatSessionId?: string;
      clientMessageId?: string;
      reason?: 'cancelled' | 'already_sent' | 'session_disconnected';
    }) => callback(data);
    ipcRenderer.on('chat:queue-cleared', handler);
    return () => ipcRenderer.removeListener('chat:queue-cleared', handler);
  },
  onError: (callback: (data: { projectId: string; chatSessionId?: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; error: string }) => callback(data);
    ipcRenderer.on('chat:error', handler);
    return () => ipcRenderer.removeListener('chat:error', handler);
  },
  onActivity: (callback: (data: { projectId: string; chatSessionId?: string; activity: Activity }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; activity: Activity }) => callback(data);
    ipcRenderer.on('chat:activity', handler);
    return () => ipcRenderer.removeListener('chat:activity', handler);
  },
  onThinking: (callback: (data: { projectId: string; chatSessionId?: string; text: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; text: string }) => callback(data);
    ipcRenderer.on('chat:thinking', handler);
    return () => ipcRenderer.removeListener('chat:thinking', handler);
  },
  onFileUpdate: (callback: (data: { projectId: string; chatSessionId?: string; filePath: string; content: string; oldContent?: string | null; forceReview?: boolean }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; filePath: string; content: string; oldContent?: string | null }) => callback(data);
    ipcRenderer.on('chat:file-update', handler);
    return () => ipcRenderer.removeListener('chat:file-update', handler);
  },
  onFileDelete: (callback: (data: { projectId: string; chatSessionId?: string; path: string; isDirectory: boolean }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; path: string; isDirectory: boolean }) => callback(data);
    ipcRenderer.on('chat:file-delete', handler);
    return () => ipcRenderer.removeListener('chat:file-delete', handler);
  },

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
  onSessionConnecting: (callback: (data: { projectId: string; chatSessionId?: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string }) => callback(data);
    ipcRenderer.on('chat:session-connecting', handler);
    return () => ipcRenderer.removeListener('chat:session-connecting', handler);
  },

  /** Session ready event */
  onSessionReady: (callback: (data: { projectId: string; chatSessionId?: string; sessionId?: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; sessionId?: string }) => callback(data);
    ipcRenderer.on('chat:session-ready', handler);
    return () => ipcRenderer.removeListener('chat:session-ready', handler);
  },

  /** Session title event — SDK-derived summary used to label the session tab. */
  onSessionTitle: (callback: (data: { projectId: string; chatSessionId?: string; title: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; title: string }) => callback(data);
    ipcRenderer.on('chat:session-title', handler);
    return () => ipcRenderer.removeListener('chat:session-title', handler);
  },

  /** Session error event */
  onSessionError: (callback: (data: { projectId: string; chatSessionId?: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; error: string }) => callback(data);
    ipcRenderer.on('chat:session-error', handler);
    return () => ipcRenderer.removeListener('chat:session-error', handler);
  },

  /** Prompt suggestions event (after turn completes) */
  onSuggestions: (callback: (data: { projectId: string; chatSessionId?: string; suggestions: string[] }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; suggestions: string[] }) => callback(data);
    ipcRenderer.on('chat:suggestions', handler);
    return () => ipcRenderer.removeListener('chat:suggestions', handler);
  },

  /** Slash command list event — SDK-derived full list; replaces any scanned list */
  onSlashCommands: (callback: (data: { projectId: string; chatSessionId?: string; commands: SlashCommandInfo[] }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; commands: SlashCommandInfo[] }) => callback(data);
    ipcRenderer.on('chat:slash-commands', handler);
    return () => ipcRenderer.removeListener('chat:slash-commands', handler);
  },

  /** Session deactivated event (multi-session support) */
  onSessionDeactivated: (callback: (data: {
    projectId: string;
    chatSessionId?: string;
    reason?: string;
    source?: string;
    previousState?: string;
  }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: {
      projectId: string;
      chatSessionId?: string;
      reason?: string;
      source?: string;
      previousState?: string;
    }) => callback(data);
    ipcRenderer.on('chat:session-deactivated', handler);
    return () => ipcRenderer.removeListener('chat:session-deactivated', handler);
  },

  /** MCP server status change event (health monitoring) */
  onMcpStatus: (callback: (data: {
    projectId: string;
    chatSessionId?: string;
    serverName: string;
    status: string;
    error?: string;
  }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: {
      projectId: string;
      chatSessionId?: string;
      serverName: string;
      status: string;
      error?: string;
    }) => callback(data);
    ipcRenderer.on('chat:mcp-status', handler);
    return () => ipcRenderer.removeListener('chat:mcp-status', handler);
  },

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
  onBranchChanged: (callback: (data: { repoId: string; repoPath: string; branch: string | null }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { repoId: string; repoPath: string; branch: string | null }) => callback(data);
    ipcRenderer.on('repo:branch-changed', handler);
    return () => ipcRenderer.removeListener('repo:branch-changed', handler);
  },
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
  onRefreshRequested: (callback: (event: { projectId: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: { projectId: string }) => callback(event);
    ipcRenderer.on('plan:refresh-requested', handler);
    return () => ipcRenderer.removeListener('plan:refresh-requested', handler);
  },
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
    onProgress: (callback: (data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => callback(data);
      ipcRenderer.on('tracker:import:progress', handler);
      return () => ipcRenderer.removeListener('tracker:import:progress', handler);
    },
  },
  sync: {
    getPreview: trackerInvoke['sync.preview'],
    applyChanges: trackerInvoke['sync.apply'],
    onProgress: (callback: (data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => callback(data);
      ipcRenderer.on('tracker:sync:progress', handler);
      return () => ipcRenderer.removeListener('tracker:sync:progress', handler);
    },
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

const menu = {
  onNewProject: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:new-project', handler);
    return () => ipcRenderer.removeListener('menu:new-project', handler);
  },
  onOpenProject: (callback: (data: { projectId: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string }) => callback(data);
    ipcRenderer.on('menu:open-project', handler);
    return () => ipcRenderer.removeListener('menu:open-project', handler);
  },
  onCloseContext: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:close-context', handler);
    return () => ipcRenderer.removeListener('menu:close-context', handler);
  },
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

const permissionInvoke = deriveDomainApi(permissionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const permission = {
  respond: permissionInvoke.respond,
  onRequest: (callback: (request: PermissionRequest) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, request: PermissionRequest) => callback(request);
    ipcRenderer.on('permission:request', handler);
    return () => ipcRenderer.removeListener('permission:request', handler);
  },
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
  onProgress: (callback: (data: { taskId: string; message: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; message: string }) => callback(data);
    ipcRenderer.on('custom-prompt:progress', handler);
    return () => ipcRenderer.removeListener('custom-prompt:progress', handler);
  },

  // Complete callback
  onComplete: (callback: (data: { taskId: string; filePath: string; promptName: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; filePath: string; promptName: string }) => callback(data);
    ipcRenderer.on('custom-prompt:complete', handler);
    return () => ipcRenderer.removeListener('custom-prompt:complete', handler);
  },

  // Error callback
  onError: (callback: (data: { taskId: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; error: string }) => callback(data);
    ipcRenderer.on('custom-prompt:error', handler);
    return () => ipcRenderer.removeListener('custom-prompt:error', handler);
  },
};

// Scheduled Loops API (recurring AI-driven prompts, managed from Command+K)
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

  onRun: (callback: (data: { projectId: string; loopId: string; outcome: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; loopId: string; outcome: string }) => callback(data);
    ipcRenderer.on('scheduled-loop:run', handler);
    return () => ipcRenderer.removeListener('scheduled-loop:run', handler);
  },
};

// Notifications (kind-agnostic; fed by NotificationService's `notification:new` broadcast)
const notifications = {
  onNew: (callback: (notification: AppNotification) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, notification: AppNotification) => callback(notification);
    ipcRenderer.on('notification:new', handler);
    return () => ipcRenderer.removeListener('notification:new', handler);
  },
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
  onSyncUpdated: (callback: (data: { sessionId: string; needsReviewCount: number; totalTasks: number; fetchedAt: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; needsReviewCount: number; totalTasks: number; fetchedAt: string }) => callback(data);
    ipcRenderer.on('review:sync-updated', handler);
    return () => ipcRenderer.removeListener('review:sync-updated', handler);
  },
  onActionableChanged: (callback: (summary: ReviewActionableSummary) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, summary: ReviewActionableSummary) => callback(summary);
    ipcRenderer.on('review-poll:actionable', handler);
    return () => ipcRenderer.removeListener('review-poll:actionable', handler);
  },
};

const worktreeInvoke = deriveDomainApi(worktreeEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const worktrees = {
  getByProject: worktreeInvoke.getByProject,
  getByPlanItem: worktreeInvoke.getByPlanItem,
  openEditor: worktreeInvoke.openEditor,
  getStatus: worktreeInvoke.getStatus,
  delete: (payload: { worktreeId: string; force?: boolean }) =>
    worktreeInvoke.delete({ worktreeId: payload.worktreeId, force: payload.force ?? false }),
  push: worktreeInvoke.push,
  destroy: worktreeInvoke.destroy,
};

const devSessionInvoke = deriveDomainApi(devSessionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

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
  onStatusChanged: (
    callback: (event: { sessionId: string; projectId: string; status: string }) => void
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      event: { sessionId: string; projectId: string; status: string }
    ) => callback(event);
    ipcRenderer.on('dev-session:status-changed', handler);
    return () => ipcRenderer.removeListener('dev-session:status-changed', handler);
  },

  updateName: devSessionInvoke.updateName,

  getMergeOrder: devSessionInvoke.getMergeOrder,

  updateMergeOrder: devSessionInvoke.updateMergeOrder,
};

// =============================================================================
// Agent Sessions (Board-Driven Execution)
// =============================================================================

const agentSessionInvoke = deriveDomainApi(agentSessionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

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
  onStateChanged: (callback: (event: AgentSessionStatePayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: AgentSessionStatePayload) => callback(event);
    ipcRenderer.on('agent-session:state-changed', handler);
    return () => ipcRenderer.removeListener('agent-session:state-changed', handler);
  },

  onActivity: (callback: (event: AgentSessionActivityPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: AgentSessionActivityPayload) => callback(event);
    ipcRenderer.on('agent-session:activity', handler);
    return () => ipcRenderer.removeListener('agent-session:activity', handler);
  },

  onQuestion: (callback: (event: AgentSessionQuestionPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: AgentSessionQuestionPayload) => callback(event);
    ipcRenderer.on('agent-session:question', handler);
    return () => ipcRenderer.removeListener('agent-session:question', handler);
  },

  onComplete: (callback: (event: AgentSessionCompletePayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: AgentSessionCompletePayload) => callback(event);
    ipcRenderer.on('agent-session:complete', handler);
    return () => ipcRenderer.removeListener('agent-session:complete', handler);
  },

  onError: (callback: (event: { sessionId: string; devSessionId: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: { sessionId: string; devSessionId: string; error: string }) => callback(event);
    ipcRenderer.on('agent-session:error', handler);
    return () => ipcRenderer.removeListener('agent-session:error', handler);
  },
};

const fileExplorerInvoke = deriveDomainApi(fileExplorerEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

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
  onFileChange: (
    callback: (data: {
      projectId: string;
      type: 'created' | 'updated' | 'deleted' | 'renamed';
      path: string;
      newPath?: string;
      isDirectory: boolean;
    }) => void
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: {
        projectId: string;
        type: 'created' | 'updated' | 'deleted' | 'renamed';
        path: string;
        newPath?: string;
        isDirectory: boolean;
      }
    ) => callback(data);
    ipcRenderer.on('file-explorer:file-changed', handler);
    return () => ipcRenderer.removeListener('file-explorer:file-changed', handler);
  },

  // Listen for cross-boundary write/delete/rename/symlink events. Fires when
  // an IPC file op succeeded against a path whose realpath sits outside the
  // project root (i.e. via a symlink). Renderer can surface this in an
  // activity feed for audit / observability.
  onExternalAccess: (
    callback: (data: {
      projectId: string;
      op: 'write' | 'delete' | 'rename' | 'create-symlink' | 'copy-into';
      relativePath: string;
      realpath: string;
    }) => void
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: {
        projectId: string;
        op: 'write' | 'delete' | 'rename' | 'create-symlink' | 'copy-into';
        relativePath: string;
        realpath: string;
      }
    ) => callback(data);
    ipcRenderer.on('file-explorer:external-access', handler);
    return () => ipcRenderer.removeListener('file-explorer:external-access', handler);
  },

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
const terminal = {
  create: terminalInvoke.create,
  write: terminalInvoke.write,
  resize: terminalInvoke.resize,
  kill: terminalInvoke.kill,
  onData: (callback: (data: { id: string; data: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { id: string; data: string }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.terminal.data, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.terminal.data, handler);
  },
  onExit: (callback: (data: { id: string; exitCode: number; signal?: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { id: string; exitCode: number; signal?: number }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.terminal.exit, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.terminal.exit, handler);
  },
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
const toolLog = {
  getEntries: toolLogInvoke.getEntries,
  getSessionStats: toolLogInvoke.getSessionStats,
  getInfo: toolLogInvoke.getInfo,
  setEnabled: toolLogInvoke.setEnabled,
  onCall: (callback: (entry: ToolCallLogEntry) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, entry: ToolCallLogEntry) => callback(entry);
    ipcRenderer.on('toollog:call', handler);
    return () => ipcRenderer.removeListener('toollog:call', handler);
  },
  onTurnSummary: (callback: (summary: ToolCallTurnSummary) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, summary: ToolCallTurnSummary) => callback(summary);
    ipcRenderer.on('toollog:turn-summary', handler);
    return () => ipcRenderer.removeListener('toollog:turn-summary', handler);
  },
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
const briefing = {
  generate: briefingInvoke.generate,
  get: briefingInvoke.get,
  /**
   * Subscribe to streaming briefing chunks. Fires per text delta as Stage 2
   * synthesizes. Returns an unsubscribe function.
   */
  onChunk: (handler: (event: { projectId: string; delta: string }) => void) => {
    const listener = (_: unknown, payload: { projectId: string; delta: string }) => handler(payload);
    ipcRenderer.on(IPC_CHANNELS.briefing.chunk, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.briefing.chunk, listener);
  },
};

// Claude usage tracking API
const usageInvoke = deriveDomainApi(usageEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const usage = {
  getProjectStats: usageInvoke.getProjectStats,
  getGlobalStats: usageInvoke.getGlobalStats,
  listEvents: usageInvoke.listEvents,
  resetProject: usageInvoke.resetProject,
  /**
   * Subscribe to live usage events broadcast every time a Claude turn
   * finishes. Returns an unsubscribe function.
   */
  onUsageEvent: (handler: (event: UsageLiveEvent) => void) => {
    const listener = (_: unknown, payload: UsageLiveEvent) => handler(payload);
    ipcRenderer.on('usage:event', listener);
    return () => ipcRenderer.removeListener('usage:event', listener);
  },
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
  onProgress: (callback: (data: { taskId: string; message: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; message: string }) => callback(data);
    ipcRenderer.on('onboarding:progress', handler);
    return () => ipcRenderer.removeListener('onboarding:progress', handler);
  },
  onThinking: (callback: (data: { taskId: string; text: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; text: string }) => callback(data);
    ipcRenderer.on('onboarding:thinking', handler);
    return () => ipcRenderer.removeListener('onboarding:thinking', handler);
  },
  onComplete: (callback: (data: { taskId: string; content: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; content: string }) => callback(data);
    ipcRenderer.on('onboarding:complete', handler);
    return () => ipcRenderer.removeListener('onboarding:complete', handler);
  },
  onError: (callback: (data: { taskId: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; error: string }) => callback(data);
    ipcRenderer.on('onboarding:error', handler);
    return () => ipcRenderer.removeListener('onboarding:error', handler);
  },
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
  permission,
  permissions,
  artifacts,
  taskPromptTemplates,
  customPrompts,
  scheduledLoops,
  notifications,
  github,
  review,
  worktrees,
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
