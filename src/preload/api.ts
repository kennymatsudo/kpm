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
  PermissionRequest,
  PermissionAction,
  FocusedResource,
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
  PermissionRequest,
  PermissionAction,
};

const tempImages = {
  save: (imageData: Uint8Array, format: string): Promise<{ success: true; path: string; filename: string } | { success: false; error: string }> =>
  delete: (filePath: string): Promise<{ success: boolean; error?: string }> =>
};

const chat = {
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
};

const permission = {
  onRequest: (callback: (request: PermissionRequest) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, request: PermissionRequest) => callback(request);
    ipcRenderer.on('permission:request', handler);
    return () => ipcRenderer.removeListener('permission:request', handler);
  },
};

const artifacts = {
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

export const api = {
  tempImages,
  chat,
  projects,
  repos,
  attachments,
  plan,
  tracker,
  claudeMd,
  contextFiles,
  menu,
  storybook,
  settings,
  permission,
  artifacts,
};

export type API = typeof api;
