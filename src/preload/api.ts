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
  CustomFieldValues,
  JiraCustomField,
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
  StatusCategory,
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
  PrStatus,
  PrComment,
  ReviewInboxSnapshot,
  ReviewActionableSummary,
  DiscoveredPlugin,
  UserMcpServer,
  DiscoveredMcpServer,
  SlackChannelLink,
  SlackTriageItem,
  AgentType,
  AgentSessionState,
  AgentSessionRole,
  AgentEffortLevel,
  AgentExecutionMode,
  AgentReviewPolicy,
  CustomTheme,
  ImportedCustomThemeResult,
  ClaudeAvailability,
  AppNotification,
} from '../shared/types';
import type {
  AgentActivity,
  AgentSessionStatePayload,
  AgentSessionActivityPayload,
  AgentSessionQuestionPayload,
  AgentSessionCompletePayload,
} from '../shared/agent-types';
import type {
  ClaudeUsageEvent,
  ProjectUsageStats,
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
  save: tempImageInvoke.save as (payload: { imageData: Uint8Array; format: string }) => Promise<{ success: true; path: string; filename: string } | { success: false; error: string }>,
  delete: tempImageInvoke.delete as (payload: { filePath: string }) => Promise<{ success: boolean; error?: string }>,
};

const chatInvoke = deriveDomainApi(chatEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const chat = {
  sendMessage: chatInvoke.send as (payload: {
    projectId: string;
    message: string;
    focusedResources: FocusedResource[];
    model?: ClaudeModel;
    tempImages?: string[];
    chatSessionId?: string;
    currentView?: ChatViewMode;
    clientMessageId?: string;
    effort?: AgentEffortLevel;
    focusDocument?: FocusChatDocument;
    provider?: ChatProvider;
  }) => Promise<{ success: boolean; error?: string }>,
  newSession: chatInvoke.newSession as (payload: { projectId: string }) => Promise<{ success: boolean }>,
  cancel: chatInvoke.cancel as (payload: { projectId: string; chatSessionId: string }) => Promise<{ success: boolean; error?: string }>,
  cancelQueued: chatInvoke.cancelQueued as (payload: { projectId: string; chatSessionId: string; clientMessageId?: string }) => Promise<{ success: boolean; error?: string }>,
  getUsage: (projectId: string): Promise<{ totalTokens: number; inputTokens: number; outputTokens: number }> =>
    invokeOrThrow<
      { usage: { totalTokens: number; inputTokens: number; outputTokens: number } },
      { totalTokens: number; inputTokens: number; outputTokens: number }
    >(IPC_CHANNELS.chat.getUsage, { projectId }, ({ usage }) => usage),
  getMessages: (projectId: string): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> =>
    invokeFlat<{ messages: ChatMessage[] }>(IPC_CHANNELS.chat.getMessages, { projectId }).then((result) =>
      result.success ? { success: true, messages: result.messages } : result
    ),
  getSlashCommands: chatInvoke.getSlashCommands as () => Promise<{ success: boolean; commands?: SlashCommandInfo[]; error?: string }>,
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
  connectSession: chatInvoke.connectSession as (payload: { projectId: string }) => Promise<{ success: boolean; sessionId?: string; error?: string }>,

  /** Disconnect streaming session for a project (all sessions) */
  disconnectSession: chatInvoke.disconnectSession as (payload: { projectId: string }) => Promise<{ success: boolean; error?: string }>,

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
  disconnectSpecificSession: chatInvoke.disconnectSpecificSession as (payload: { projectId: string; chatSessionId: string }) => Promise<{ success: boolean; error?: string }>,

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
  delete: projectInvoke.delete as (payload: { projectId: string }) => Promise<{ success: boolean }>,
  openFolder: projectInvoke.openFolder as (payload: { projectId: string }) => Promise<{ success: boolean; error?: string }>,
};

const repoInvoke = deriveDomainApi(repoEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const repos = {
  add: (payload: { projectId: string; path: string }): Promise<Repo> =>
    invokeOrThrow<{ repo: Repo }, Repo>(IPC_CHANNELS.repo.add, payload, ({ repo }) => repo),
  remove: repoInvoke.remove as (payload: { repoId: string }) => Promise<{ success: boolean }>,
  list: (payload: { projectId: string }): Promise<Repo[]> =>
    invokeOrThrow<{ repos: Repo[] }, Repo[]>(IPC_CHANNELS.repo.list, payload, ({ repos }) => repos),
  selectDialog: (): Promise<string[]> =>
    invokeOrThrow<{ paths: string[] }, string[]>(IPC_CHANNELS.repo.selectDialog, undefined, ({ paths }) => paths),
  getBranch: (payload: { path: string }): Promise<string | null> =>
    invokeOrThrow<{ branch: string | null }, string | null>(IPC_CHANNELS.repo.getBranch, payload, ({ branch }) => branch),
  getBranches: (payload: { paths: string[] }): Promise<Record<string, string | null>> =>
    invokeOrThrow<{ branches: Record<string, string | null> }, Record<string, string | null>>(IPC_CHANNELS.repo.getBranches, payload, ({ branches }) => branches),
  watch: repoInvoke.watch as (payload: { repoId: string; path: string }) => Promise<{ success: boolean }>,
  unwatch: repoInvoke.unwatch as (payload: { path: string }) => Promise<{ success: boolean }>,
  updateEnvironmentMode: repoInvoke.updateEnvironmentMode as (
    payload: { repoId: string; mode: RepoEnvironmentMode }
  ) => Promise<{ success: boolean; error?: string }>,
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
  setActiveWorktreePath: repoInvoke.setActiveWorktreePath as (
    payload: { repoId: string; worktreePath: string | null }
  ) => Promise<{ success: boolean; error?: string }>,
  showInFolder: repoInvoke.showInFolder as (payload: { repoId: string }) => Promise<{ success: boolean; error?: string }>,
  openEditor: repoInvoke.openEditor as (payload: { repoId: string }) => Promise<{ success: boolean; error?: string }>,
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
  add: attachmentInvoke.add as (payload: { projectId: string; path: string; filename: string }) => Promise<Attachment>,
  remove: attachmentInvoke.remove as (payload: { attachmentId: string }) => Promise<{ success: boolean }>,
  list: attachmentInvoke.list as (payload: { projectId: string }) => Promise<Attachment[]>,
  selectDialog: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.attachment.selectDialog),
  pickForChat: (): Promise<{
    picked: PickedChatAttachment[];
    errors: { filename: string; error: string }[];
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.attachment.pickForChat),
  saveDropped: attachmentInvoke.saveDropped as (payload: { data: Uint8Array; filename: string; mimeType?: string }) => Promise<
    | { success: true; path: string; filename: string; kind: 'image' | 'pdf' | 'text'; mediaType: string }
    | { success: false; error: string }
  >,
  readAsDataUrl: attachmentInvoke.readAsDataUrl as (
    payload: { filePath: string; mediaType: string },
  ) => Promise<{ success: true; dataUrl: string } | { success: false; error: string }>,
  openTemp: attachmentInvoke.openTemp as (payload: { filePath: string }) => Promise<{ success: boolean; error?: string }>,
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
  list: groupInvoke.list as (payload: { projectId: string }) => Promise<Group[]>,
  get: groupInvoke.get as (payload: { id: string }) => Promise<Group | undefined>,
  create: groupInvoke.create as (payload: {
    projectId: string;
    name: string;
    color?: string;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }) => Promise<Group>,
  update: groupInvoke.update as (payload: {
    id: string;
    updates: Partial<Pick<Group, 'name' | 'color' | 'position_x' | 'position_y' | 'width' | 'height' | 'is_collapsed'>>;
  }) => Promise<{ success: boolean; error?: string }>,
  delete: groupInvoke.delete as (payload: { id: string }) => Promise<{ success: boolean; error?: string }>,
  updatePosition: groupInvoke.updatePosition as (
    payload: { id: string; x: number; y: number }
  ) => Promise<{ success: boolean; error?: string }>,
  updateSize: groupInvoke.updateSize as (
    payload: { id: string; width: number; height: number }
  ) => Promise<{ success: boolean; error?: string }>,
  assignItem: groupInvoke.assignItem as (
    payload: { itemId: string; groupId: string | null }
  ) => Promise<{ success: boolean; error?: string }>,
};

const trackerInvoke = deriveDomainApi(trackerEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const exportInvoke = deriveDomainApi(exportEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const tracker = {
  credentials: {
    list: trackerInvoke['credentials.get'] as () => Promise<TrackerCredentialInfo[]>,
    saveJira: trackerInvoke['credentials.saveJira'] as (payload: { siteUrl: string; email: string; apiToken: string }) => Promise<{ success: boolean; error?: string }>,
    saveLinear: trackerInvoke['credentials.saveLinear'] as (payload: { apiToken: string }) => Promise<{ success: boolean; error?: string }>,
    delete: trackerInvoke['credentials.delete'] as () => Promise<{ success: boolean }>,
    deleteLinear: trackerInvoke['credentials.deleteLinear'] as () => Promise<{ success: true }>,
    testJira: trackerInvoke['credentials.testJira'] as (payload: { siteUrl: string; email: string; apiToken: string }) => Promise<{ success: boolean; error?: string }>,
    testLinear: trackerInvoke['credentials.testLinear'] as (payload: { apiToken: string }) => Promise<{ success: boolean; error?: string }>,
  },
  connections: {
    list: trackerInvoke['connections.get'] as () => Promise<TrackerConnection[]>,
  },
  scopes: {
    list: trackerInvoke['scopes.get'] as (payload: { connectionId: string }) => Promise<TrackerProjectScope[]>,
    add: trackerInvoke['scopes.add'] as (payload: { connectionId: string; projectKey: string; projectName?: string }) => Promise<{ success: boolean; scope?: TrackerProjectScope; error?: string }>,
  },
  associations: {
    list: trackerInvoke['associations.get'] as (payload: { projectId: string }) => Promise<TrackerAssociationWithScope[]>,
    add: trackerInvoke['associations.add'] as (payload: {
      trackerType: TrackerType;
      projectId: string;
      siteUrl: string;
      projectKey: string;
      projectName: string | undefined;
      jqlFilter: string;
      displayName?: string;
    }) => Promise<{ success: boolean; association?: TrackerAssociationWithScope; error?: string }>,
    remove: trackerInvoke['associations.remove'] as (payload: { associationId: string }) => Promise<{ success: boolean }>,
    hasImported: trackerInvoke['associations.hasImported'] as (payload: { associationId: string }) => Promise<boolean>,
    updateStatusMapping: trackerInvoke['associations.updateStatusMapping'] as (payload: { associationId: string; statusMapping: StatusMapping | null }) => Promise<{ success: boolean; error?: string }>,
    updateCustomFieldValues: trackerInvoke['associations.updateCustomFieldValues'] as (payload: { associationId: string; customFieldValues: CustomFieldValues | null }) => Promise<{ success: boolean; error?: string }>,
    updateEpicKey: trackerInvoke['associations.updateEpicKey'] as (payload: { associationId: string; epicKey: string | null }) => Promise<{ success: boolean; error?: string }>,
  },
  customFields: {
    getAvailable: trackerInvoke['customFields.get'] as (payload: { projectKey: string; issueTypeId: string }) => Promise<{ success: boolean; fields?: JiraCustomField[]; error?: string }>,
  },
  projects: {
    list: trackerInvoke['projects.listJira'] as () => Promise<{ success: boolean; projects?: { key: string; name: string }[]; error?: string }>,
    listLinearTeams: trackerInvoke['projects.listLinearTeams'] as () => Promise<{ success: boolean; teams?: { key: string; name: string }[]; error?: string }>,
    listLinearProjects: trackerInvoke['projects.listLinearProjects'] as (payload: { teamKey: string }) => Promise<{ success: boolean; projects?: { id: string; name: string }[]; error?: string }>,
    getLabels: trackerInvoke['project.labels'] as (payload: { projectKey: string }) => Promise<{ success: boolean; labels?: string[]; error?: string }>,
    getComponents: trackerInvoke['project.components'] as (payload: { projectKey: string }) => Promise<{ success: boolean; components?: { id: string; name: string }[]; error?: string }>,
    getStatuses: trackerInvoke['project.statuses'] as (payload: { projectKey: string; trackerType?: TrackerType }) => Promise<{ success: boolean; statuses?: { id: string; name: string; categoryKey: string }[]; error?: string }>,
  },
  issues: {
    search: trackerInvoke['issues.search'] as (payload: { projectKey: string; searchText: string }) => Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }>,
    searchByJql: trackerInvoke['issues.searchJql'] as (payload: { projectKey: string; jql: string }) => Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }>,
    getRecent: trackerInvoke['issues.recent'] as (payload: { projectKey: string }) => Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }>,
  },
  import: {
    getPreview: trackerInvoke['import.preview'] as (payload: { projectId: string; associationId: string }) => Promise<{ success: boolean; preview?: ImportPreview; error?: string }>,
    apply: trackerInvoke['import.apply'] as (payload: { projectId: string; associationId: string; selectedTypes: string[] }) => Promise<{ success: boolean; result?: ImportResult; error?: string }>,
    importAll: trackerInvoke['import.all'] as (payload: { projectId: string; associationId: string }) => Promise<{ success: boolean; result?: ImportResult; error?: string }>,
    onProgress: (callback: (data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => callback(data);
      ipcRenderer.on('tracker:import:progress', handler);
      return () => ipcRenderer.removeListener('tracker:import:progress', handler);
    },
  },
  sync: {
    getPreview: trackerInvoke['sync.preview'] as (payload: { projectId: string; associationId: string }) => Promise<{ success: boolean; preview?: SyncPreview; error?: string }>,
    applyChanges: trackerInvoke['sync.apply'] as (payload: {
      projectId: string;
      preview: SyncPreview;
      resolutions: Record<string, ConflictResolution>;
      deletedAction: DeletedItemAction;
      deletedDecisions?: Record<string, 'keep' | 'delete'>;
    }) => Promise<{ success: boolean; result?: SyncResult; error?: string }>,
    onProgress: (callback: (data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => callback(data);
      ipcRenderer.on('tracker:sync:progress', handler);
      return () => ipcRenderer.removeListener('tracker:sync:progress', handler);
    },
  },
  exportQueue: {
    get: exportInvoke['queue.get'] as (payload: { projectId: string }) => Promise<{ success: boolean; entries?: SyncQueueEntryWithPlanItem[]; error?: string }>,
    add: exportInvoke['queue.add'] as (payload: { projectId: string; itemIds: string[]; associationId?: string }) => Promise<{ success: boolean; added?: number; skipped?: number; error?: string }>,
    remove: exportInvoke['queue.remove'] as (payload: { queueEntryId: string }) => Promise<{ success: boolean; error?: string }>,
    updateStatus: exportInvoke['queue.updateStatus'] as (payload: { queueEntryId: string; statusCategory: StatusCategory | null }) => Promise<{ success: boolean; error?: string }>,
    updateCustomFieldOverrides: exportInvoke['queue.updateCustomFields'] as (payload: { queueEntryId: string; customFieldOverrides: CustomFieldValues | null }) => Promise<{ success: boolean; error?: string }>,
    clear: exportInvoke['queue.clear'] as (payload: { projectId: string }) => Promise<{ success: boolean; error?: string }>,
    count: exportInvoke['queue.count'] as (payload: { projectId: string }) => Promise<{ success: boolean; count?: number; error?: string }>,
  },
  export: {
    getPreview: exportInvoke.preview as (payload: { projectId: string; associationId: string }) => Promise<{ success: boolean; preview?: ExportPreview; error?: string }>,
    getReview: exportInvoke.review as (payload: { projectId: string; associationId: string }) => Promise<{ success: boolean; reviewData?: SyncReviewData; error?: string }>,
    executeApproved: exportInvoke.executeApproved as (payload: { projectId: string; associationId: string; approvedItemIds: string[] }) => Promise<{ success: boolean; result?: ExportResult; error?: string }>,
  },
  typeMappings: {
    get: exportInvoke['mappings.get'] as (payload: { projectId: string }) => Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }>,
    getByScope: exportInvoke['mappings.getByScope'] as (payload: { projectId: string; scopeId: string }) => Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }>,
    save: exportInvoke['mappings.save'] as (payload: {
      projectId: string;
      scopeId: string;
      kpmLabel: string;
      trackerIssueTypeId: string;
      trackerIssueTypeName: string;
    }) => Promise<{ success: boolean; mapping?: TrackerTypeMapping; error?: string }>,
    remove: exportInvoke['mappings.remove'] as (payload: { mappingId: string }) => Promise<{ success: boolean; error?: string }>,
    createDefaults: exportInvoke['mappings.createDefaults'] as (payload: { projectId: string; scopeId: string }) => Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }>,
  },
  issueTypes: {
    get: exportInvoke['issueTypes.get'] as (payload: { projectKey: string }) => Promise<{ success: boolean; issueTypes?: { id: string; name: string; subtask: boolean; description?: string; iconUrl?: string }[]; error?: string }>,
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
  updateUrl: storybookInvoke.updateUrl as (payload: { projectId: string; storybookUrl: string | null }) => Promise<{ success: boolean; error?: string }>,
  testConnection: storybookInvoke.testConnection as (payload: { url: string }) => Promise<{ success: boolean; componentCount?: number; error?: string }>,
};

const settingsInvoke = deriveDomainApi(settingsEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const settings = {
  anthropic: {
    hasKey: settingsInvoke['anthropic.hasKey'] as () => Promise<{ success: boolean; hasKey?: boolean; error?: string }>,
    saveKey: settingsInvoke['anthropic.saveKey'] as (payload: { apiKey: string }) => Promise<{ success: boolean; error?: string }>,
    deleteKey: settingsInvoke['anthropic.deleteKey'] as () => Promise<{ success: boolean; error?: string }>,
    testKey: settingsInvoke['anthropic.testKey'] as (payload: { apiKey: string }) => Promise<{ success: boolean; valid?: boolean; error?: string }>,
  },
  app: {
    get: settingsInvoke['app.get'] as (payload: { key: string }) => Promise<{ success: boolean; value?: string; error?: string }>,
    set: settingsInvoke['app.set'] as (payload: { key: string; value: string }) => Promise<{ success: boolean; error?: string }>,
    getAll: settingsInvoke['app.getAll'] as () => Promise<{ success: boolean; settings?: Record<string, string>; error?: string }>,
  },
  claude: {
    getAvailability: settingsInvoke['claude.getAvailability'] as () => Promise<ClaudeAvailabilityResponse>,
    refreshAvailability: settingsInvoke['claude.refreshAvailability'] as () => Promise<ClaudeAvailabilityResponse>,
  },
};

type ClaudeAvailabilityResponse =
  | ({ success: true } & ClaudeAvailability)
  | { success: false; error: string };

const customThemeInvoke = deriveDomainApi(customThemeEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const customThemes = {
  list: (): Promise<{ success: boolean; themes?: CustomTheme[]; error?: string }> =>
    customThemeInvoke.list(undefined) as Promise<{ success: boolean; themes?: CustomTheme[]; error?: string }>,
  importFromUrl: (url: string): Promise<{ success: boolean; theme?: CustomTheme; warnings?: string[]; error?: string }> =>
    customThemeInvoke.importFromUrl({ url }) as Promise<{ success: boolean; theme?: CustomTheme; warnings?: string[]; error?: string }>,
  delete: (themeId: string): Promise<{ success: boolean; error?: string }> =>
    customThemeInvoke.delete({ themeId }) as Promise<{ success: boolean; error?: string }>,
};

const permissionInvoke = deriveDomainApi(permissionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const permission = {
  respond: permissionInvoke.respond as (payload: { requestId: string; projectId: string; action: PermissionAction }) => Promise<{ success: boolean; error?: string }>,
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
  revoke: permissionInvoke.revoke as (payload: { id: string; projectId: string; cacheKey: string }) => Promise<{ success: boolean }>,
  revokeAll: permissionInvoke.revokeAll as (payload: { projectId: string }) => Promise<{ success: boolean }>,
};

const artifactInvoke = deriveDomainApi(artifactEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const artifacts = {
  list: artifactInvoke.list as (payload: { projectId: string }) => Promise<{ success: boolean; artifacts?: { filename: string; path: string; createdAt: string; modifiedAt: string; size: number }[]; error?: string }>,
  read: artifactInvoke.read as (payload: { projectId: string; filename: string }) => Promise<{ success: boolean; content?: string; error?: string }>,
  delete: artifactInvoke.delete as (payload: { projectId: string; filename: string }) => Promise<{ success: boolean; error?: string }>,
  import: artifactInvoke.import as (payload: { projectId: string; sourcePath: string }) => Promise<{ success: boolean; filename?: string; error?: string }>,
  selectDialog: (): Promise<string[]> =>
    invokeOrThrow<{ paths: string[] }, string[]>(IPC_CHANNELS.artifact.selectDialog, undefined, ({ paths }) => paths),
};

const taskPromptTemplateInvoke = deriveDomainApi(taskPromptTemplateEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const taskPromptTemplates = {
  list: (projectId?: string | null): Promise<{ success: boolean; templates?: TaskPromptTemplate[]; error?: string }> =>
    taskPromptTemplateInvoke.list({ projectId }) as Promise<{ success: boolean; templates?: TaskPromptTemplate[]; error?: string }>,
  get: (templateId: string): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    taskPromptTemplateInvoke.get({ templateId }) as Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>,
  getEffective: (projectId: string): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    taskPromptTemplateInvoke.getEffective({ projectId }) as Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>,
  getBuiltinDefault: (): Promise<{ success: boolean; promptContent?: string; error?: string }> =>
    taskPromptTemplateInvoke.getBuiltinDefault({}) as Promise<{ success: boolean; promptContent?: string; error?: string }>,
  create: (
    projectId: string | null,
    name: string,
    promptContent: string
  ): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    taskPromptTemplateInvoke.create({ projectId, name, promptContent }) as Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>,
  update: (
    templateId: string,
    updates: { name?: string; promptContent?: string }
  ): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    taskPromptTemplateInvoke.update({ templateId, ...updates }) as Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>,
  delete: (templateId: string): Promise<{ success: boolean; error?: string }> =>
    taskPromptTemplateInvoke.delete({ templateId }) as Promise<{ success: boolean; error?: string }>,
  setDefault: (templateId: string): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    taskPromptTemplateInvoke.setDefault({ templateId }) as Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>,
  ensureDefault: (): Promise<{ success: boolean; error?: string }> =>
    taskPromptTemplateInvoke.ensureDefault(undefined) as Promise<{ success: boolean; error?: string }>,
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
  checkAuth: githubInvoke.checkAuth as (payload: { sessionId: string }) => Promise<{ success: boolean; authenticated?: boolean; account?: string; error?: string }>,
  createPr: githubInvoke.createPr as (payload: { sessionId: string; title: string; body: string; draft?: boolean }) => Promise<{ success: boolean; number?: number; url?: string; error?: string }>,
  getPrStatus: githubInvoke.getPrStatus as (payload: { sessionId: string }) => Promise<{ success: boolean; status?: PrStatus | null; error?: string }>,
  getPrComments: githubInvoke.getPrComments as (payload: { sessionId: string }) => Promise<{ success: boolean; comments?: PrComment[]; error?: string }>,
  buildPrContext: githubInvoke.buildPrContext as (payload: { sessionId: string }) => Promise<{ success: boolean; suggestedTitle?: string; body?: string; branch?: string | null; baseBranch?: string; hasCommits?: boolean; prTemplate?: string | null; error?: string }>,
  generatePrContent: githubInvoke.generatePrContent as (payload: { sessionId: string; rawTitle: string; rawBody: string; prTemplate: string | null; diff: string; commitLog: string; featureContextPath?: string | null }) => Promise<{ success: boolean; title?: string; body?: string; error?: string }>,
  buildAddressCommentsContext: githubInvoke.buildAddressCommentsContext as (payload: { sessionId: string }) => Promise<{ success: boolean; context?: string; error?: string }>,
  detectAndLinkPr: githubInvoke.detectAndLinkPr as (payload: { sessionId: string }) => Promise<{ success: boolean; status?: PrStatus | null; error?: string }>,
  linkPr: githubInvoke.linkPr as (payload: { sessionId: string; prIdentifier: string }) => Promise<{ success: boolean; number?: number; url?: string; state?: string; error?: string }>,
  linkPrToItem: githubInvoke.linkPrToItem as (payload: { planItemId: string; repoId: string; prIdentifier: string }) => Promise<{ success: boolean; number?: number; url?: string; state?: string; error?: string }>,
};

const reviewInvoke = deriveDomainApi(reviewEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const review = {
  getInbox: reviewInvoke.getInbox as (payload: { sessionId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  refreshSession: reviewInvoke.refreshSession as (payload: { sessionId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  assignOwnership: reviewInvoke.assignOwnership as (payload: { sessionId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  assessThreads: reviewInvoke.assessThreads as (payload: { sessionId: string; taskIds?: string[]; reassessAll?: boolean }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; results?: { threadId: string; disposition: string; rationale: string; draftReply: string | null }[]; errors?: string[]; error?: string }>,
  draftPostImplReplies: reviewInvoke.draftPostImplReplies as (payload: { sessionId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  triggerAutomation: reviewInvoke.triggerAutomation as (
    payload: { sessionId: string; taskIds?: string[] }
  ) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; taskIds?: string[]; context?: string; error?: string }>,
  replyToThread: reviewInvoke.replyToThread as (
    payload: { sessionId: string; threadId: string; body: string; resolve?: boolean }
  ) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; replyId?: string; resolved?: boolean; error?: string }>,
  resolveThread: reviewInvoke.resolveThread as (payload: { sessionId: string; threadId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  unresolveThread: reviewInvoke.unresolveThread as (payload: { sessionId: string; threadId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  ignoreTask: reviewInvoke.ignoreTask as (payload: { taskId: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  overrideDisposition: reviewInvoke.overrideDisposition as (payload: { taskId: string; disposition: string }) => Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }>,
  pollNow: (): Promise<{ success: boolean; processed?: number; fixesStarted?: number; assessmentsRun?: number; needsAttention?: number; errors?: number; timestamp?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.pollNow, undefined),
  pollSession: reviewInvoke.pollSession as (payload: { sessionId: string }) => Promise<{ success: boolean; sessionId?: string; action?: string; newThreadCount?: number; implementCount?: number; error?: string }>,
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
  getByProject: worktreeInvoke.getByProject as (payload: { projectId: string }) => Promise<Worktree[]>,
  getByPlanItem: worktreeInvoke.getByPlanItem as (payload: { planItemId: string }) => Promise<Worktree | undefined>,
  openEditor: worktreeInvoke.openEditor as (payload: { worktreeId: string }) => Promise<{ success: boolean; error?: string }>,
  getStatus: worktreeInvoke.getStatus as (payload: { worktreeId: string }) => Promise<WorktreeStatus>,
  delete: ((payload: { worktreeId: string; force?: boolean }) =>
    worktreeInvoke.delete({ worktreeId: payload.worktreeId, force: payload.force ?? false })) as (
    payload: { worktreeId: string; force?: boolean }
  ) => Promise<{ success: boolean; error?: string }>,
  push: worktreeInvoke.push as (payload: { worktreeId: string }) => Promise<{ success: boolean; error?: string }>,
  destroy: worktreeInvoke.destroy as (payload: { worktreeId: string }) => Promise<{ success: boolean; error?: string }>,
};

const devSessionInvoke = deriveDomainApi(devSessionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const devSessions = {
  getByProject: devSessionInvoke.getByProject as (payload: { projectId: string }) => Promise<{ success: boolean; sessions?: DevSession[]; error?: string }>,

  getByProjectWithPlanItems: devSessionInvoke.getByProjectWithPlanItems as (payload: { projectId: string }) => Promise<{ success: boolean; sessions?: DevSessionWithPlanItem[]; error?: string }>,

  getActive: devSessionInvoke.getActive as (payload: { projectId: string }) => Promise<{ success: boolean; sessions?: DevSession[]; error?: string }>,

  get: devSessionInvoke.get as (payload: { sessionId: string }) => Promise<{ success: boolean; session?: DevSession; error?: string }>,

  hasActive: devSessionInvoke.hasActive as (payload: { planItemId: string }) => Promise<{ success: boolean; hasActive?: boolean; error?: string }>,

  openEditor: devSessionInvoke.openEditor as (payload: { sessionId: string }) => Promise<{ success: boolean; error?: string }>,

  updateStatus: devSessionInvoke.updateStatus as (payload: { sessionId: string; status: string }) => Promise<{ success: boolean; error?: string }>,

  delete: devSessionInvoke.delete as (payload: { sessionId: string; cleanupWorktree?: boolean }) => Promise<{ success: boolean; error?: string }>,

  destroy: devSessionInvoke.destroy as (payload: { sessionId: string }) => Promise<{ success: boolean; error?: string }>,

  checkDirty: devSessionInvoke.checkDirty as (payload: { sessionId: string }) => Promise<{ success: boolean; isDirty?: boolean; files?: string[]; error?: string }>,

  getDiff: devSessionInvoke.getDiff as (payload: { sessionId: string }) => Promise<{ success: boolean; diff?: string; error?: string }>,

  getCommitsAhead: devSessionInvoke.getCommitsAhead as (payload: { sessionId: string }) => Promise<{ success: boolean; count?: number; error?: string }>,

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

  updateName: devSessionInvoke.updateName as (payload: { sessionId: string; name: string }) => Promise<{ success: boolean; error?: string }>,

  getMergeOrder: devSessionInvoke.getMergeOrder as (payload: { projectId: string }) => Promise<{ success: boolean; mergeOrder?: Record<string, { layer: number | null; blockedBy: string[] }>; error?: string }>,

  updateMergeOrder: devSessionInvoke.updateMergeOrder as (payload: { sessionId: string; order: number | null }) => Promise<{ success: boolean; error?: string }>,
};

// =============================================================================
// Agent Sessions (Board-Driven Execution)
// =============================================================================

const agentSessionInvoke = deriveDomainApi(agentSessionEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const agentSessions = {
  // Create pending session + start agent in one call (primary entry point from board UI)
  createAndStart: agentSessionInvoke.createAndStart as (payload: {
    planItemId: string;
    repoId: string;
    prompt: string;
    agentType?: AgentType;
    baseBranch?: string;
    contextPaths?: string[];
    effort?: AgentEffortLevel;
    environmentMode?: RepoEnvironmentMode;
    executionMode?: AgentExecutionMode;
    reviewPolicy?: AgentReviewPolicy;
  }) => Promise<{ success: boolean; session?: DevSession; error?: string }>,

  // Start an agent session for an existing pending/inactive dev session
  startAgent: agentSessionInvoke.startAgent as (payload: { devSessionId: string; agentType?: AgentType; role?: AgentSessionRole }) => Promise<{ success: boolean; session?: DevSession; error?: string }>,

  respond: agentSessionInvoke.respond as (payload: { devSessionId: string; text: string }) => Promise<{ success: boolean; error?: string }>,

  followUp: agentSessionInvoke.followUp as (payload: { devSessionId: string; text: string }) => Promise<{ success: boolean; error?: string }>,

  stop: agentSessionInvoke.stop as (payload: { devSessionId: string }) => Promise<{ success: boolean; error?: string }>,

  getActivities: agentSessionInvoke.getActivities as (payload: { devSessionId: string }) => Promise<{ success: boolean; activities?: AgentActivity[]; error?: string }>,

  getState: agentSessionInvoke.getState as (payload: { devSessionId: string }) => Promise<{ success: boolean; state?: AgentSessionState | null; error?: string }>,

  getAvailableAgents: agentSessionInvoke.getAvailableAgents as () => Promise<{ success: boolean; agents?: AgentType[]; error?: string }>,

  // Launch opposing-agent auto-review for a completed session
  launchReview: agentSessionInvoke.launchReview as (payload: { devSessionId: string }) => Promise<{ success: boolean; reviewSessionId?: string | null; error?: string }>,

  // Generate a commit message for the session's changes using the configured instructions
  generateCommitMessage: agentSessionInvoke.generateCommitMessage as (
    payload: { devSessionId: string; taskTitle: string; externalKey?: string }
  ) => Promise<{ success: boolean; message?: string; error?: string }>,

  // Commit uncommitted changes in the session's worktree
  commit: agentSessionInvoke.commit as (
    payload: { devSessionId: string; message: string; repairOnFailure?: boolean }
  ) => Promise<{ success: boolean; sha?: string; error?: string; repairStarted?: boolean }>,

  // Get structured commit log (commits ahead of base branch)
  getCommitLog: agentSessionInvoke.getCommitLog as (
    payload: { devSessionId: string }
  ) => Promise<{ success: boolean; commits?: { sha: string; subject: string; authorName: string; date: string }[]; error?: string }>,

  // Get file stats for a single commit
  getCommitFiles: agentSessionInvoke.getCommitFiles as (
    payload: { devSessionId: string; sha: string }
  ) => Promise<{ success: boolean; files?: { path: string; additions: number; deletions: number }[]; error?: string }>,

  // Dismiss an "Automation interrupted" banner (clears needs_attention -> idle)
  dismissInterruption: agentSessionInvoke.dismissInterruption as (payload: { devSessionId: string }) => Promise<{ success: boolean; error?: string }>,

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
  listDirectory: fileExplorerInvoke.listDirectory as (
    payload: { projectId: string; path?: string; recursive?: boolean; depth?: number }
  ) => Promise<FileNode[]>,

  // Create a new folder
  createFolder: fileExplorerInvoke.createFolder as (payload: { projectId: string; path: string }) => Promise<FileNode>,

  // Create a new file
  createFile: fileExplorerInvoke.createFile as (payload: { projectId: string; path: string; content?: string }) => Promise<FileNode>,

  // Copy an external file into the project
  copyExternalFile: fileExplorerInvoke.copyExternalFile as (
    payload: { projectId: string; sourcePath: string; path: string }
  ) => Promise<FileNode>,

  // Create a new binary file (images, PDFs, etc.)
  createBinaryFile: fileExplorerInvoke.createBinaryFile as (
    payload: { projectId: string; path: string; data: Uint8Array }
  ) => Promise<FileNode>,

  // Create a symlink to external path
  createSymlink: fileExplorerInvoke.createSymlink as (
    payload: { projectId: string; targetPath: string; linkPath: string }
  ) => Promise<FileNode>,

  // Delete a file or folder
  delete: fileExplorerInvoke.delete as (payload: { projectId: string; path: string }) => Promise<{ success: boolean; error?: string }>,

  // Rename/move a file or folder
  rename: fileExplorerInvoke.rename as (payload: { projectId: string; oldPath: string; newPath: string }) => Promise<FileNode>,

  // Get info about a single file/folder
  getInfo: fileExplorerInvoke.getInfo as (payload: { projectId: string; path: string }) => Promise<FileNode>,

  // Read file content
  readFile: fileExplorerInvoke.readFile as (payload: { projectId: string; path: string }) => Promise<string>,

  // Read binary file content (images, etc.)
  readBinaryFile: fileExplorerInvoke.readBinaryFile as (payload: { projectId: string; path: string }) => Promise<Uint8Array>,

  // Write file content
  writeFile: fileExplorerInvoke.writeFile as (
    payload: { projectId: string; path: string; content: string }
  ) => Promise<{ success: boolean; error?: string }>,

  // Get symlink information
  getSymlinkInfo: fileExplorerInvoke.getSymlinkInfo as (
    payload: { projectId: string; path: string }
  ) => Promise<{ isSymlink: boolean; target?: string; isBroken?: boolean }>,

  // Show a project file/folder in Finder/Explorer
  showItemInFolder: fileExplorerInvoke.showItemInFolder as (
    payload: { projectId: string; path: string }
  ) => Promise<{ success: boolean; error?: string }>,

  // Open a project file/folder in the user's code editor
  openInEditor: fileExplorerInvoke.openInEditor as (
    payload: { projectId: string; path: string }
  ) => Promise<{ success: boolean; error?: string }>,

  // Show folder selection dialog for linking external folders
  selectFolderDialog: fileExplorerInvoke.selectFolderDialog as (payload: { title?: string }) => Promise<string | null>,

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
  watchProject: fileExplorerInvoke.watchProject as (payload: { projectId: string }) => Promise<{ success: boolean; error?: string }>,

  // Stop watching project folder
  unwatchProject: fileExplorerInvoke.unwatchProject as (payload: Record<string, never>) => Promise<{ success: boolean }>,
};

const repoFilesInvoke = deriveDomainApi(repoFilesEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

// Repo Files API (Workspace file browser for connected repos)
const repoFiles = {
  // List directory contents within a repo
  listDirectory: repoFilesInvoke.listDirectory as (
    payload: { repoId: string; path?: string; recursive?: boolean; depth?: number }
  ) => Promise<FileNode[]>,

  // Read file content from a repo
  readFile: repoFilesInvoke.readFile as (payload: { repoId: string; path: string }) => Promise<string>,

  // Write file content to a repo (markdown/text files only)
  writeFile: repoFilesInvoke.writeFile as (
    payload: { repoId: string; path: string; content: string }
  ) => Promise<{ success: boolean; error?: string }>,

  // Get info about a single file/folder
  getInfo: repoFilesInvoke.getInfo as (payload: { repoId: string; path: string }) => Promise<FileNode>,

  // Show a repo file/folder in Finder/Explorer
  showItemInFolder: repoFilesInvoke.showItemInFolder as (
    payload: { repoId: string; path: string }
  ) => Promise<{ success: boolean; error?: string }>,
};

// Shell API (for OS-level operations)
const shellInvoke = deriveDomainApi(shellEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const shell = {
  // Open URL in default browser
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    shellInvoke.openExternal({ url }) as Promise<{ success: boolean; error?: string }>,
};

// Terminal API (embedded developer terminal panel)
const terminalInvoke = deriveDomainApi(terminalEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const terminal = {
  create: terminalInvoke.create as (payload: { id: string; cwd?: string; cols: number; rows: number }) => Promise<{ success: boolean; error?: string }>,
  write: terminalInvoke.write as (payload: { id: string; data: string }) => Promise<{ success: boolean; error?: string }>,
  resize: terminalInvoke.resize as (payload: { id: string; cols: number; rows: number }) => Promise<{ success: boolean; error?: string }>,
  kill: terminalInvoke.kill as (payload: { id: string }) => Promise<{ success: boolean; error?: string }>,
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
  log: (event: { name: string; durationMs?: number; meta?: Record<string, unknown> }): Promise<{ success: boolean; error?: string }> =>
    perfInvoke.log(event) as Promise<{ success: boolean; error?: string }>,
  getLogInfo: (): Promise<{ success: boolean; enabled?: boolean; logPath?: string; sessionId?: string; error?: string }> =>
    perfInvoke.getLogInfo(undefined) as Promise<{ success: boolean; enabled?: boolean; logPath?: string; sessionId?: string; error?: string }>,
};


const confluenceInvoke = deriveDomainApi(confluenceEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));

const confluence = {
  link: confluenceInvoke.link as (payload: {
    projectId: string;
    documentPath: string;
    confluenceUrl: string;
  }) => Promise<{ success: boolean; data?: ConfluencePageLink; error?: string }>,
  unlink: confluenceInvoke.unlink as (payload: { projectId: string; documentPath: string }) => Promise<{ success: boolean; error?: string }>,
  getLinks: confluenceInvoke.getLinks as (payload: { projectId: string }) => Promise<{ success: boolean; data?: ConfluencePageLink[]; error?: string }>,
  getLinkForDocument: confluenceInvoke.getLinkForDocument as (
    payload: { projectId: string; documentPath: string }
  ) => Promise<{ success: boolean; data?: ConfluencePageLink | null; error?: string }>,
  getSyncPreview: confluenceInvoke.syncPreview as (
    payload: { projectId: string; documentPath: string }
  ) => Promise<{ success: boolean; data?: ConfluenceSyncPreview; error?: string }>,
  push: confluenceInvoke.pushExecute as (
    payload: { projectId: string; documentPath: string }
  ) => Promise<{ success: boolean; data?: { pageUrl: string }; error?: string }>,
  pull: confluenceInvoke.pullExecute as (payload: { projectId: string; documentPath: string }) => Promise<{ success: boolean; error?: string }>,
  parseUrl: confluenceInvoke.parseUrl as (
    payload: { url: string }
  ) => Promise<{ success: boolean; data?: { siteUrl: string; spaceKey: string; pageId: string }; error?: string }>,
};

// Tool Call Logging API (DevTools panel)
const toolLogInvoke = deriveDomainApi(toolLogEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const toolLog = {
  getEntries: toolLogInvoke.getEntries as (payload: { chatSessionId: string }) => Promise<{ success: boolean; entries?: ToolCallLogEntry[]; error?: string }>,
  getSessionStats: toolLogInvoke.getSessionStats as (payload: { chatSessionId: string }) => Promise<{ success: boolean; stats?: { totalCalls: number; byCategory: Record<string, number>; topFiles: string[]; duplicateCount: number }; error?: string }>,
  getInfo: toolLogInvoke.getInfo as () => Promise<{ success: boolean; enabled?: boolean; logPath?: string; error?: string }>,
  setEnabled: toolLogInvoke.setEnabled as (payload: { enabled: boolean }) => Promise<{ success: boolean; error?: string }>,
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
  global: searchInvoke.global as (payload: { projectId: string; query: string; limit?: number }) => Promise<SearchResult[]>,
};

// Prompt Overrides API (configurable system prompts)
const promptOverridesInvoke = deriveDomainApi(promptOverridesEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const promptOverrides = {
  list: promptOverridesInvoke.list as (payload: { category?: PromptCategory }) => Promise<{ success: boolean; prompts?: PromptDefinitionInfo[]; error?: string }>,
  get: promptOverridesInvoke.get as (payload: { key: string }) => Promise<{ success: boolean; prompt?: PromptDefinitionInfo & { defaultContent: string; currentContent: string }; error?: string }>,
  set: promptOverridesInvoke.set as (payload: { key: string; content: string }) => Promise<{ success: boolean; error?: string }>,
  reset: promptOverridesInvoke.reset as (payload: { key: string }) => Promise<{ success: boolean; error?: string }>,
};

// Briefing API (project state synthesis)
const briefingInvoke = deriveDomainApi(briefingEndpoints, (channel, payload) => ipcRenderer.invoke(channel, payload));
const briefing = {
  generate: briefingInvoke.generate as (payload: { projectId: string }) => Promise<{ success: boolean; data?: BriefingResult; error?: string }>,
  get: briefingInvoke.get as (payload: { projectId: string }) => Promise<{ success: boolean; data?: BriefingResult | null; error?: string }>,
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
  getProjectStats: usageInvoke.getProjectStats as (payload: { projectId: string }) => Promise<ProjectUsageStats>,
  getGlobalStats: usageInvoke.getGlobalStats as () => Promise<ProjectUsageStats>,
  listEvents: usageInvoke.listEvents as (payload: { projectId: string | null; limit?: number }) => Promise<ClaudeUsageEvent[]>,
  resetProject: usageInvoke.resetProject as (payload: { projectId: string }) => Promise<{ success: boolean }>,
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
  listAvailable: mcpServersInvoke.listAvailable as () => Promise<{
    success: boolean;
    plugins?: DiscoveredPlugin[];
    userServers?: UserMcpServer[];
    managedServers?: DiscoveredMcpServer[];
    error?: string;
  }>,
  getPreferences: mcpServersInvoke.getPreferences as () => Promise<{ success: boolean; preferences?: Record<string, boolean>; error?: string }>,
  setEnabled: mcpServersInvoke.setEnabled as (payload: { serverName: string; enabled: boolean }) => Promise<{ success: boolean; error?: string }>,
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
    get: slackInvoke['availability.get'] as () => Promise<{ available: boolean; source: string | null; serverName: string | null; reason: string | null }>,
  },
  links: {
    list: slackInvoke['links.list'] as (payload: { projectId: string }) => Promise<SlackChannelLink[]>,
    create: slackInvoke['links.create'] as (payload: { projectId: string; channelId: string; channelName: string }) => Promise<SlackChannelLink>,
    delete: slackInvoke['links.delete'] as (payload: { linkId: string }) => Promise<{ success: boolean; error?: string }>,
  },
  triage: {
    trigger: slackInvoke['triage.trigger'] as (payload: { projectId: string; channelLinkId: string }) => Promise<{
      newItems: SlackTriageItem[];
      messagesRead: number;
      messagesProcessed: number;
      messagesFiltered: number;
      filterBreakdown: { bot_message: number; already_triaged: number; structural: number };
    }>,
    getPending: slackInvoke['triage.getPending'] as (payload: { projectId: string }) => Promise<SlackTriageItem[]>,
    getAll: slackInvoke['triage.getAll'] as (payload: { projectId: string }) => Promise<SlackTriageItem[]>,
    countPending: slackInvoke['triage.countPending'] as (payload: { projectId: string }) => Promise<number>,
    approve: slackInvoke['triage.approve'] as (payload: { itemId: string }) => Promise<{ success: boolean; error?: string }>,
    edit: slackInvoke['triage.edit'] as (payload: { itemId: string; suggestedAction: unknown }) => Promise<{ success: boolean; error?: string }>,
    dismiss: slackInvoke['triage.dismiss'] as (payload: { itemId: string }) => Promise<{ success: boolean; error?: string }>,
    restore: slackInvoke['triage.restore'] as (payload: { itemId: string }) => Promise<{ success: boolean; error?: string }>,
    execute: slackInvoke['triage.execute'] as (payload: { itemId: string }) => Promise<{ success: boolean; error?: string }>,
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
