/**
 * IPC Channel Registry
 *
 * Centralized registry of all IPC channel names.
 * This provides a single source of truth for channel names and enables:
 * - Type-safe channel references
 * - Easy discovery of available channels
 * - Compile-time validation of channel names
 *
 * Usage:
 *   // In main process handlers
 *   ipcMain.handle(IPC_CHANNELS.project.create, ...)
 *
 *   // In preload API wrappers
 *   ipcRenderer.invoke(IPC_CHANNELS.project.create, ...)
 */

import { toNestedChannels } from './ipc/endpoints';
import { planEndpoints } from './ipc/planEndpoints';
import { groupEndpoints } from './ipc/groupEndpoints';
import { exportEndpoints } from './ipc/exportEndpoints';
import { confluenceEndpoints } from './ipc/confluenceEndpoints';
import { scheduledLoopEndpoints } from './ipc/scheduledLoopEndpoints';
import { slackEndpoints } from './ipc/slackEndpoints';
import { trackerEndpoints } from './ipc/trackerEndpoints';
import { fileExplorerEndpoints } from './ipc/fileExplorerEndpoints';
import { repoFilesEndpoints } from './ipc/repoFilesEndpoints';
import { attachmentEndpoints } from './ipc/attachmentEndpoints';
import { tempImageEndpoints } from './ipc/tempImageEndpoints';
import { artifactEndpoints } from './ipc/artifactEndpoints';
import { contextEndpoints } from './ipc/contextEndpoints';
import { searchEndpoints } from './ipc/searchEndpoints';
import { mcpServersEndpoints } from './ipc/mcpServersEndpoints';
import { briefingEndpoints } from './ipc/briefingEndpoints';
import { usageEndpoints } from './ipc/usageEndpoints';
import { chatEndpoints } from './ipc/chatEndpoints';
import { terminalEndpoints } from './ipc/terminalEndpoints';
import { settingsEndpoints } from './ipc/settingsEndpoints';
import { permissionEndpoints } from './ipc/permissionEndpoints';
import { promptOverridesEndpoints } from './ipc/promptOverridesEndpoints';
import { toolLogEndpoints } from './ipc/toolLogEndpoints';
import { storybookEndpoints } from './ipc/storybookEndpoints';
import { worktreeEndpoints } from './ipc/worktreeEndpoints';
import { devSessionEndpoints } from './ipc/devSessionEndpoints';
import { agentSessionEndpoints } from './ipc/agentSessionEndpoints';
import { reviewEndpoints } from './ipc/reviewEndpoints';
import { githubEndpoints } from './ipc/githubEndpoints';
import { projectEndpoints } from './ipc/projectEndpoints';
import { repoEndpoints } from './ipc/repoEndpoints';
import { customPromptEndpoints } from './ipc/customPromptEndpoints';
import { taskPromptTemplateEndpoints } from './ipc/taskPromptTemplateEndpoints';
import { customThemeEndpoints } from './ipc/customThemeEndpoints';
import { onboardingEndpoints } from './ipc/onboardingEndpoints';
import { perfEndpoints } from './ipc/perfEndpoints';
import { debugEndpoints } from './ipc/debugEndpoints';
import { testingEndpoints } from './ipc/testingEndpoints';
import { shellEndpoints } from './ipc/shellEndpoints';

/**
 * Plan, group, export, confluence, scheduled-loop, and slack channels are
 * similarly derived from their own endpoint registries in `shared/ipc/`.
 */
const planChannels = toNestedChannels(planEndpoints) as {
  listItems: string;
  executeActions: string;
  addRelation: string;
  removeRelation: string;
  getRelations: string;
  updatePosition: string;
  updatePositions: string;
  updateItem: string;
  deleteItem: string;
  deleteItemWithDescendants: string;
  getChildCount: string;
};

const groupChannels = toNestedChannels(groupEndpoints) as {
  list: string;
  get: string;
  create: string;
  update: string;
  delete: string;
  updatePosition: string;
  updateSize: string;
  assignItem: string;
};

const exportChannels = toNestedChannels(exportEndpoints) as {
  queue: {
    get: string;
    add: string;
    remove: string;
    clear: string;
    updateStatus: string;
    updateCustomFields: string;
    count: string;
  };
  preview: string;
  review: string;
  executeApproved: string;
  mappings: {
    get: string;
    getByScope: string;
    save: string;
    remove: string;
    createDefaults: string;
  };
  issueTypes: { get: string };
};

const confluenceChannels = toNestedChannels(confluenceEndpoints) as {
  link: string;
  unlink: string;
  getLinks: string;
  getLinkForDocument: string;
  syncPreview: string;
  pushExecute: string;
  pullExecute: string;
  parseUrl: string;
};

const scheduledLoopChannels = toNestedChannels(scheduledLoopEndpoints) as {
  list: string;
  get: string;
  create: string;
  update: string;
  setEnabled: string;
  delete: string;
  runNow: string;
  history: string;
};

const slackChannels = toNestedChannels(slackEndpoints) as {
  availability: { get: string };
  links: { list: string; create: string; delete: string };
  triage: {
    trigger: string;
    getPending: string;
    getAll: string;
    countPending: string;
    approve: string;
    edit: string;
    dismiss: string;
    restore: string;
    execute: string;
  };
};

/**
 * Tracker channels are derived from `trackerEndpoints` (the single owner of
 * channel string + payload schema per tracker endpoint) rather than
 * hand-declared here. See `shared/ipc/trackerEndpoints.ts`.
 */
const trackerChannels = toNestedChannels(trackerEndpoints) as {
  credentials: {
    get: string;
    saveJira: string;
    saveLinear: string;
    delete: string;
    deleteLinear: string;
    testJira: string;
    testLinear: string;
  };
  connections: { get: string };
  scopes: { get: string; add: string };
  associations: {
    get: string;
    add: string;
    remove: string;
    hasImported: string;
    updateStatusMapping: string;
    updateCustomFieldValues: string;
    updateEpicKey: string;
  };
  customFields: { get: string };
  projects: { listJira: string; listLinearTeams: string; listLinearProjects: string };
  project: { statuses: string; labels: string; components: string };
  issues: { search: string; searchJql: string; recent: string };
  import: { preview: string; apply: string; all: string };
  sync: { preview: string; apply: string };
};

/**
 * File explorer, repo files, attachment, temp image, artifact, context, and
 * search channels are similarly derived from their own endpoint registries
 * in `shared/ipc/`, rather than hand-declared here.
 */
const fileExplorerChannels = toNestedChannels(fileExplorerEndpoints) as {
  listDirectory: string;
  createFolder: string;
  createFile: string;
  createBinaryFile: string;
  copyExternalFile: string;
  createSymlink: string;
  delete: string;
  rename: string;
  getInfo: string;
  readFile: string;
  readBinaryFile: string;
  writeFile: string;
  getSymlinkInfo: string;
  showItemInFolder: string;
  openInEditor: string;
  selectFolderDialog: string;
  watchProject: string;
  unwatchProject: string;
};

const repoFilesChannels = toNestedChannels(repoFilesEndpoints) as {
  listDirectory: string;
  readFile: string;
  writeFile: string;
  getInfo: string;
  showItemInFolder: string;
};

const attachmentChannels = toNestedChannels(attachmentEndpoints) as {
  add: string;
  remove: string;
  list: string;
  selectDialog: string;
  pickForChat: string;
  saveDropped: string;
  readAsDataUrl: string;
  openTemp: string;
};

const tempImageChannels = toNestedChannels(tempImageEndpoints) as {
  save: string;
  delete: string;
};

const artifactChannels = toNestedChannels(artifactEndpoints) as {
  list: string;
  read: string;
  delete: string;
  import: string;
  selectDialog: string;
};

const contextEndpointChannels = toNestedChannels(contextEndpoints) as {
  claudeMd: { read: string; write: string };
  context: {
    list: string;
    read: string;
    write: string;
    delete: string;
    import: string;
    selectDialog: string;
  };
};

const searchChannels = toNestedChannels(searchEndpoints) as {
  global: string;
};

const mcpServersChannels = toNestedChannels(mcpServersEndpoints) as {
  listAvailable: string;
  getPreferences: string;
  setEnabled: string;
};

const briefingChannels = toNestedChannels(briefingEndpoints) as {
  generate: string;
  get: string;
};

const usageChannels = toNestedChannels(usageEndpoints) as {
  getProjectStats: string;
  getGlobalStats: string;
  listEvents: string;
  resetProject: string;
};

const chatChannels = toNestedChannels(chatEndpoints) as {
  send: string;
  cancel: string;
  cancelQueued: string;
  newSession: string;
  connectSession: string;
  disconnectSession: string;
  getActiveSessions: string;
  disconnectSpecificSession: string;
  getSessionState: string;
  getUsage: string;
  getMessages: string;
  getSessionHistory: string;
  loadSession: string;
  getFocusDocumentSession: string;
  getSlashCommands: string;
};

const terminalChannels = toNestedChannels(terminalEndpoints) as {
  create: string;
  write: string;
  resize: string;
  kill: string;
};

const settingsChannels = toNestedChannels(settingsEndpoints) as {
  anthropic: { hasKey: string; saveKey: string; deleteKey: string; testKey: string };
  claude: { getAvailability: string; refreshAvailability: string };
  app: { get: string; set: string; getAll: string };
};

const permissionChannels = toNestedChannels(permissionEndpoints) as {
  respond: string;
  list: string;
  revoke: string;
  revokeAll: string;
};

const promptOverridesChannels = toNestedChannels(promptOverridesEndpoints) as {
  list: string;
  get: string;
  set: string;
  reset: string;
};

const toolLogChannels = toNestedChannels(toolLogEndpoints) as {
  getEntries: string;
  getSessionStats: string;
  getInfo: string;
  setEnabled: string;
};

const storybookChannels = toNestedChannels(storybookEndpoints) as {
  updateUrl: string;
  testConnection: string;
};

const worktreeChannels = toNestedChannels(worktreeEndpoints) as {
  getByProject: string;
  getByPlanItem: string;
  openEditor: string;
  getStatus: string;
  delete: string;
  push: string;
  destroy: string;
};

const devSessionChannels = toNestedChannels(devSessionEndpoints) as {
  getByProject: string;
  getByProjectWithPlanItems: string;
  getActive: string;
  get: string;
  hasActive: string;
  openEditor: string;
  updateStatus: string;
  delete: string;
  destroy: string;
  checkDirty: string;
  getDiff: string;
  getCommitsAhead: string;
  updateName: string;
  getMergeOrder: string;
  updateMergeOrder: string;
};

const agentSessionChannels = toNestedChannels(agentSessionEndpoints) as {
  createAndStart: string;
  startAgent: string;
  respond: string;
  followUp: string;
  stop: string;
  getActivities: string;
  getState: string;
  getAvailableAgents: string;
  launchReview: string;
  generateCommitMessage: string;
  commit: string;
  getCommitLog: string;
  getCommitFiles: string;
  dismissInterruption: string;
};

const reviewChannels = toNestedChannels(reviewEndpoints) as {
  getInbox: string;
  refreshSession: string;
  assignOwnership: string;
  assessThreads: string;
  draftPostImplReplies: string;
  triggerAutomation: string;
  replyToThread: string;
  resolveThread: string;
  unresolveThread: string;
  ignoreTask: string;
  overrideDisposition: string;
  pollNow: string;
  pollSession: string;
};

const githubChannels = toNestedChannels(githubEndpoints) as {
  checkAuth: string;
  createPr: string;
  getPrStatus: string;
  getPrComments: string;
  buildPrContext: string;
  generatePrContent: string;
  buildAddressCommentsContext: string;
  detectAndLinkPr: string;
  linkPr: string;
  linkPrToItem: string;
};

const projectChannels = toNestedChannels(projectEndpoints) as {
  create: string;
  get: string;
  list: string;
  update: string;
  delete: string;
  openFolder: string;
  getDefaultLocation: string;
};

const repoChannels = toNestedChannels(repoEndpoints) as {
  add: string;
  remove: string;
  list: string;
  getBranch: string;
  getBranches: string;
  watch: string;
  unwatch: string;
  updateEnvironmentMode: string;
  selectDialog: string;
  listDirectories: string;
  listAllBranches: string;
  listWorktrees: string;
  setActiveWorktreePath: string;
  showInFolder: string;
  openEditor: string;
};

const customPromptChannels = toNestedChannels(customPromptEndpoints) as {
  list: string;
  get: string;
  create: string;
  update: string;
  delete: string;
  execute: string;
  ensureBuiltins: string;
};

const taskPromptTemplateChannels = toNestedChannels(taskPromptTemplateEndpoints) as {
  list: string;
  get: string;
  getEffective: string;
  getBuiltinDefault: string;
  create: string;
  update: string;
  delete: string;
  setDefault: string;
  ensureDefault: string;
};

const customThemeChannels = toNestedChannels(customThemeEndpoints) as {
  list: string;
  importFromUrl: string;
  delete: string;
};

const onboardingEndpointChannels = toNestedChannels(onboardingEndpoints) as {
  generate: string;
  saveContext: string;
  saveContextDirectories: string;
  getContextDirectories: string;
};

const perfChannels = toNestedChannels(perfEndpoints) as {
  log: string;
  getLogInfo: string;
};

const debugChannels = toNestedChannels(debugEndpoints) as {
  setEnabled: string;
  isEnabled: string;
};

const testingChannels = toNestedChannels(testingEndpoints) as {
  resetDatabase: string;
  getDbPath: string;
};

const shellEndpointChannels = toNestedChannels(shellEndpoints) as {
  openExternal: string;
};

export const IPC_CHANNELS = {
  // ===========================================================================
  // Project Management
  // ===========================================================================
  project: projectChannels,

  // ===========================================================================
  // Repository Management
  // ===========================================================================
  repo: repoChannels,

  // ===========================================================================
  // Attachments
  // ===========================================================================
  attachment: attachmentChannels,

  // ===========================================================================
  // Plan Items
  // ===========================================================================
  plan: planChannels,

  // ===========================================================================
  // Groups (Visual Containers)
  // ===========================================================================
  group: groupChannels,


  // ===========================================================================
  // Chat (Main Claude Session)
  // ===========================================================================
  chat: chatChannels,

  // ===========================================================================
  // Context Files
  // ===========================================================================
  context: contextEndpointChannels.context,

  // ===========================================================================
  // File Explorer
  // ===========================================================================
  fileExplorer: fileExplorerChannels,

  // ===========================================================================
  // Repo Files
  // ===========================================================================
  repoFiles: repoFilesChannels,

  // ===========================================================================
  // Tracker (Jira/Linear Integration)
  // ===========================================================================
  tracker: trackerChannels,

  // ===========================================================================
  // Export (Sync to Tracker)
  // ===========================================================================
  export: exportChannels,

  // ===========================================================================
  // Artifacts
  // ===========================================================================
  artifact: artifactChannels,

  // ===========================================================================
  // Temp Images
  // ===========================================================================
  tempImage: tempImageChannels,

  // ===========================================================================
  // Settings
  // ===========================================================================
  settings: settingsChannels,

  // ===========================================================================
  // Custom Themes
  // ===========================================================================
  customThemes: customThemeChannels,

  // ===========================================================================
  // Task Prompt Templates
  // ===========================================================================
  taskPromptTemplates: taskPromptTemplateChannels,

  // ===========================================================================
  // Custom Prompts
  // ===========================================================================
  // `custom-prompt:progress`/`custom-prompt:complete`/`custom-prompt:error`
  // (main-to-renderer events) predate `IPC_CHANNELS` and stay hand-written
  // literals in `handlers/customPrompts.ts`/`preload/api.ts`.
  customPrompts: customPromptChannels,
  scheduledLoop: scheduledLoopChannels,

  // ===========================================================================
  // Worktrees
  // ===========================================================================
  worktree: worktreeChannels,

  // ===========================================================================
  // Dev Sessions
  // ===========================================================================
  devSession: devSessionChannels,

  // ===========================================================================
  // GitHub (PR Management)
  // ===========================================================================
  github: githubChannels,

  // ===========================================================================
  // Review Workflow
  // ===========================================================================
  review: reviewChannels,

  // ===========================================================================
  // Storybook
  // ===========================================================================
  storybook: storybookChannels,

  // ===========================================================================
  // Shell Operations
  // ===========================================================================
  shell: shellEndpointChannels,

  // ===========================================================================
  // Permission
  // ===========================================================================
  // `permission:request` (main-to-renderer event) predates `IPC_CHANNELS` and
  // stays a hand-written literal in `PermissionPromptService`/`preload/api.ts`,
  // matching its pre-migration state.
  permission: permissionChannels,

  // ===========================================================================
  // Project Context File (AGENTS.md / CLAUDE.md)
  // ===========================================================================
  claudeMd: contextEndpointChannels.claudeMd,

  // ===========================================================================
  // Prompt Overrides
  // ===========================================================================
  promptOverrides: promptOverridesChannels,

  // ===========================================================================
  // Performance Logging
  // ===========================================================================
  perf: perfChannels,

  // ===========================================================================
  // Tool Log
  // ===========================================================================
  // `toollog:call`/`toollog:turn-summary` (broadcast events) predate
  // `IPC_CHANNELS` and stay hand-written literals in `ToolCallLogger`/
  // `preload/api.ts`, matching their pre-migration state.
  toolLog: toolLogChannels,

  // ===========================================================================
  // Search
  // ===========================================================================
  search: searchChannels,

  // ===========================================================================
  // Confluence Document Sync
  // ===========================================================================
  confluence: confluenceChannels,

  // ===========================================================================
  // Slack Triage
  // ===========================================================================
  slack: slackChannels,

  // ===========================================================================
  // Briefing
  // ===========================================================================
  briefing: {
    ...briefingChannels,
    // Streaming event (`sender.send` / `ipcRenderer.on`), not an invoke endpoint.
    chunk: 'briefing:chunk',
  },

  // ===========================================================================
  // MCP Servers
  // ===========================================================================
  mcpServers: mcpServersChannels,

  // ===========================================================================
  // Debug
  // ===========================================================================
  debug: debugChannels,

  // ===========================================================================
  // Onboarding
  // ===========================================================================
  // `onboarding:progress`/`onboarding:thinking`/`onboarding:complete`/
  // `onboarding:error` (main-to-renderer events) predate `IPC_CHANNELS` and
  // stay hand-written literals in `handlers/onboarding.ts`/`preload/api.ts`.
  onboarding: onboardingEndpointChannels,

  // ===========================================================================
  // Agent Sessions (Board-Driven Execution)
  // ===========================================================================
  agentSession: agentSessionChannels,

  // ===========================================================================
  // Claude Usage Tracking
  // ===========================================================================
  usage: usageChannels,

  // ===========================================================================
  // Testing
  // ===========================================================================
  testing: testingChannels,

  // ===========================================================================
  // Embedded Developer Terminal
  // ===========================================================================
  terminal: {
    ...terminalChannels,
    // PTY output/exit events (`webContents.send` / `ipcRenderer.on`), not invoke endpoints.
    data: 'terminal:data',
    exit: 'terminal:exit',
  },
} as const;

// Type for channel names
export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS] extends infer T
  ? T extends string
    ? T
    : T extends Record<string, unknown>
      ? T[keyof T] extends infer U
        ? U extends string
          ? U
          : U extends Record<string, unknown>
            ? U[keyof U] extends string
              ? U[keyof U]
              : never
            : never
        : never
      : never
  : never;
