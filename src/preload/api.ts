import { ipcRenderer } from 'electron';
import type {
  Project,
  Repo,
  Attachment,
  PlanItem,
  PlanRelation,
  PlanAction,
  PlanActionResult,
  PlanItemUpdates,
  Activity,
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
} from '../shared/types';

// Re-export shared types for renderer consumers
export type {
  Project,
  Repo,
  Attachment,
  PlanItem,
  PlanRelation,
  PlanAction,
  PlanActionResult,
  Activity,
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
  Worktree,
  WorktreeStatus,
  LaunchResult,
  SessionState,
  DevSession,
  DevSessionWithPlanItem,
  ClaudeModel,
  FileNode,
  Group,
};

const tempImages = {
  save: (imageData: Uint8Array, format: string): Promise<{ success: true; path: string; filename: string } | { success: false; error: string }> =>
  delete: (filePath: string): Promise<{ success: boolean; error?: string }> =>
};

const chat = {
  newSession: (projectId: string): Promise<{ success: boolean }> =>
  getMessages: (projectId: string): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> =>
  getSessionHistory: (projectId: string, limit?: number): Promise<{ success: boolean; sessions?: ChatSessionSummary[]; error?: string }> =>
  onChunk: (callback: (data: {
    projectId: string;
    text: string;
    segmentId?: number;
    precedingActivities?: Activity[];
  }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: {
      projectId: string;
      text: string;
      segmentId?: number;
      precedingActivities?: Activity[];
    }) => callback(data);
    ipcRenderer.on('chat:chunk', handler);
    return () => ipcRenderer.removeListener('chat:chunk', handler);
  },
    ipcRenderer.on('chat:plan-actions', handler);
    return () => ipcRenderer.removeListener('chat:plan-actions', handler);
  },
    ipcRenderer.on('chat:done', handler);
    return () => ipcRenderer.removeListener('chat:done', handler);
  },
    ipcRenderer.on('chat:error', handler);
    return () => ipcRenderer.removeListener('chat:error', handler);
  },
    ipcRenderer.on('chat:activity', handler);
    return () => ipcRenderer.removeListener('chat:activity', handler);
  },
    ipcRenderer.on('chat:file-update', handler);
    return () => ipcRenderer.removeListener('chat:file-update', handler);
  },

  // ─── Streaming Session Methods ───

  /** Connect streaming session for a project (called on project open) */
  connectSession: (projectId: string): Promise<{ success: boolean; sessionId?: string; error?: string }> =>

  disconnectSession: (projectId: string): Promise<{ success: boolean; error?: string }> =>

  /** Get current session state */

  /** Session connecting event */
    ipcRenderer.on('chat:session-connecting', handler);
    return () => ipcRenderer.removeListener('chat:session-connecting', handler);
  },

  /** Session ready event */
    ipcRenderer.on('chat:session-ready', handler);
    return () => ipcRenderer.removeListener('chat:session-ready', handler);
  },

  /** Session error event */
    ipcRenderer.on('chat:session-error', handler);
    return () => ipcRenderer.removeListener('chat:session-error', handler);
  },

};

const projects = {
  get: (projectId: string): Promise<Project | undefined> =>
  list: (): Promise<Project[]> =>
  delete: (projectId: string): Promise<{ success: boolean }> =>
  openFolder: (projectId: string): Promise<{ success: boolean; error?: string }> =>
};

const repos = {
  add: (projectId: string, path: string): Promise<Repo> =>
  remove: (repoId: string): Promise<{ success: boolean }> =>
  list: (projectId: string): Promise<Repo[]> =>
  selectDialog: (): Promise<string[]> =>
  getBranch: (path: string): Promise<string | null> =>
  getBranches: (paths: string[]): Promise<Record<string, string | null>> =>
  watch: (repoId: string, path: string): Promise<{ success: boolean }> =>
  unwatch: (path: string): Promise<{ success: boolean }> =>
  onBranchChanged: (callback: (data: { repoId: string; repoPath: string; branch: string | null }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { repoId: string; repoPath: string; branch: string | null }) => callback(data);
    ipcRenderer.on('repo:branch-changed', handler);
    return () => ipcRenderer.removeListener('repo:branch-changed', handler);
  },
};

const attachments = {
  add: (projectId: string, path: string, filename: string): Promise<Attachment> =>
  remove: (attachmentId: string): Promise<{ success: boolean }> =>
  list: (projectId: string): Promise<Attachment[]> =>
  selectDialog: (): Promise<string[]> =>
};

const plan = {
  listItems: (projectId: string): Promise<PlanItem[]> =>
  executeActions: (projectId: string, actions: PlanAction[]): Promise<PlanActionResult> =>
  addRelation: (relation: Omit<PlanRelation, 'id'>): Promise<PlanRelation> =>
  removeRelation: (relationId: string): Promise<{ success: boolean }> =>
  getRelations: (projectId: string): Promise<PlanRelation[]> =>
  updatePosition: (itemId: string, x: number, y: number): Promise<{ success: boolean; error?: string }> =>
  updateItem: (itemId: string, updates: PlanItemUpdates): Promise<{ success: boolean; error?: string }> =>
  deleteItem: (itemId: string): Promise<{ success: boolean; error?: string }> =>
  deleteItemWithDescendants: (itemId: string): Promise<{ success: boolean; error?: string }> =>
  getChildCount: (itemId: string): Promise<number> =>
};

// Groups API (Visual containers - Figma-style frames)
const groups = {
  // List all groups for a project
  list: (projectId: string): Promise<Group[]> =>

  // Get a single group by ID
  get: (id: string): Promise<Group | undefined> =>

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

  // Update a group
  update: (
    id: string,
    updates: Partial<Pick<Group, 'name' | 'color' | 'position_x' | 'position_y' | 'width' | 'height'>>
  ): Promise<{ success: boolean; error?: string }> =>

  // Delete a group (items remain, become ungrouped)
  delete: (id: string): Promise<{ success: boolean; error?: string }> =>

  // Update group position
  updatePosition: (id: string, x: number, y: number): Promise<{ success: boolean; error?: string }> =>

  // Update group size
  updateSize: (id: string, width: number, height: number): Promise<{ success: boolean; error?: string }> =>

  // Assign item to group (or unassign with null)
  assignItem: (itemId: string, groupId: string | null): Promise<{ success: boolean; error?: string }> =>
};

const tracker = {
  credentials: {
    list: (): Promise<TrackerCredentialInfo[]> =>
    saveJira: (siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }> =>
    delete: (): Promise<{ success: boolean }> =>
    testJira: (siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }> =>
  },
  connections: {
    list: (): Promise<TrackerConnection[]> =>
  },
  scopes: {
    list: (connectionId: string): Promise<TrackerProjectScope[]> =>
    add: (connectionId: string, projectKey: string, projectName?: string): Promise<{ success: boolean; scope?: TrackerProjectScope; error?: string }> =>
  },
  associations: {
    list: (projectId: string): Promise<TrackerAssociationWithScope[]> =>
    remove: (associationId: string): Promise<{ success: boolean }> =>
    hasImported: (associationId: string): Promise<boolean> =>
    updateStatusMapping: (associationId: string, statusMapping: StatusMapping | null): Promise<{ success: boolean; error?: string }> =>
    updateCustomFieldValues: (associationId: string, customFieldValues: CustomFieldValues | null): Promise<{ success: boolean; error?: string }> =>
    updateEpicKey: (associationId: string, epicKey: string | null): Promise<{ success: boolean; error?: string }> =>
  },
  customFields: {
    getAvailable: (projectKey: string, issueTypeId: string): Promise<{ success: boolean; fields?: JiraCustomField[]; error?: string }> =>
  },
  projects: {
    list: (): Promise<{ success: boolean; projects?: { key: string; name: string }[]; error?: string }> =>
    getLabels: (projectKey: string): Promise<{ success: boolean; labels?: string[]; error?: string }> =>
    getComponents: (projectKey: string): Promise<{ success: boolean; components?: { id: string; name: string }[]; error?: string }> =>
  },
  issues: {
    search: (projectKey: string, searchText: string): Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }> =>
    searchByJql: (projectKey: string, jql: string): Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }> =>
    getRecent: (projectKey: string): Promise<{ success: boolean; issues?: { key: string; title: string; issueType: string; status: string }[]; error?: string }> =>
  },
  import: {
    getPreview: (projectId: string, associationId: string): Promise<{ success: boolean; preview?: ImportPreview; error?: string }> =>
    apply: (projectId: string, associationId: string, selectedTypes: string[]): Promise<{ success: boolean; result?: ImportResult; error?: string }> =>
    importAll: (projectId: string, associationId: string): Promise<{ success: boolean; result?: ImportResult; error?: string }> =>
    onProgress: (callback: (data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => callback(data);
      ipcRenderer.on('tracker:import:progress', handler);
      return () => ipcRenderer.removeListener('tracker:import:progress', handler);
    },
  },
  sync: {
    getPreview: (projectId: string, associationId: string): Promise<{ success: boolean; preview?: SyncPreview; error?: string }> =>
    applyChanges: (
      projectId: string,
      preview: SyncPreview,
      resolutions: Record<string, ConflictResolution>,
      deletedAction: DeletedItemAction,
      deletedDecisions?: Record<string, 'keep' | 'delete'>
    ): Promise<{ success: boolean; result?: SyncResult; error?: string }> =>
    onProgress: (callback: (data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => callback(data);
      ipcRenderer.on('tracker:sync:progress', handler);
      return () => ipcRenderer.removeListener('tracker:sync:progress', handler);
    },
  },
  exportQueue: {
    get: (projectId: string): Promise<{ success: boolean; entries?: SyncQueueEntryWithPlanItem[]; error?: string }> =>
    add: (projectId: string, itemIds: string[]): Promise<{ success: boolean; added?: number; skipped?: number; error?: string }> =>
    remove: (queueEntryId: string): Promise<{ success: boolean; error?: string }> =>
    updateStatus: (queueEntryId: string, statusCategory: StatusCategory | null): Promise<{ success: boolean; error?: string }> =>
    updateCustomFieldOverrides: (queueEntryId: string, customFieldOverrides: CustomFieldValues | null): Promise<{ success: boolean; error?: string }> =>
    clear: (projectId: string): Promise<{ success: boolean; error?: string }> =>
    count: (projectId: string): Promise<{ success: boolean; count?: number; error?: string }> =>
  },
  export: {
    getPreview: (projectId: string, associationId: string): Promise<{ success: boolean; preview?: ExportPreview; error?: string }> =>
    getReview: (projectId: string, associationId: string): Promise<{ success: boolean; reviewData?: SyncReviewData; error?: string }> =>
    executeApproved: (projectId: string, associationId: string, approvedItemIds: string[]): Promise<{ success: boolean; result?: ExportResult; error?: string }> =>
  },
  typeMappings: {
    get: (projectId: string): Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }> =>
    getByScope: (projectId: string, scopeId: string): Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }> =>
    save: (
      projectId: string,
      scopeId: string,
      kpmLabel: string,
      jiraIssueTypeId: string,
      jiraIssueTypeName: string
    ): Promise<{ success: boolean; mapping?: TrackerTypeMapping; error?: string }> =>
    remove: (mappingId: string): Promise<{ success: boolean; error?: string }> =>
    createDefaults: (projectId: string, scopeId: string): Promise<{ success: boolean; mappings?: TrackerTypeMapping[]; error?: string }> =>
  },
  issueTypes: {
    get: (projectKey: string): Promise<{ success: boolean; issueTypes?: { id: string; name: string; subtask: boolean; description?: string; iconUrl?: string }[]; error?: string }> =>
  },
};

const claudeMd = {
  read: (projectId: string): Promise<{ success: boolean; content: string | null; error?: string }> =>
  write: (projectId: string, content: string): Promise<{ success: boolean; error?: string }> =>
};

const contextFiles = {
  list: (projectId: string): Promise<{
    success: boolean;
      path: string;
      name: string;
      isClaudeMd: boolean;
      modifiedAt: string;
    }[];
    error?: string;
  read: (projectId: string, path: string): Promise<{ success: boolean; content: string | null; error?: string }> =>
  write: (projectId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> =>
  delete: (projectId: string, path: string): Promise<{ success: boolean; error?: string }> =>
  import: (projectId: string, sourcePath: string): Promise<{ success: boolean; filename?: string; error?: string }> =>
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
  testConnection: (url: string): Promise<{ success: boolean; componentCount?: number; error?: string }> =>
};

const settings = {
  anthropic: {
    hasKey: (): Promise<{ success: boolean; hasKey?: boolean; error?: string }> =>
    saveKey: (apiKey: string): Promise<{ success: boolean; error?: string }> =>
    deleteKey: (): Promise<{ success: boolean; error?: string }> =>
    testKey: (apiKey: string): Promise<{ success: boolean; valid?: boolean; error?: string }> =>
  },
  app: {
    get: (key: string): Promise<{ success: boolean; value?: string; error?: string }> =>
    set: (key: string, value: string): Promise<{ success: boolean; error?: string }> =>
    getAll: (): Promise<{ success: boolean; settings?: Record<string, string>; error?: string }> =>
  },
};

const permission = {
  respond: (requestId: string, projectId: string, action: PermissionAction): Promise<{ success: boolean; error?: string }> =>
  onRequest: (callback: (request: PermissionRequest) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, request: PermissionRequest) => callback(request);
    ipcRenderer.on('permission:request', handler);
    return () => ipcRenderer.removeListener('permission:request', handler);
  },
};

const artifacts = {
  list: (projectId: string): Promise<{ success: boolean; artifacts?: { filename: string; path: string; createdAt: string; modifiedAt: string; size: number }[]; error?: string }> =>
  read: (projectId: string, filename: string): Promise<{ success: boolean; content?: string; error?: string }> =>
  delete: (projectId: string, filename: string): Promise<{ success: boolean; error?: string }> =>
  import: (projectId: string, sourcePath: string): Promise<{ success: boolean; filename?: string; error?: string }> =>
};

  create: (
    projectId: string | null,
    name: string,
  update: (
    templateId: string,
  delete: (templateId: string): Promise<{ success: boolean; error?: string }> =>
  ensureDefault: (): Promise<{ success: boolean; error?: string }> =>
};

const worktrees = {
  getByProject: (projectId: string): Promise<Worktree[]> =>
  getByPlanItem: (planItemId: string): Promise<Worktree | undefined> =>
  openEditor: (worktreeId: string): Promise<{ success: boolean; error?: string }> =>
  getStatus: (worktreeId: string): Promise<WorktreeStatus> =>
  delete: (worktreeId: string, force?: boolean): Promise<{ success: boolean; error?: string }> =>
  push: (worktreeId: string): Promise<{ success: boolean; error?: string }> =>
};

const devSessions = {
  // Get all sessions for a project
  getByProject: (projectId: string): Promise<{ success: boolean; sessions?: DevSession[]; error?: string }> =>

  // Get sessions with plan item data
  getByProjectWithPlanItems: (projectId: string): Promise<{ success: boolean; sessions?: DevSessionWithPlanItem[]; error?: string }> =>

  // Get active sessions
  getActive: (projectId: string): Promise<{ success: boolean; sessions?: DevSession[]; error?: string }> =>

  // Get a session by ID
  get: (sessionId: string): Promise<{ success: boolean; session?: DevSession; error?: string }> =>

  // Check if plan item has active session
  hasActive: (planItemId: string): Promise<{ success: boolean; hasActive?: boolean; error?: string }> =>

  // Update session status
  updateStatus: (sessionId: string, status: string): Promise<{ success: boolean; error?: string }> =>

  // Delete a session (stops PTY if running, removes record, optionally cleans worktree)
  delete: (sessionId: string, cleanupWorktree?: boolean): Promise<{ success: boolean; error?: string }> =>

  // Get git diff for session
  getDiff: (sessionId: string): Promise<{ success: boolean; diff?: string; error?: string }> =>

  // Get commits ahead count
  getCommitsAhead: (sessionId: string): Promise<{ success: boolean; count?: number; error?: string }> =>

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
};

const fileExplorer = {
  // List directory contents
  listDirectory: (
    projectId: string,
    path?: string,
    options?: { recursive?: boolean; depth?: number }
  ): Promise<FileNode[]> =>

  // Create a new folder
  createFolder: (projectId: string, path: string): Promise<FileNode> =>

  // Create a new file
  createFile: (projectId: string, path: string, content?: string): Promise<FileNode> =>

  // Create a symlink to external path
  createSymlink: (projectId: string, targetPath: string, linkPath: string): Promise<FileNode> =>

  // Delete a file or folder
  delete: (projectId: string, path: string): Promise<{ success: boolean; error?: string }> =>

  // Rename/move a file or folder
  rename: (projectId: string, oldPath: string, newPath: string): Promise<FileNode> =>

  // Get info about a single file/folder
  getInfo: (projectId: string, path: string): Promise<FileNode> =>

  // Read file content
  readFile: (projectId: string, path: string): Promise<string> =>

  // Write file content
  writeFile: (projectId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> =>

  // Get symlink information
  getSymlinkInfo: (projectId: string, path: string): Promise<{ isSymlink: boolean; target?: string; isBroken?: boolean }> =>

  // Show folder selection dialog for linking external folders
  selectFolderDialog: (title?: string): Promise<string | null> =>

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
};

// Repo Files API (Workspace file browser for connected repos)
const repoFiles = {
  // List directory contents within a repo
  listDirectory: (
    repoId: string,
    path?: string,
    options?: { recursive?: boolean; depth?: number }
  ): Promise<FileNode[]> =>

  // Read file content from a repo
  readFile: (repoId: string, path: string): Promise<string> =>

  // Write file content to a repo (markdown/text files only)
  writeFile: (repoId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> =>

  // Get info about a single file/folder
  getInfo: (repoId: string, path: string): Promise<FileNode> =>
};

// Shell API (for OS-level operations)
const shell = {
  // Open URL in default browser
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
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
  artifacts,
  worktrees,
  devSessions,
  fileExplorer,
  repoFiles,
  shell,
};

export type API = typeof api;
