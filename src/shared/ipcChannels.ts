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
import { toNestedEventChannels } from './ipc/appEvents';
import { terminalEvents } from './ipc/terminalEvents';
import { planEndpoints } from './ipc/planEndpoints';
import { groupEndpoints } from './ipc/groupEndpoints';
import { exportEndpoints } from './ipc/exportEndpoints';
import { confluenceEndpoints } from './ipc/confluenceEndpoints';
import { linearDocumentsEndpoints } from './ipc/linearDocumentsEndpoints';
import { actionEndpoints } from './ipc/actionEndpoints';
import { trackerEndpoints } from './ipc/trackerEndpoints';
import { fileExplorerEndpoints } from './ipc/fileExplorerEndpoints';
import { repoFilesEndpoints } from './ipc/repoFilesEndpoints';
import { attachmentEndpoints } from './ipc/attachmentEndpoints';
import { tempImageEndpoints } from './ipc/tempImageEndpoints';
import { contextEndpoints } from './ipc/contextEndpoints';
import { searchEndpoints } from './ipc/searchEndpoints';
import { mcpServersEndpoints } from './ipc/mcpServersEndpoints';
import { usageEndpoints } from './ipc/usageEndpoints';
import { activityEndpoints } from './ipc/activityEndpoints';
import { chatEndpoints } from './ipc/chatEndpoints';
import { terminalEndpoints } from './ipc/terminalEndpoints';
import { settingsEndpoints } from './ipc/settingsEndpoints';
import { permissionEndpoints } from './ipc/permissionEndpoints';
import { promptOverridesEndpoints } from './ipc/promptOverridesEndpoints';
import { toolLogEndpoints } from './ipc/toolLogEndpoints';
import { storybookEndpoints } from './ipc/storybookEndpoints';
import { devSessionEndpoints } from './ipc/devSessionEndpoints';
import { agentSessionEndpoints } from './ipc/agentSessionEndpoints';
import { playbookEndpoints } from './ipc/playbookEndpoints';
import { reviewEndpoints } from './ipc/reviewEndpoints';
import { githubEndpoints } from './ipc/githubEndpoints';
import { projectEndpoints } from './ipc/projectEndpoints';
import { repoEndpoints } from './ipc/repoEndpoints';
import { taskPromptTemplateEndpoints } from './ipc/taskPromptTemplateEndpoints';
import { customThemeEndpoints } from './ipc/customThemeEndpoints';
import { themeEndpoints } from './ipc/themeEndpoints';
import { onboardingEndpoints } from './ipc/onboardingEndpoints';
import { perfEndpoints } from './ipc/perfEndpoints';
import { testingEndpoints } from './ipc/testingEndpoints';
import { shellEndpoints } from './ipc/shellEndpoints';

/**
 * Plan, group, export, confluence, and action channels are similarly derived
 * from their own endpoint registries in `shared/ipc/`.
 */
const planChannels = toNestedChannels(planEndpoints);

const groupChannels = toNestedChannels(groupEndpoints);

const exportChannels = toNestedChannels(exportEndpoints);

const confluenceChannels = toNestedChannels(confluenceEndpoints);

const linearDocumentChannels = toNestedChannels(linearDocumentsEndpoints);

const actionChannels = toNestedChannels(actionEndpoints);

/**
 * Tracker channels are derived from `trackerEndpoints` (the single owner of
 * channel string + payload schema per tracker endpoint) rather than
 * hand-declared here. See `shared/ipc/trackerEndpoints.ts`.
 */
const trackerChannels = toNestedChannels(trackerEndpoints);

/**
 * File explorer, repo files, attachment, temp image, context, and search
 * channels are similarly derived from their own endpoint registries
 * in `shared/ipc/`, rather than hand-declared here.
 */
const fileExplorerChannels = toNestedChannels(fileExplorerEndpoints);

const repoFilesChannels = toNestedChannels(repoFilesEndpoints);

const attachmentChannels = toNestedChannels(attachmentEndpoints);

const tempImageChannels = toNestedChannels(tempImageEndpoints);

const contextEndpointChannels = toNestedChannels(contextEndpoints);

const searchChannels = toNestedChannels(searchEndpoints);

const mcpServersChannels = toNestedChannels(mcpServersEndpoints);

const activityChannels = toNestedChannels(activityEndpoints);

const usageChannels = toNestedChannels(usageEndpoints);

const chatChannels = toNestedChannels(chatEndpoints);

const terminalChannels = toNestedChannels(terminalEndpoints);

const settingsChannels = toNestedChannels(settingsEndpoints);

const permissionChannels = toNestedChannels(permissionEndpoints);

const promptOverridesChannels = toNestedChannels(promptOverridesEndpoints);

const toolLogChannels = toNestedChannels(toolLogEndpoints);

const storybookChannels = toNestedChannels(storybookEndpoints);

const devSessionChannels = toNestedChannels(devSessionEndpoints);

const agentSessionChannels = toNestedChannels(agentSessionEndpoints);

const playbookChannels = toNestedChannels(playbookEndpoints);

const reviewChannels = toNestedChannels(reviewEndpoints);

const githubChannels = toNestedChannels(githubEndpoints);

const projectChannels = toNestedChannels(projectEndpoints);

const repoChannels = toNestedChannels(repoEndpoints);

const taskPromptTemplateChannels = toNestedChannels(taskPromptTemplateEndpoints);

const customThemeChannels = toNestedChannels(customThemeEndpoints);

const themeChannels = toNestedChannels(themeEndpoints);

const onboardingEndpointChannels = toNestedChannels(onboardingEndpoints);

const perfChannels = toNestedChannels(perfEndpoints);

const testingChannels = toNestedChannels(testingEndpoints);

const shellEndpointChannels = toNestedChannels(shellEndpoints);

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
  // Theme (window-background appearance reporting)
  // ===========================================================================
  theme: themeChannels,

  // ===========================================================================
  // Task Prompt Templates
  // ===========================================================================
  taskPromptTemplates: taskPromptTemplateChannels,

  // ===========================================================================
  // Custom Prompts
  // ===========================================================================
  // `custom-prompt:progress`/`custom-prompt:complete`/`custom-prompt:error`
  // (main-to-renderer events) are not invoke endpoints — they live in
  // `shared/ipc/customPromptEvents.ts`, not here.
  actions: actionChannels,

  // ===========================================================================
  // Worktrees
  // ===========================================================================

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
  // `permission:request` (main-to-renderer event) is not an invoke
  // endpoint — it lives in `shared/ipc/permissionEvents.ts`, not here.
  permission: permissionChannels,

  // ===========================================================================
  // Project Context File (AGENTS.md / CLAUDE.md)
  // ===========================================================================
  contextFile: contextEndpointChannels.contextFile,

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
  // `toollog:call`/`toollog:turn-summary` (broadcast events) are not
  // invoke endpoints — they live in `shared/ipc/toolLogEvents.ts`, not here.
  toolLog: toolLogChannels,

  // ===========================================================================
  // Search
  // ===========================================================================
  search: searchChannels,

  // ===========================================================================
  // Confluence Document Sync
  // ===========================================================================
  confluence: confluenceChannels,
  linearDocuments: linearDocumentChannels,

  // ===========================================================================
  // MCP Servers
  // ===========================================================================
  mcpServers: mcpServersChannels,

  // ===========================================================================
  // Onboarding
  // ===========================================================================
  // `onboarding:progress`/`onboarding:thinking`/`onboarding:complete`/
  // `onboarding:error` (main-to-renderer events) are not invoke endpoints —
  // they live in `shared/ipc/onboardingEvents.ts`, not here.
  onboarding: onboardingEndpointChannels,

  // ===========================================================================
  // Agent Sessions (Board-Driven Execution)
  // ===========================================================================
  agentSession: agentSessionChannels,
  playbook: playbookChannels,

  // ===========================================================================
  // Claude Usage Tracking
  // ===========================================================================
  usage: usageChannels,

  // ===========================================================================
  // Cross-Project Activity
  // ===========================================================================
  activity: activityChannels,

  // ===========================================================================
  // Testing
  // ===========================================================================
  testing: testingChannels,

  // ===========================================================================
  // Embedded Developer Terminal
  // ===========================================================================
  terminal: {
    ...terminalChannels,
    // PTY output/exit events (`webContents.send` / `ipcRenderer.on`), not
    // invoke endpoints — derived from `terminalEvents` (`shared/ipc/terminalEvents.ts`).
    ...(toNestedEventChannels(terminalEvents)),
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
