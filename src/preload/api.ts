import { ipcRenderer } from 'electron';
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
  ClaudeModel,
  ChatViewMode,
  FileNode,
  Group,
  ConfluencePageLink,
  ConfluenceSyncPreview,
  CustomPrompt,
  CustomPromptIcon,
  SearchResult,
  PromptDefinitionInfo,
  PromptCategory,
  BriefingResult,
  ToolPermission,
  PrStatus,
  PrComment,
  ReviewInboxSnapshot,
  DiscoveredPlugin,
  UserMcpServer,
  DiscoveredMcpServer,
} from '../shared/types';

type IpcSuccess<T extends object | void> = T extends void ? { success: true } : { success: true } & T;
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
  SearchResult,
  PromptDefinitionInfo,
  PromptCategory,
  BriefingResult,
  ToolPermission,
  ReviewInboxSnapshot,
};

const tempImages = {
  save: (imageData: Uint8Array, format: string): Promise<{ success: true; path: string; filename: string } | { success: false; error: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.tempImage.save, { imageData, format }),
  delete: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.tempImage.delete, { filePath }),
};

const chat = {
  newSession: (projectId: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.chat.newSession, { projectId }),
  getUsage: (projectId: string): Promise<{ totalTokens: number; inputTokens: number; outputTokens: number }> =>
    invokeOrThrow<
      { usage: { totalTokens: number; inputTokens: number; outputTokens: number } },
      { totalTokens: number; inputTokens: number; outputTokens: number }
    >(IPC_CHANNELS.chat.getUsage, { projectId }, ({ usage }) => usage),
  getMessages: (projectId: string): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> =>
    invokeFlat<{ messages: ChatMessage[] }>(IPC_CHANNELS.chat.getMessages, { projectId }).then((result) =>
      result.success ? { success: true, messages: result.messages } : result
    ),
  getSessionHistory: (projectId: string, limit?: number): Promise<{ success: boolean; sessions?: ChatSessionSummary[]; error?: string }> =>
    invokeFlat<{ sessions: ChatSessionSummary[] }>(IPC_CHANNELS.chat.getSessionHistory, { projectId, limit }).then((result) =>
      result.success ? { success: true, sessions: result.sessions } : result
    ),
      IPC_CHANNELS.chat.loadSession,
      { projectId, chatSessionId },
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
    ipcRenderer.on('chat:done', handler);
    return () => ipcRenderer.removeListener('chat:done', handler);
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
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; filePath: string; content: string; oldContent?: string | null }) => callback(data);
    ipcRenderer.on('chat:file-update', handler);
    return () => ipcRenderer.removeListener('chat:file-update', handler);
  },

  // ─── Streaming Session Methods ───

  /** Connect streaming session for a project (called on project open) */
  connectSession: (projectId: string): Promise<{ success: boolean; sessionId?: string; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.chat.connectSession, { projectId }),

  /** Disconnect streaming session for a project (all sessions) */
  disconnectSession: (projectId: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.chat.disconnectSession, { projectId }),

  /** Get all active sessions for a project (multi-session support) */
  getActiveSessions: (projectId: string): Promise<{
    success: boolean;
    error?: string;
    IPC_CHANNELS.chat.getActiveSessions,
    { projectId },
  ).then((result) => (result.success ? { success: true, sessions: result.sessions } : result)),

  /** Disconnect a specific session (multi-session support) */
  disconnectSpecificSession: (projectId: string, chatSessionId: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.chat.disconnectSpecificSession, { projectId, chatSessionId }),

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

  /** Session error event */
  onSessionError: (callback: (data: { projectId: string; chatSessionId?: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; chatSessionId?: string; error: string }) => callback(data);
    ipcRenderer.on('chat:session-error', handler);
    return () => ipcRenderer.removeListener('chat:session-error', handler);
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

};

const projects = {
  get: (projectId: string): Promise<Project | undefined> =>
    invokeOrThrow<{ project: Project | undefined }, Project | undefined>(IPC_CHANNELS.project.get, { projectId }, ({ project }) => project),
  list: (): Promise<Project[]> =>
    invokeOrThrow<{ projects: Project[] }, Project[]>(IPC_CHANNELS.project.list, undefined, ({ projects }) => projects),
  update: (projectId: string, updates: { name?: string; phase?: string }): Promise<Project | undefined> =>
    invokeOrThrow<{ project: Project | undefined }, Project | undefined>(IPC_CHANNELS.project.update, { projectId, updates }, ({ project }) => project),
  delete: (projectId: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.project.delete, { projectId }),
  openFolder: (projectId: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.project.openFolder, { projectId }),
};

const repos = {
  add: (projectId: string, path: string): Promise<Repo> =>
    invokeOrThrow<{ repo: Repo }, Repo>(IPC_CHANNELS.repo.add, { projectId, path }, ({ repo }) => repo),
  remove: (repoId: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.repo.remove, { repoId }),
  list: (projectId: string): Promise<Repo[]> =>
    invokeOrThrow<{ repos: Repo[] }, Repo[]>(IPC_CHANNELS.repo.list, { projectId }, ({ repos }) => repos),
  selectDialog: (): Promise<string[]> =>
    invokeOrThrow<{ paths: string[] }, string[]>(IPC_CHANNELS.repo.selectDialog, undefined, ({ paths }) => paths),
  getBranch: (path: string): Promise<string | null> =>
    invokeOrThrow<{ branch: string | null }, string | null>(IPC_CHANNELS.repo.getBranch, { path }, ({ branch }) => branch),
  getBranches: (paths: string[]): Promise<Record<string, string | null>> =>
    invokeOrThrow<{ branches: Record<string, string | null> }, Record<string, string | null>>(IPC_CHANNELS.repo.getBranches, { paths }, ({ branches }) => branches),
  watch: (repoId: string, path: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.repo.watch, { repoId, path }),
  unwatch: (path: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.repo.unwatch, { path }),
  updateEnvironmentMode: (repoId: string, mode: RepoEnvironmentMode): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.repo.updateEnvironmentMode, { repoId, mode }),
  listDirectories: (repoPath: string, prefix?: string, depth?: number): Promise<string[]> =>
    invokeOrThrow<{ directories: string[] }, string[]>(
      IPC_CHANNELS.repo.listDirectories,
      { repoPath, prefix: prefix ?? '', ...(depth != null && { depth }) },
      ({ directories }) => directories,
    ),
  listAllBranches: (repoPath: string): Promise<string[]> =>
    invokeOrThrow<{ branches: string[] }, string[]>(IPC_CHANNELS.repo.listAllBranches, { repoPath }, ({ branches }) => branches),
  onBranchChanged: (callback: (data: { repoId: string; repoPath: string; branch: string | null }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { repoId: string; repoPath: string; branch: string | null }) => callback(data);
    ipcRenderer.on('repo:branch-changed', handler);
    return () => ipcRenderer.removeListener('repo:branch-changed', handler);
  },
};

const attachments = {
  add: (projectId: string, path: string, filename: string): Promise<Attachment> =>
    ipcRenderer.invoke(IPC_CHANNELS.attachment.add, { projectId, path, filename }),
  remove: (attachmentId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.attachment.remove, { attachmentId }),
  list: (projectId: string): Promise<Attachment[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.attachment.list, { projectId }),
  selectDialog: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.attachment.selectDialog),
};

const plan = {
  listItems: (projectId: string): Promise<PlanItem[]> =>
    invokeOrThrow<{ items: PlanItem[] }, PlanItem[]>(IPC_CHANNELS.plan.listItems, { projectId }, ({ items }) => items),
  executeActions: (projectId: string, actions: PlanAction[]): Promise<PlanActionResult> =>
    invokeOrThrow<{ result: PlanActionResult }, PlanActionResult>(IPC_CHANNELS.plan.executeActions, { projectId, actions }, ({ result }) => result),
  addRelation: (relation: Omit<PlanRelation, 'id'>): Promise<PlanRelation> =>
    invokeOrThrow<{ relation: PlanRelation }, PlanRelation>(IPC_CHANNELS.plan.addRelation, relation, ({ relation: nextRelation }) => nextRelation),
  removeRelation: (relationId: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.plan.removeRelation, { relationId }),
  getRelations: (projectId: string): Promise<PlanRelation[]> =>
    invokeOrThrow<{ relations: PlanRelation[] }, PlanRelation[]>(IPC_CHANNELS.plan.getRelations, { projectId }, ({ relations }) => relations),
  updatePosition: (itemId: string, x: number, y: number): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.plan.updatePosition, { itemId, x, y }),
  updateItem: (itemId: string, updates: PlanItemUpdates): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.plan.updateItem, { itemId, updates }),
  deleteItem: (itemId: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.plan.deleteItem, { itemId }),
  deleteItemWithDescendants: (itemId: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.plan.deleteItemWithDescendants, { itemId }),
  getChildCount: (itemId: string): Promise<number> =>
    invokeOrThrow<{ count: number }, number>(IPC_CHANNELS.plan.getChildCount, { itemId }, ({ count }) => count),
};

// Groups API (Visual containers - Figma-style frames)
const groups = {
  // List all groups for a project
  list: (projectId: string): Promise<Group[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.list, { projectId }),

  // Get a single group by ID
  get: (id: string): Promise<Group | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.get, { id }),

  // Create a new group
  create: (
    projectId: string,
    name: string,
    options?: {
      color?: string;
      position_x?: number;
      position_y?: number;
      width?: number;
      height?: number;
    }
  ): Promise<Group> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.create, { projectId, name, ...options }),

  // Update a group
  update: (
    id: string,
    updates: Partial<Pick<Group, 'name' | 'color' | 'position_x' | 'position_y' | 'width' | 'height'>>
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.update, { id, updates }),

  // Delete a group (items remain, become ungrouped)
  delete: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.delete, { id }),

  // Update group position
  updatePosition: (id: string, x: number, y: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.updatePosition, { id, x, y }),

  // Update group size
  updateSize: (id: string, width: number, height: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.updateSize, { id, width, height }),

  // Assign item to group (or unassign with null)
  assignItem: (itemId: string, groupId: string | null): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.group.assignItem, { itemId, groupId }),
};

const tracker = {
  credentials: {
    list: (): Promise<TrackerCredentialInfo[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.credentials.get),
    saveJira: (siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.credentials.saveJira, { siteUrl, email, apiToken }),
    delete: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.credentials.delete),
    testJira: (siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.credentials.testJira, { siteUrl, email, apiToken }),
  },
  connections: {
    list: (): Promise<TrackerConnection[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.connections.get),
  },
  scopes: {
    list: (connectionId: string): Promise<TrackerProjectScope[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.scopes.get, { connectionId }),
    add: (connectionId: string, projectKey: string, projectName?: string): Promise<{ success: boolean; scope?: TrackerProjectScope; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.scopes.add, { connectionId, projectKey, projectName }),
  },
  associations: {
    list: (projectId: string): Promise<TrackerAssociationWithScope[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.associations.get, { projectId }),
    remove: (associationId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.associations.remove, { associationId }),
    hasImported: (associationId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.associations.hasImported, { associationId }),
    updateStatusMapping: (associationId: string, statusMapping: StatusMapping | null): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.associations.updateStatusMapping, { associationId, statusMapping }),
    updateCustomFieldValues: (associationId: string, customFieldValues: CustomFieldValues | null): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.associations.updateCustomFieldValues, { associationId, customFieldValues }),
    updateEpicKey: (associationId: string, epicKey: string | null): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.associations.updateEpicKey, { associationId, epicKey }),
  },
  customFields: {
    getAvailable: (projectKey: string, issueTypeId: string): Promise<{ success: boolean; fields?: JiraCustomField[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.customFields.get, { projectKey, issueTypeId }),
  },
  projects: {
    list: (): Promise<{ success: boolean; projects?: { key: string; name: string }[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.projects.listJira),
    getLabels: (projectKey: string): Promise<{ success: boolean; labels?: string[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.project.labels, { projectKey }),
    getComponents: (projectKey: string): Promise<{ success: boolean; components?: { id: string; name: string }[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.project.components, { projectKey }),
  },
  issues: {
    search: (projectKey: string, searchText: string): Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.issues.search, { projectKey, searchText }),
    searchByJql: (projectKey: string, jql: string): Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.issues.searchJql, { projectKey, jql }),
    getRecent: (projectKey: string): Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.issues.recent, { projectKey }),
  },
  import: {
    getPreview: (projectId: string, associationId: string): Promise<{ success: boolean; preview?: ImportPreview; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.import.preview, { projectId, associationId }),
    apply: (projectId: string, associationId: string, selectedTypes: string[]): Promise<{ success: boolean; result?: ImportResult; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.import.apply, { projectId, associationId, selectedTypes }),
    importAll: (projectId: string, associationId: string): Promise<{ success: boolean; result?: ImportResult; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.import.all, { projectId, associationId }),
    onProgress: (callback: (data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => callback(data);
      ipcRenderer.on('tracker:import:progress', handler);
      return () => ipcRenderer.removeListener('tracker:import:progress', handler);
    },
  },
  sync: {
    getPreview: (projectId: string, associationId: string): Promise<{ success: boolean; preview?: SyncPreview; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.sync.preview, { projectId, associationId }),
    applyChanges: (
      projectId: string,
      preview: SyncPreview,
      resolutions: Record<string, ConflictResolution>,
      deletedAction: DeletedItemAction,
      deletedDecisions?: Record<string, 'keep' | 'delete'>
    ): Promise<{ success: boolean; result?: SyncResult; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.tracker.sync.apply, { projectId, preview, resolutions, deletedAction, deletedDecisions }),
    onProgress: (callback: (data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => callback(data);
      ipcRenderer.on('tracker:sync:progress', handler);
      return () => ipcRenderer.removeListener('tracker:sync:progress', handler);
    },
  },
  exportQueue: {
    get: (projectId: string): Promise<{ success: boolean; entries?: SyncQueueEntryWithPlanItem[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.get, { projectId }),
    add: (projectId: string, itemIds: string[]): Promise<{ success: boolean; added?: number; skipped?: number; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.add, { projectId, itemIds }),
    remove: (queueEntryId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.remove, { queueEntryId }),
    updateStatus: (queueEntryId: string, statusCategory: StatusCategory | null): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.updateStatus, { queueEntryId, statusCategory }),
    updateCustomFieldOverrides: (queueEntryId: string, customFieldOverrides: CustomFieldValues | null): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.updateCustomFields, { queueEntryId, customFieldOverrides }),
    clear: (projectId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.clear, { projectId }),
    count: (projectId: string): Promise<{ success: boolean; count?: number; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.queue.count, { projectId }),
  },
  export: {
    getPreview: (projectId: string, associationId: string): Promise<{ success: boolean; preview?: ExportPreview; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.preview, { projectId, associationId }),
    getReview: (projectId: string, associationId: string): Promise<{ success: boolean; reviewData?: SyncReviewData; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.review, { projectId, associationId }),
    executeApproved: (projectId: string, associationId: string, approvedItemIds: string[]): Promise<{ success: boolean; result?: ExportResult; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.executeApproved, { projectId, associationId, approvedItemIds }),
  },
  typeMappings: {
    get: (projectId: string): Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.mappings.get, { projectId }),
    getByScope: (projectId: string, scopeId: string): Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.mappings.getByScope, { projectId, scopeId }),
    save: (
      projectId: string,
      scopeId: string,
      kpmLabel: string,
      jiraIssueTypeId: string,
      jiraIssueTypeName: string
    ): Promise<{ success: boolean; mapping?: TrackerTypeMapping; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.mappings.save, { projectId, scopeId, kpmLabel, jiraIssueTypeId, jiraIssueTypeName }),
    remove: (mappingId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.mappings.remove, { mappingId }),
    createDefaults: (projectId: string, scopeId: string): Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.mappings.createDefaults, { projectId, scopeId }),
  },
  issueTypes: {
    get: (projectKey: string): Promise<{ success: boolean; issueTypes?: { id: string; name: string; subtask: boolean; description?: string; iconUrl?: string }[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.export.issueTypes.get, { projectKey }),
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
};

const storybook = {
  updateUrl: (projectId: string, storybookUrl: string | null): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.storybook.updateUrl, { projectId, storybookUrl }),
  testConnection: (url: string): Promise<{ success: boolean; componentCount?: number; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.storybook.testConnection, { url }),
};

const settings = {
  anthropic: {
    hasKey: (): Promise<{ success: boolean; hasKey?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.anthropic.hasKey),
    saveKey: (apiKey: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.anthropic.saveKey, { apiKey }),
    deleteKey: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.anthropic.deleteKey),
    testKey: (apiKey: string): Promise<{ success: boolean; valid?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.anthropic.testKey, { apiKey }),
  },
  app: {
    get: (key: string): Promise<{ success: boolean; value?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.app.get, { key }),
    set: (key: string, value: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.app.set, { key, value }),
    getAll: (): Promise<{ success: boolean; settings?: Record<string, string>; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.app.getAll),
  },
};

const permission = {
  respond: (requestId: string, projectId: string, action: PermissionAction): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.permission.respond, { requestId, projectId, action }),
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
  revoke: (id: string, projectId: string, cacheKey: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.permission.revoke, { id, projectId, cacheKey }),
  revokeAll: (projectId: string): Promise<{ success: boolean }> =>
    invokeFlat<void>(IPC_CHANNELS.permission.revokeAll, { projectId }),
};

const artifacts = {
  list: (projectId: string): Promise<{ success: boolean; artifacts?: { filename: string; path: string; createdAt: string; modifiedAt: string; size: number }[]; error?: string }> =>
    invokeFlat<{ artifacts: { filename: string; path: string; createdAt: string; modifiedAt: string; size: number }[] }>(IPC_CHANNELS.artifact.list, { projectId }),
  read: (projectId: string, filename: string): Promise<{ success: boolean; content?: string; error?: string }> =>
    invokeFlat<{ content: string }>(IPC_CHANNELS.artifact.read, { projectId, filename }),
  delete: (projectId: string, filename: string): Promise<{ success: boolean; error?: string }> =>
    invokeFlat<void>(IPC_CHANNELS.artifact.delete, { projectId, filename }),
  import: (projectId: string, sourcePath: string): Promise<{ success: boolean; filename?: string; error?: string }> =>
    invokeFlat<{ filename: string }>(IPC_CHANNELS.artifact.import, { projectId, sourcePath }),
  selectDialog: (): Promise<string[]> =>
    invokeOrThrow<{ paths: string[] }, string[]>(IPC_CHANNELS.artifact.selectDialog, undefined, ({ paths }) => paths),
};

const taskPromptTemplates = {
  list: (projectId?: string | null): Promise<{ success: boolean; templates?: TaskPromptTemplate[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.list, { projectId }),
  get: (templateId: string): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.get, { templateId }),
  getEffective: (projectId: string): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.getEffective, { projectId }),
  getBuiltinDefault: (): Promise<{ success: boolean; promptContent?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.getBuiltinDefault, {}),
  create: (
    projectId: string | null,
    name: string,
    promptContent: string
  ): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.create, { projectId, name, promptContent }),
  update: (
    templateId: string,
    updates: { name?: string; promptContent?: string }
  ): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.update, { templateId, ...updates }),
  delete: (templateId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.delete, { templateId }),
  setDefault: (templateId: string): Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.setDefault, { templateId }),
  ensureDefault: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.taskPromptTemplates.ensureDefault),
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

const github = {
  checkAuth: (sessionId: string): Promise<{ success: boolean; authenticated?: boolean; account?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.checkAuth, { sessionId }),
  createPr: (sessionId: string, title: string, body: string, draft?: boolean): Promise<{ success: boolean; number?: number; url?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.createPr, { sessionId, title, body, draft }),
  getPrStatus: (sessionId: string): Promise<{ success: boolean; status?: PrStatus | null; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.getPrStatus, { sessionId }),
  getPrComments: (sessionId: string): Promise<{ success: boolean; comments?: PrComment[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.getPrComments, { sessionId }),
  buildPrContext: (sessionId: string): Promise<{ success: boolean; suggestedTitle?: string; body?: string; branch?: string | null; baseBranch?: string; hasCommits?: boolean; prTemplate?: string | null; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.buildPrContext, { sessionId }),
  buildAddressCommentsContext: (sessionId: string): Promise<{ success: boolean; context?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.buildAddressCommentsContext, { sessionId }),
  detectAndLinkPr: (sessionId: string): Promise<{ success: boolean; status?: PrStatus | null; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.detectAndLinkPr, { sessionId }),
  linkPr: (sessionId: string, prIdentifier: string): Promise<{ success: boolean; number?: number; url?: string; state?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.github.linkPr, { sessionId, prIdentifier }),
};

const review = {
  getInbox: (sessionId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.getInbox, { sessionId }),
  refreshSession: (sessionId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.refreshSession, { sessionId }),
  assignOwnership: (sessionId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.assignOwnership, { sessionId }),
  draftPostImplReplies: (sessionId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.draftPostImplReplies, { sessionId }),
  triggerAutomation: (
    sessionId: string,
    taskIds?: string[]
  ): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; taskIds?: string[]; context?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.triggerAutomation, { sessionId, taskIds }),
  replyToThread: (
    sessionId: string,
    threadId: string,
    body: string,
    resolve?: boolean
  ): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; replyId?: string; resolved?: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.replyToThread, { sessionId, threadId, body, resolve }),
  resolveThread: (sessionId: string, threadId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.resolveThread, { sessionId, threadId }),
  unresolveThread: (sessionId: string, threadId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.unresolveThread, { sessionId, threadId }),
  ignoreTask: (taskId: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.ignoreTask, { taskId }),
  overrideDisposition: (taskId: string, disposition: string): Promise<{ success: boolean; inbox?: ReviewInboxSnapshot; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.review.overrideDisposition, { taskId, disposition }),
  onSyncUpdated: (callback: (data: { sessionId: string; needsReviewCount: number; totalTasks: number; fetchedAt: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; needsReviewCount: number; totalTasks: number; fetchedAt: string }) => callback(data);
    ipcRenderer.on('review:sync-updated', handler);
    return () => ipcRenderer.removeListener('review:sync-updated', handler);
  },
};

const worktrees = {
  getByProject: (projectId: string): Promise<Worktree[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.getByProject, { projectId }),
  getByPlanItem: (planItemId: string): Promise<Worktree | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.getByPlanItem, { planItemId }),
  openEditor: (worktreeId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.openEditor, { worktreeId }),
  getStatus: (worktreeId: string): Promise<WorktreeStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.getStatus, { worktreeId }),
  delete: (worktreeId: string, force?: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.delete, { worktreeId, force: force ?? false }),
  push: (worktreeId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.push, { worktreeId }),
  destroy: (worktreeId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.worktree.destroy, { worktreeId }),
};

const devSessions = {
  // Get all sessions for a project
  getByProject: (projectId: string): Promise<{ success: boolean; sessions?: DevSession[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.getByProject, { projectId }),

  // Get sessions with plan item data
  getByProjectWithPlanItems: (projectId: string): Promise<{ success: boolean; sessions?: DevSessionWithPlanItem[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.getByProjectWithPlanItems, { projectId }),

  // Get active sessions
  getActive: (projectId: string): Promise<{ success: boolean; sessions?: DevSession[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.getActive, { projectId }),

  // Get a session by ID
  get: (sessionId: string): Promise<{ success: boolean; session?: DevSession; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.get, { sessionId }),

  // Check if plan item has active session
  hasActive: (planItemId: string): Promise<{ success: boolean; hasActive?: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.hasActive, { planItemId }),

  // Update session status
  updateStatus: (sessionId: string, status: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.updateStatus, { sessionId, status }),

  // Delete a session (stops PTY if running, removes record, optionally cleans worktree)
  delete: (sessionId: string, cleanupWorktree?: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.delete, { sessionId, cleanupWorktree }),

  // Destroy a session completely (force-delete worktree, branch + remote)
  destroy: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.destroy, { sessionId }),

  // Check if session has uncommitted changes (for warning before delete)
  checkDirty: (sessionId: string): Promise<{ success: boolean; isDirty?: boolean; files?: string[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.checkDirty, { sessionId }),

  // Get git diff for session
  getDiff: (sessionId: string): Promise<{ success: boolean; diff?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.getDiff, { sessionId }),

  // Get commits ahead count
  getCommitsAhead: (sessionId: string): Promise<{ success: boolean; count?: number; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.getCommitsAhead, { sessionId }),

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

  // Update session name
  updateName: (sessionId: string, name: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.devSession.updateName, { sessionId, name }),
};

const fileExplorer = {
  // List directory contents
  listDirectory: (
    projectId: string,
    path?: string,
    options?: { recursive?: boolean; depth?: number }
  ): Promise<FileNode[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.listDirectory, { projectId, path, ...options }),

  // Create a new folder
  createFolder: (projectId: string, path: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.createFolder, { projectId, path }),

  // Create a new file
  createFile: (projectId: string, path: string, content?: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.createFile, { projectId, path, content }),

  // Copy an external file into the project
  copyExternalFile: (projectId: string, sourcePath: string, path: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.copyExternalFile, { projectId, sourcePath, path }),

  // Create a new binary file (images, PDFs, etc.)
  createBinaryFile: (projectId: string, path: string, data: Uint8Array): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.createBinaryFile, { projectId, path, data }),

  // Create a symlink to external path
  createSymlink: (projectId: string, targetPath: string, linkPath: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.createSymlink, { projectId, targetPath, linkPath }),

  // Delete a file or folder
  delete: (projectId: string, path: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.delete, { projectId, path }),

  // Rename/move a file or folder
  rename: (projectId: string, oldPath: string, newPath: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.rename, { projectId, oldPath, newPath }),

  // Get info about a single file/folder
  getInfo: (projectId: string, path: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.getInfo, { projectId, path }),

  // Read file content
  readFile: (projectId: string, path: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.readFile, { projectId, path }),

  // Read binary file content (images, etc.)
  readBinaryFile: (projectId: string, path: string): Promise<Uint8Array> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.readBinaryFile, { projectId, path }),

  // Write file content
  writeFile: (projectId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.writeFile, { projectId, path, content }),

  // Get symlink information
  getSymlinkInfo: (projectId: string, path: string): Promise<{ isSymlink: boolean; target?: string; isBroken?: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.getSymlinkInfo, { projectId, path }),

  // Show folder selection dialog for linking external folders
  selectFolderDialog: (title?: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.selectFolderDialog, { title }),

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

  // Watch project folder for external file changes (Finder, terminal, etc.)
  watchProject: (projectId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.watchProject, { projectId }),

  // Stop watching project folder
  unwatchProject: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.fileExplorer.unwatchProject, {}),
};

// Repo Files API (Workspace file browser for connected repos)
const repoFiles = {
  // List directory contents within a repo
  listDirectory: (
    repoId: string,
    path?: string,
    options?: { recursive?: boolean; depth?: number }
  ): Promise<FileNode[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.repoFiles.listDirectory, { repoId, path, ...options }),

  // Read file content from a repo
  readFile: (repoId: string, path: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.repoFiles.readFile, { repoId, path }),

  // Write file content to a repo (markdown/text files only)
  writeFile: (repoId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.repoFiles.writeFile, { repoId, path, content }),

  // Get info about a single file/folder
  getInfo: (repoId: string, path: string): Promise<FileNode> =>
    ipcRenderer.invoke(IPC_CHANNELS.repoFiles.getInfo, { repoId, path }),
};

// Shell API (for OS-level operations)
const shell = {
  // Open URL in default browser
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.shell.openExternal, { url }),
};

const perf = {
  log: (event: { name: string; durationMs?: number; meta?: Record<string, unknown> }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.perf.log, event),
  getLogInfo: (): Promise<{ success: boolean; enabled?: boolean; logPath?: string; sessionId?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.perf.getLogInfo),
};


const confluence = {
  // Link a document to a Confluence page
  link: (
    projectId: string,
    documentPath: string,
    confluenceUrl: string
  ): Promise<{ success: boolean; data?: ConfluencePageLink; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.link, { projectId, documentPath, confluenceUrl }),

  // Unlink a document from Confluence
  unlink: (projectId: string, documentPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.unlink, { projectId, documentPath }),

  // Get all links for a project
  getLinks: (projectId: string): Promise<{ success: boolean; data?: ConfluencePageLink[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.getLinks, { projectId }),

  // Get link for a specific document
  getLinkForDocument: (
    projectId: string,
    documentPath: string
  ): Promise<{ success: boolean; data?: ConfluencePageLink | null; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.getLinkForDocument, { projectId, documentPath }),

  // Generate sync preview
  getSyncPreview: (
    projectId: string,
    documentPath: string
  ): Promise<{ success: boolean; data?: ConfluenceSyncPreview; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.syncPreview, { projectId, documentPath }),

  // Push local content to Confluence
  push: (
    projectId: string,
    documentPath: string
  ): Promise<{ success: boolean; data?: { pageUrl: string }; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.pushExecute, { projectId, documentPath }),

  // Pull content from Confluence
  pull: (projectId: string, documentPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.pullExecute, { projectId, documentPath }),

  // Parse a Confluence URL (for validation)
  parseUrl: (
    url: string
  ): Promise<{ success: boolean; data?: { siteUrl: string; spaceKey: string; pageId: string }; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.confluence.parseUrl, { url }),
};

// Tool Call Logging API (DevTools panel)
const toolLog = {
  getEntries: (chatSessionId: string): Promise<{ success: boolean; entries?: ToolCallLogEntry[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.toolLog.getEntries, { chatSessionId }),
  getSessionStats: (chatSessionId: string): Promise<{ success: boolean; stats?: { totalCalls: number; byCategory: Record<string, number>; topFiles: string[]; duplicateCount: number }; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.toolLog.getSessionStats, { chatSessionId }),
  getInfo: (): Promise<{ success: boolean; enabled?: boolean; logPath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.toolLog.getInfo),
  setEnabled: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.toolLog.setEnabled, { enabled }),
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

// Search API (Global search across project entities)
const search = {
  global: (projectId: string, query: string, limit?: number): Promise<SearchResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.search.global, { projectId, query, limit }),
};

// Prompt Overrides API (configurable system prompts)
const promptOverrides = {
  list: (category?: PromptCategory): Promise<{ success: boolean; prompts?: PromptDefinitionInfo[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.promptOverrides.list, { category }),
  get: (key: string): Promise<{ success: boolean; prompt?: PromptDefinitionInfo & { defaultContent: string; currentContent: string }; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.promptOverrides.get, { key }),
  set: (key: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.promptOverrides.set, { key, content }),
  reset: (key: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.promptOverrides.reset, { key }),
};

// Briefing API (project state synthesis)
const briefing = {
  generate: (projectId: string): Promise<{ success: boolean; data?: BriefingResult; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.briefing.generate, { projectId }),
  get: (projectId: string): Promise<{ success: boolean; data?: BriefingResult | null; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.briefing.get, { projectId }),
};

// MCP Servers API
const mcpServers = {
  listAvailable: (): Promise<{
    success: boolean;
    plugins?: DiscoveredPlugin[];
    userServers?: UserMcpServer[];
    managedServers?: DiscoveredMcpServer[];
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.mcpServers.listAvailable, {}),
  getPreferences: (): Promise<{ success: boolean; preferences?: Record<string, boolean>; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.mcpServers.getPreferences, {}),
  setEnabled: (serverName: string, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.mcpServers.setEnabled, { serverName, enabled }),
};

// Testing API - only available when NODE_ENV=test
// Used by E2E tests for database reset and test isolation
const testing = {
  // Reset database - truncates all tables while preserving schema
  resetDatabase: (): Promise<{ success: boolean; tablesReset?: number; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.testing.resetDatabase),
};

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
  permission,
  permissions,
  artifacts,
  taskPromptTemplates,
  customPrompts,
  github,
  review,
  worktrees,
  devSessions,
  fileExplorer,
  repoFiles,
  shell,
  perf,
  confluence,
  debug,
  testing,
  toolLog,
  search,
  promptOverrides,
  briefing,
  mcpServers,
  onboarding,
};

export type API = typeof api;
