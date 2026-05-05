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

export const IPC_CHANNELS = {
  // ===========================================================================
  // Project Management
  // ===========================================================================
  project: {
    create: 'project:create',
    get: 'project:get',
    list: 'project:list',
    update: 'project:update',
    delete: 'project:delete',
    openFolder: 'project:open-folder',
  },

  // ===========================================================================
  // Repository Management
  // ===========================================================================
  repo: {
    add: 'repo:add',
    remove: 'repo:remove',
    list: 'repo:list',
    getBranch: 'repo:get-branch',
    getBranches: 'repo:get-branches',
    watch: 'repo:watch',
    unwatch: 'repo:unwatch',
    updateEnvironmentMode: 'repo:update-environment-mode',
    selectDialog: 'repo:select-dialog',
    listDirectories: 'repo:list-directories',
    listAllBranches: 'repo:list-all-branches',
    listWorktrees: 'repo:list-worktrees',
    setActiveWorktreePath: 'repo:set-active-worktree-path',
    showInFolder: 'repo:show-in-folder',
  },

  // ===========================================================================
  // Attachments
  // ===========================================================================
  attachment: {
    add: 'attachment:add',
    remove: 'attachment:remove',
    list: 'attachment:list',
    selectDialog: 'attachment:select-dialog',
    pickForChat: 'attachment:pick-for-chat',
    saveDropped: 'attachment:save-dropped',
    readAsDataUrl: 'attachment:read-as-data-url',
    openTemp: 'attachment:open-temp',
  },

  // ===========================================================================
  // Plan Items
  // ===========================================================================
  plan: {
    listItems: 'plan:list-items',
    executeActions: 'plan:execute-actions',
    addRelation: 'plan:add-relation',
    removeRelation: 'plan:remove-relation',
    getRelations: 'plan:get-relations',
    updatePosition: 'plan:update-position',
    updatePositions: 'plan:update-positions',
    updateItem: 'plan:update-item',
    deleteItem: 'plan:delete-item',
    deleteItemWithDescendants: 'plan:delete-item-with-descendants',
    getChildCount: 'plan:get-child-count',
  },

  // ===========================================================================
  // Groups (Visual Containers)
  // ===========================================================================
  group: {
    list: 'group:list',
    get: 'group:get',
    create: 'group:create',
    update: 'group:update',
    delete: 'group:delete',
    updatePosition: 'group:update-position',
    updateSize: 'group:update-size',
    assignItem: 'group:assign-item',
  },


  // ===========================================================================
  // Chat (Main Claude Session)
  // ===========================================================================
  chat: {
    send: 'chat:send',
    cancel: 'chat:cancel',
    connectSession: 'chat:connect-session',
    newSession: 'chat:new-session',
    disconnectSession: 'chat:disconnect-session',
    disconnectSpecificSession: 'chat:disconnect-specific-session',
    getActiveSessions: 'chat:get-active-sessions',
    getSessionState: 'chat:get-session-state',
    getSessionHistory: 'chat:get-session-history',
    loadSession: 'chat:load-session',
    getUsage: 'chat:get-usage',
    getMessages: 'chat:get-messages',
  },

  // ===========================================================================
  // Context Files
  // ===========================================================================
  context: {
    list: 'context:list',
    read: 'context:read',
    write: 'context:write',
    delete: 'context:delete',
    import: 'context:import',
    selectDialog: 'context:select-dialog',
  },

  // ===========================================================================
  // File Explorer
  // ===========================================================================
  fileExplorer: {
    listDirectory: 'file-explorer:list-directory',
    createFolder: 'file-explorer:create-folder',
    createFile: 'file-explorer:create-file',
    createBinaryFile: 'file-explorer:create-binary-file',
    copyExternalFile: 'file-explorer:copy-external-file',
    createSymlink: 'file-explorer:create-symlink',
    delete: 'file-explorer:delete',
    rename: 'file-explorer:rename',
    getInfo: 'file-explorer:get-info',
    readFile: 'file-explorer:read-file',
    readBinaryFile: 'file-explorer:read-binary-file',
    writeFile: 'file-explorer:write-file',
    getSymlinkInfo: 'file-explorer:get-symlink-info',
    showItemInFolder: 'file-explorer:show-item-in-folder',
    selectFolderDialog: 'file-explorer:select-folder-dialog',
    watchProject: 'file-explorer:watch-project',
    unwatchProject: 'file-explorer:unwatch-project',
  },

  // ===========================================================================
  // Repo Files
  // ===========================================================================
  repoFiles: {
    listDirectory: 'repo-files:list-directory',
    readFile: 'repo-files:read-file',
    writeFile: 'repo-files:write-file',
    getInfo: 'repo-files:get-info',
    showItemInFolder: 'repo-files:show-item-in-folder',
  },

  // ===========================================================================
  // Tracker (Jira/Linear Integration)
  // ===========================================================================
  tracker: {
    credentials: {
      get: 'tracker:credentials:get',
      saveJira: 'tracker:credentials:save:jira',
      saveLinear: 'tracker:credentials:save:linear',
      delete: 'tracker:credentials:delete',
      deleteLinear: 'tracker:credentials:delete:linear',
      testJira: 'tracker:credentials:test:jira',
      testLinear: 'tracker:credentials:test:linear',
    },
    connections: {
      get: 'tracker:connections:get',
    },
    scopes: {
      get: 'tracker:scopes:get',
      add: 'tracker:scopes:add',
    },
    associations: {
      get: 'tracker:associations:get',
      add: 'tracker:associations:add',
      remove: 'tracker:associations:remove',
      hasImported: 'tracker:associations:has-imported',
      updateStatusMapping: 'tracker:associations:update-status-mapping',
      updateCustomFieldValues: 'tracker:associations:update-custom-field-values',
      updateEpicKey: 'tracker:associations:update-epic-key',
    },
    customFields: {
      get: 'tracker:custom-fields:get',
    },
    projects: {
      listJira: 'tracker:projects:list:jira',
      listLinearTeams: 'tracker:projects:list:linear-teams',
      listLinearProjects: 'tracker:projects:list:linear-projects',
    },
    project: {
      statuses: 'tracker:project:statuses',
      labels: 'tracker:project:labels',
      components: 'tracker:project:components',
    },
    issues: {
      search: 'tracker:issues:search',
      searchJql: 'tracker:issues:search-jql',
      recent: 'tracker:issues:recent',
    },
    import: {
      preview: 'tracker:import:preview',
      apply: 'tracker:import:apply',
      all: 'tracker:import:all',
    },
    sync: {
      preview: 'tracker:sync:preview',
      apply: 'tracker:sync:apply',
    },
  },

  // ===========================================================================
  // Export (Sync to Tracker)
  // ===========================================================================
  export: {
    queue: {
      get: 'export:queue:get',
      add: 'export:queue:add',
      remove: 'export:queue:remove',
      clear: 'export:queue:clear',
      updateStatus: 'export:queue:update-status',
      updateCustomFields: 'export:queue:update-custom-fields',
      count: 'export:queue:count',
    },
    preview: 'export:preview',
    review: 'export:review',
    executeApproved: 'export:execute-approved',
    mappings: {
      get: 'export:mappings:get',
      getByScope: 'export:mappings:get-by-scope',
      save: 'export:mappings:save',
      remove: 'export:mappings:remove',
      createDefaults: 'export:mappings:create-defaults',
    },
    issueTypes: {
      get: 'export:issue-types:get',
    },
  },

  // ===========================================================================
  // Artifacts
  // ===========================================================================
  artifact: {
    list: 'artifact:list',
    read: 'artifact:read',
    delete: 'artifact:delete',
    import: 'artifact:import',
    selectDialog: 'artifact:select-dialog',
  },

  // ===========================================================================
  // Temp Images
  // ===========================================================================
  tempImage: {
    save: 'temp-image:save',
    delete: 'temp-image:delete',
  },

  // ===========================================================================
  // Settings
  // ===========================================================================
  settings: {
    anthropic: {
      hasKey: 'settings:anthropic:has-key',
      saveKey: 'settings:anthropic:save-key',
      deleteKey: 'settings:anthropic:delete-key',
      testKey: 'settings:anthropic:test-key',
    },
    claude: {
      getAvailability: 'settings:claude:get-availability',
      refreshAvailability: 'settings:claude:refresh-availability',
    },
    app: {
      get: 'settings:app:get',
      set: 'settings:app:set',
      getAll: 'settings:app:get-all',
    },
  },

  // ===========================================================================
  // Custom Themes
  // ===========================================================================
  customThemes: {
    list: 'custom-themes:list',
    importFromUrl: 'custom-themes:import-from-url',
    delete: 'custom-themes:delete',
  },

  // ===========================================================================
  // Task Prompt Templates
  // ===========================================================================
  taskPromptTemplates: {
    list: 'task-prompt-templates:list',
    get: 'task-prompt-templates:get',
    getEffective: 'task-prompt-templates:get-effective',
    getBuiltinDefault: 'task-prompt-templates:get-builtin-default',
    create: 'task-prompt-templates:create',
    update: 'task-prompt-templates:update',
    delete: 'task-prompt-templates:delete',
    setDefault: 'task-prompt-templates:set-default',
    ensureDefault: 'task-prompt-templates:ensure-default',
  },

  // ===========================================================================
  // Custom Prompts
  // ===========================================================================
  customPrompts: {
    list: 'custom-prompts:list',
    get: 'custom-prompts:get',
    create: 'custom-prompts:create',
    update: 'custom-prompts:update',
    delete: 'custom-prompts:delete',
    execute: 'custom-prompts:execute',
    ensureBuiltins: 'custom-prompts:ensure-builtins',
  },

  // ===========================================================================
  // Worktrees
  // ===========================================================================
  worktree: {
    getByProject: 'worktree:get-by-project',
    getByPlanItem: 'worktree:get-by-plan-item',
    openEditor: 'worktree:open-editor',
    getStatus: 'worktree:get-status',
    delete: 'worktree:delete',
    push: 'worktree:push',
    destroy: 'worktree:destroy',
  },

  // ===========================================================================
  // Dev Sessions
  // ===========================================================================
  devSession: {
    getByProject: 'dev-session:get-by-project',
    getByProjectWithPlanItems: 'dev-session:get-by-project-with-plan-items',
    getActive: 'dev-session:get-active',
    get: 'dev-session:get',
    hasActive: 'dev-session:has-active',
    updateStatus: 'dev-session:update-status',
    delete: 'dev-session:delete',
    destroy: 'dev-session:destroy',
    checkDirty: 'dev-session:check-dirty',
    getDiff: 'dev-session:get-diff',
    getCommitsAhead: 'dev-session:get-commits-ahead',
    updateName: 'dev-session:update-name',
    getMergeOrder: 'dev-session:get-merge-order',
    updateMergeOrder: 'dev-session:update-merge-order',
  },

  // ===========================================================================
  // GitHub (PR Management)
  // ===========================================================================
  github: {
    checkAuth: 'github:check-auth',
    createPr: 'github:create-pr',
    getPrStatus: 'github:get-pr-status',
    getPrComments: 'github:get-pr-comments',
    buildPrContext: 'github:build-pr-context',
    generatePrContent: 'github:generate-pr-content',
    buildAddressCommentsContext: 'github:build-address-comments-context',
    detectAndLinkPr: 'github:detect-and-link-pr',
    linkPr: 'github:link-pr',
    linkPrToItem: 'github:link-pr-to-item',
  },

  // ===========================================================================
  // Review Workflow
  // ===========================================================================
  review: {
    getInbox: 'review:get-inbox',
    refreshSession: 'review:refresh-session',
    assignOwnership: 'review:assign-ownership',
    assessThreads: 'review:assess-threads',
    draftPostImplReplies: 'review:draft-post-impl-replies',
    triggerAutomation: 'review:trigger-automation',
    replyToThread: 'review:reply-to-thread',
    resolveThread: 'review:resolve-thread',
    unresolveThread: 'review:unresolve-thread',
    ignoreTask: 'review:ignore-task',
    overrideDisposition: 'review:override-disposition',
    pollNow: 'review:poll-now',
    pollSession: 'review:poll-session',
  },

  // ===========================================================================
  // Storybook
  // ===========================================================================
  storybook: {
    updateUrl: 'storybook:update-url',
    testConnection: 'storybook:test-connection',
  },

  // ===========================================================================
  // Shell Operations
  // ===========================================================================
  shell: {
    openExternal: 'shell:open-external',
  },

  // ===========================================================================
  // Permission
  // ===========================================================================
  permission: {
    respond: 'permission:respond',
    list: 'permission:list',
    revoke: 'permission:revoke',
    revokeAll: 'permission:revoke-all',
  },

  // ===========================================================================
  // Project Context File (AGENTS.md / CLAUDE.md)
  // ===========================================================================
  claudeMd: {
    read: 'claudemd:read',
    write: 'claudemd:write',
  },

  // ===========================================================================
  // Prompt Overrides
  // ===========================================================================
  promptOverrides: {
    list: 'prompt-overrides:list',
    get: 'prompt-overrides:get',
    set: 'prompt-overrides:set',
    reset: 'prompt-overrides:reset',
  },

  // ===========================================================================
  // Performance Logging
  // ===========================================================================
  perf: {
    log: 'perf:log',
    getLogInfo: 'perf:get-log-info',
  },

  // ===========================================================================
  // Tool Log
  // ===========================================================================
  toolLog: {
    getEntries: 'toollog:get-entries',
    getSessionStats: 'toollog:get-session-stats',
    getInfo: 'toollog:get-info',
    setEnabled: 'toollog:set-enabled',
  },

  // ===========================================================================
  // Search
  // ===========================================================================
  search: {
    global: 'search:global',
  },

  // ===========================================================================
  // Confluence Document Sync
  // ===========================================================================
  confluence: {
    link: 'confluence:link',
    unlink: 'confluence:unlink',
    getLinks: 'confluence:links:get',
    getLinkForDocument: 'confluence:link:get-for-document',
    syncPreview: 'confluence:sync:preview',
    pushExecute: 'confluence:push:execute',
    pullExecute: 'confluence:pull:execute',
    parseUrl: 'confluence:parse-url',
  },

  // ===========================================================================
  // Slack Triage
  // ===========================================================================
  slack: {
    availability: {
      get: 'slack:availability:get',
    },
    links: {
      list: 'slack:links:list',
      create: 'slack:links:create',
      delete: 'slack:links:delete',
    },
    triage: {
      trigger: 'slack:triage:trigger',
      getPending: 'slack:triage:get-pending',
      getAll: 'slack:triage:get-all',
      countPending: 'slack:triage:count-pending',
      approve: 'slack:triage:approve',
      edit: 'slack:triage:edit',
      dismiss: 'slack:triage:dismiss',
      restore: 'slack:triage:restore',
      execute: 'slack:triage:execute',
    },
  },

  // ===========================================================================
  // Briefing
  // ===========================================================================
  briefing: {
    generate: 'briefing:generate',
    get: 'briefing:get',
    chunk: 'briefing:chunk',
  },

  // ===========================================================================
  // MCP Servers
  // ===========================================================================
  mcpServers: {
    listAvailable: 'mcp-servers:list-available',
    getPreferences: 'mcp-servers:get-preferences',
    setEnabled: 'mcp-servers:set-enabled',
  },

  // ===========================================================================
  // Debug
  // ===========================================================================
  debug: {
    setEnabled: 'debug:set-enabled',
    isEnabled: 'debug:is-enabled',
  },

  // ===========================================================================
  // Onboarding
  // ===========================================================================
  onboarding: {
    generate: 'onboarding:generate',
    saveContext: 'onboarding:save-context',
    saveContextDirectories: 'onboarding:save-context-directories',
    getContextDirectories: 'onboarding:get-context-directories',
  },

  // ===========================================================================
  // Agent Sessions (Board-Driven Execution)
  // ===========================================================================
  agentSession: {
    createAndStart: 'agent-session:create-and-start',
    startAgent: 'agent-session:start-agent',
    respond: 'agent-session:respond',
    followUp: 'agent-session:follow-up',
    stop: 'agent-session:stop',
    getActivities: 'agent-session:get-activities',
    getState: 'agent-session:get-state',
    getAvailableAgents: 'agent-session:get-available-agents',
    launchReview: 'agent-session:launch-review',
    generateCommitMessage: 'agent-session:generate-commit-message',
    commit: 'agent-session:commit',
    getCommitLog: 'agent-session:get-commit-log',
    getCommitFiles: 'agent-session:get-commit-files',
  },

  // ===========================================================================
  // Claude Usage Tracking
  // ===========================================================================
  usage: {
    getProjectStats: 'usage:get-project-stats',
    getGlobalStats: 'usage:get-global-stats',
    listEvents: 'usage:list-events',
    resetProject: 'usage:reset-project',
  },

  // ===========================================================================
  // Testing
  // ===========================================================================
  testing: {
    resetDatabase: 'testing:reset-database',
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
