# KPM Feature Catalog

What a user can do in KPM, grouped by product surface. Each entry says what the feature does and names the owning modules so an agent can find the code. It is a map, not a spec: read the code for behaviour details, [`core-principles.md`](core-principles.md) for why things are shaped the way they are, and the per-directory agent guides (`src/**/CLAUDE.md`) for conventions.

When a feature is added or removed, edit its entry in place. Don't record history here; git has it.

## Contents

- [App shell and navigation](#app-shell-and-navigation)
- [Planning](#planning)
- [Chat](#chat)
- [Workspace and documents](#workspace-and-documents)
- [Board execution](#board-execution)
- [Tracker integration](#tracker-integration)
- [Actions](#actions)
- [Settings](#settings)
- [Onboarding](#onboarding)
- [Diagnostics](#diagnostics)
- [UI surface map](#ui-surface-map)

---

## App shell and navigation

### Views and top bar
Two main views: **Workspace** (files, documents, and chat) and **Execute** (the plan board and agent runs), persisted per project. The top bar holds the project switcher, the view switcher, board filters, the tracker sync button, and the status badges described below.
- `src/renderer/components/layout/` (`Layout.tsx`, `TopBar.tsx`, `TopBarProjectSection.tsx`, `MainViewSwitcher.tsx`, `TopBarPlanningControls.tsx`)
- Keyboard shortcuts: `src/renderer/components/keyboard-shortcuts/KeyboardShortcuts.tsx` (also listed in Settings, Keyboard Shortcuts), handlers in `components/layout/hooks/useLayoutShortcuts.ts`

### Command palette (Cmd+K)
Fuzzy-searchable launcher for actions (see [Actions](#actions)), "Regenerate Project Context", and "Manage actions…". A chat action with a target opens a second page to pick the document or repo it runs against; the pick is attached as a focused resource.
- `src/renderer/components/command-palette/CommandPalette.tsx`, `src/renderer/stores/actionStore.ts`

### Global search (Cmd+Shift+F)
Full-text search over plan items and project markdown documents, with All / Tasks / Docs tabs. Picking a result opens the item on the board or the file in the workspace. Documents are re-indexed when files change.
- `src/main/services/core/SearchService.ts` (SQLite FTS5 index), `src/renderer/components/global-search/`, `src/renderer/stores/searchStore.ts`

### Terminal panel (Cmd+`)
A resizable panel of shell tabs at the bottom of the window, opened in the project's repo. Shells live in the main process, tagged to their project, and keep running across project switches.
- `src/main/services/streaming/TerminalService.ts`, `src/renderer/components/terminal/`, `src/renderer/stores/terminalStore.ts`

### Notification bell
A top-bar feed of things that happened while the user was elsewhere: action findings, pull request changes picked up by review polling, and board agents that finished, need attention, or paused. Entries click through to their target, switching project first if needed. Identical events close together collapse into one. The feed is in-memory only and there is no OS-level delivery.
- `src/main/services/core/UpdateEventBus.ts`, `NotificationService.ts`; `src/renderer/stores/notificationStore.ts`, `src/renderer/components/notifications/NotificationBadge.tsx`

### Background task badge
A top-bar indicator for long-running app tasks (today, AGENTS.md generation) that lets the user reopen the originating dialog.
- `src/renderer/components/background-tasks/BackgroundTaskBadge.tsx`, `src/renderer/stores/backgroundTaskStore.ts`

### Cross-project concurrency
Chats, board agents, and terminals keep running when the user switches projects. The project switcher marks projects with live work (amber when something is waiting on the user), a top-bar "N waiting" pill lists permission requests the user can't see from the current view (including other projects), and rejoining a chat mid-turn replays what streamed while away.
- `src/main/services/core/ActivityService.ts`, `src/renderer/stores/activityStore.ts`, `src/renderer/stores/permissionStore.ts`, `src/renderer/components/permission/PendingRequestsBadge.tsx`, `switch-project` in `src/renderer/stores/storeEvents.ts`

### Toasts
Transient success, warning, and error messages used across the app.
- `src/renderer/stores/toastStore.ts`, `src/renderer/components/ui/Toast.tsx`

---

## Planning

### Plan items
A project → feature → task hierarchy stored in SQLite. Items carry status, the Work Brief (below), tracker links, and repo targets. Users create items from the create modal (Cmd+Shift+I), edit them in the task edit modal, and delete them from the board; chat proposes creates, edits, reparenting, and deletes through plan actions. Reparenting has no direct UI.
- `src/main/services/core/PlanService.ts`, `src/main/db/domain/PlanActionService.ts`, `PlanItemService.ts`, `src/main/db/repositories/impl/PlanItemRepository.ts`
- `src/renderer/components/planning/CreateItemModal.tsx`, `TaskEditModal.tsx`; store `src/renderer/stores/project/planSlice.ts`
- Adding a field: follow the recipe in the root `CLAUDE.md` (`src/shared/planItemFields.ts`)

### Work Brief and Repository Scope
Title, description, intent, and acceptance criteria are edited together as one revisioned Work Brief; saves are guarded against concurrent edits. Only the description reaches Jira/Linear; intent and acceptance criteria stay local and guide execution. Repository Scope sets a primary connected repo plus optional affected repos; chat infers these when proposing an item, and the user can change them in the approval panel.
- `src/shared/workBrief.ts`, `src/renderer/components/planning/WorkBriefEditor.tsx`, `RepositoryScopeEditor.tsx`
- Execution picks up the latest approved brief automatically (see [Dev sessions](#dev-sessions))

### Relations
Items can depend on, block, or relate to other items; cycles are rejected. Relations are created and removed through chat (`modify_plan`) and read with `get_enriched_relations`. They drive merge-queue ordering; there is no dedicated relation editor.
- `src/main/db/repositories/impl/PlanRelationRepository.ts`, `src/main/kpmTools/tools/relations.ts`

### Board
Kanban columns for the six status categories (not started, in progress, in review, done, blocked, canceled). Dragging a card between columns is how the user sets status directly; dragging to In Progress starts an agent. Children nest under their parent card. The planning header filters by text, status, and people. Cmd/Shift-click multi-selects; the bulk menu offers edit (single item), add to chat context, queue for the tracker, and delete. Clicking a card opens the detail pane (see [Board execution](#board-execution)).
- `src/renderer/components/board-view/` (`BoardView.tsx`, `BoardColumn.tsx`, `BoardCard.tsx`, `dropBehavior.ts`)
- Host with shared modals, context menu, and selection: `src/renderer/components/planning/index.tsx`; `BulkActionsMenu.tsx`, `PlanCardMenu.tsx`

### Proposed changes and approval
Everything chat proposes (plan actions, document creates and edits, AGENTS.md edits, file moves and deletes, review replies) flows through one disposal path. In the default manual mode the proposals queue for review with diffs; with auto-apply (Settings, General, "Claude Changes") they apply as soon as they arrive.
- `src/renderer/stores/proposedChangeDisposal.ts`, `src/renderer/components/planning/PendingActionsPanel.tsx` (and the other `Pending*Panel.tsx`), `src/renderer/components/layout/ApprovalOverlays.tsx`
- Setting: `chat_approval_mode` in `src/shared/appSettings.ts`

### Plan references (`@plan/<uuid>`)
Markdown anywhere in KPM can reference a plan item with `@plan/<uuid>`. References render as chips, fold to titles in the editor, expand to full item context for agents, and are rewritten to native links at every export boundary so they never leak. Plan actions with unresolved references are rejected.
- `src/shared/planRefs.ts`, `src/main/documents/exportBoundary.ts`, `src/main/claude/contextRefs.ts`, `src/renderer/components/plan-ref/PlanRefChip.tsx`, `src/renderer/components/ui/planRefMonaco.tsx`
- See the "Touch `@plan/<uuid>` flow" recipe in the root `CLAUDE.md`

---

## Chat

### Chat sessions
Multiple named chat sessions per project, shown as tabs (Cmd+Shift+[ / ] to cycle). Each chat keeps its own provider (Claude, Codex, or pi), model, and effort, chosen in the composer; new chats start from the Settings defaults. Claude and Codex model lists are fetched from the providers at launch and cached, with a built-in list as fallback. Messages sent while a turn is running are queued and answered in order. The composer accepts dragged or pasted images, PDFs, and text files, shows a context-window meter, and offers `/` slash commands (Claude only: user commands, skills, and plugin commands). Tool activity streams live, and work that outlives a turn (background shells, subagents) shows in a strip below the transcript.
- Main: `src/main/services/streaming/StreamingSessionService.ts`, `src/main/services/core/ChatService.ts`, `src/main/chat/modelChoice/`, `src/main/providers/modelCatalog.ts`
- Providers: `ClaudeSdkSession`, `src/main/codex/CodexChatSession.ts`, `src/main/pi/PiChatSession.ts`; capabilities in `src/shared/providerCapabilities.ts`
- Renderer: `src/renderer/components/chat/`, `src/renderer/stores/chat/`, `src/renderer/stores/modelCatalogStore.ts`
- Attachments: `src/main/services/core/AttachmentService.ts`, `src/main/services/files/TempImageService.ts`, `src/renderer/services/attachmentService.ts`, image viewer in `src/renderer/components/image-viewer-modal/`
- Slash commands: `src/main/services/core/SlashCommandService.ts`, `SlashCommandMenu.tsx`

### Focused resources
Files, folders, repos, and plan items the user pins to a chat ("Add to context" from the file tree, board, or detail pane, or by dropping into the composer). They appear as chips above the composer and are sent with the next message; while a live session's selection is unchanged, later turns get a short reminder instead of the full content.
- `src/renderer/stores/project/uiSlice.ts`, `src/main/chat/prompts/focusedResources.ts`

### System prompt and prompt overrides
The chat system prompt is assembled from registry sections (grounding, tool guidance, plan rules, response style, AGENTS.md, and the current plan table) shared across providers. Users can override any registry prompt in Settings, Prompts, and optionally fold their `~/.claude/CLAUDE.md` into chat (Settings, General, "Global Instructions"). Task prompt templates (Settings, Prompts, Task Creation) shape how chat writes new tasks.
- `src/main/chat/prompts/` (`index.ts`, `promptRegistry.ts`, `workspace.ts`, `toolDocs.ts`), `src/main/claude/contextBuilders.ts`
- `src/main/services/core/PromptOverrideService.ts`, `TaskPromptTemplateService.ts`; `src/renderer/components/settings/PromptsSettings.tsx`

### KPM tools
In-process tools chat uses to read and propose against KPM and connected systems: plan items and relations, plan changes, documents and AGENTS.md, project files (list, move, delete), git history and branches, `git_push`, pull requests (`read_pull_request`, `generate_pr_description`), Jira, Confluence, Storybook, and paging through oversized tool results. Mutating tools only emit proposals.
- `src/main/kpmTools/tools/`, registered in `src/main/kpmTools/runtimeRegistry.ts`; documented to the model in `src/main/chat/prompts/toolDocs.ts`
- See the "Add a Claude tool" recipe in the root `CLAUDE.md`

### Project write grant
The first direct file, shell, or git write in a project asks once, inline, with any chat provider: "Don't allow" or "Always allow in this project". Allowing persists a per-project grant that covers every chat and background action run in that project until turned off in Settings, Writes, where it can also be turned on ahead of time. Reads are never gated, credential paths are always denied, and document edits go to the approval queue instead.
- `src/main/chat/writeGrants.ts`, `src/main/claude/permissions.ts`, `src/main/services/core/PermissionService.ts`, `PermissionPromptService.ts`
- `src/renderer/components/permission/PermissionPrompt.tsx`, `src/renderer/components/settings/PermissionsSettings.tsx`

### MCP servers
Settings, MCP Servers shows what the selected chat provider can reach. For Claude: claude.ai connectors and user servers (managed with `claude mcp add/remove`, listed read-only) and installed plugins (toggle per plugin). pi uses the servers in `~/.pi/agent/mcp.json` through a single gateway tool. MCP form elicitation prompts inline in chat.
- `src/main/services/core/McpDiscoveryService.ts`, `src/renderer/components/settings/McpServersSettings.tsx`, `src/renderer/stores/mcpServersStore.ts`

---

## Workspace and documents

### File explorer
The sidebar tree of connected repos and the project folder, kept current by a file watcher. Right-click to create files and folders, add to chat context, open in editor, reveal, copy the path, switch a repo's active worktree, or link and publish documents (Confluence, Linear). Repo rows show the current branch.
- `src/main/services/files/FileExplorerService.ts`, `ProjectWatcherService.ts`, `src/main/services/repo/RepoWatcherService.ts`
- `src/renderer/components/sidebar-tree/`, `src/renderer/stores/fileTreeStore.ts`

### Editor and document tabs
The workspace is chat-only until a file opens, then splits into editor plus chat. Markdown opens in the markdown editor with preview; other files open in Monaco, all editable. Every opened file stays as a tab (Cmd+Option+[ / ] to cycle, Cmd+W to close), tabs are remembered per project, and edits autosave shortly after typing stops, background tabs included. Open files follow external changes, renames, and deletions.
- `src/renderer/components/workspace/` (`WorkspaceView.tsx`, `DocumentTabStrip.tsx`, `FileEditor.tsx`, `useDocumentAutosave.ts`), `src/renderer/stores/workspaceStore.ts`
- `src/main/services/files/RepoFileService.ts`

### Project context file (AGENTS.md)
Each project folder has an AGENTS.md (a legacy CLAUDE.md is still read) that is fed into chat and board agent prompts. Project documents are plain markdown files in the project folder; there is no document database.
- `src/main/services/core/ContextFileService.ts`, `src/main/project-context/projectContextFile.ts`, `src/shared/contextFile.ts`
- Generation: see [Onboarding](#onboarding)

### Document proposals
Chat creates documents with `propose_document_create`, edits them with `propose_document_edit` (single or batched string replacements applied atomically), and edits AGENTS.md with `propose_context_edit`. All three go through the approval flow. Proposals open in a dialog with a diff against the file on disk.
- `src/main/kpmTools/tools/document-update.ts`, `document-edit.ts`, `context-file-update.ts`
- `src/renderer/components/planning/PendingDocumentPanel.tsx`, `src/renderer/components/markdown-document-modal/`, `src/renderer/components/ui/DiffViewer.tsx`

### Focus reader (Cmd+Shift+M)
A full-screen reading mode for a markdown file with a table of contents, in-document search, its own light/dark theme, and remembered reading position. A side chat scoped to that document keeps its own thread and follows the same write-grant and approval rules as main chat.
- `src/renderer/components/focus-mode/` (`FocusMode.tsx`, `FocusChatPanel.tsx`), `src/renderer/stores/focusModeStore.ts`
- Focus sessions: `chat_sessions.scope = 'focus_document'`; prompt via `buildFocusSystemPrompt` in `src/main/chat/prompts/index.ts`

### Confluence and Linear document publishing
A project document can be linked to a Confluence page (push or pull) or published to Linear as a document (push only; the file stays the source of truth). Every sync goes through a preview showing local vs. remote content and conflicts, and the write refuses to proceed if either side changed since the preview. Plan references are rewritten on the way out and restored on pull. Chat can look up a linked Confluence URL (`get_confluence_url`).
- `src/main/services/documentSync/DocumentSyncService.ts` (shared algorithm), `src/main/services/confluence/ConfluenceSyncService.ts`, `src/main/services/linearDocuments/LinearDocumentService.ts`
- `src/renderer/components/documentSync/DocumentSyncPreviewModal.tsx`, `src/renderer/components/confluence/`, `src/renderer/components/linearDocuments/` (publish chip shown in the file editor)

---

## Board execution

### Dev sessions
Starting a plan item (Play, or drag to In Progress) runs an implementation agent in an isolated git worktree on its own branch. The Start modal shows the current Work Brief, the repo (defaulting to the item's primary repo), the environment capture mode, the playbook, and optional extra instructions. Starting again reuses the latest session and worktree for that repo. Agents always work from the latest approved Work Brief. The detail pane has Activity (narrated tool activity), Changes (diff, commits, and an inline commit composer with a generated message), and Review tabs, plus a follow-up input and an overflow menu (open in editor, copy worktree path, Create PR, Run Review, PR content, link existing PR). Card badges show the automation phase.
- `src/main/services/repo/DevSessionService.ts`, `worktreeScaffold.ts`; `src/main/services/agents/` (`AgentSessionManager.ts`, `BoardAgentOrchestrator.ts`, `automationPhaseMachine.ts`)
- Agent backends: Claude, Codex, and pi SDK sessions, plus Gemini through its CLI (`CliAgentSession.ts`)
- `src/renderer/components/board-view/` (`AgentStartModal.tsx`, `DetailPane.tsx`, `ActivityTab.tsx`, `ChangesTab.tsx`, `CommitComposer.tsx`, `DetailChatInput.tsx`)
- Automation state is persisted in `dev_sessions.automation_phase` (see `src/main/services/agents/CLAUDE.md`)

### Execution playbooks
A playbook is the recipe a board run follows: ordered steps, each naming an agent fallback chain (or parallel runs, such as a two-lens review), a role prompt, a directive, and routing (review loop-backs with a pass limit, pause gates, whether a subagent may write). Built-ins: "Implement (no review)" (the default), "Implement + review", and "Implement test-first + deep review". Steps can follow the user's default model. Built-ins can be customized and reset; custom playbooks can be created, duplicated, and set as default in Settings, Playbooks, which also holds the Role instructions sub-tab. KPM owns worktree safety, persistence (a run keeps an immutable snapshot of its playbook), and terminal states. The detail pane's phase stepper shows progress and offers "one more pass", "proceed", or "resume" when a run pauses.
- `src/shared/playbooks.ts`, `src/shared/playbookRuntime.ts`, `src/main/services/core/PlaybookService.ts`, `src/main/services/agents/playbookStepRunner.ts`, `boardProviderRegistry.ts`
- `src/renderer/components/settings/PlaybooksSettings.tsx`, `src/renderer/components/board-view/PhaseStepper.tsx`

#### Drafting playbooks from chat
Main chat can create or change a playbook on request ("create a playbook that implements, loops review until clean, then simplifies, renames, and prunes comments"). `read_config` gives chat the current playbooks with a version token, the board providers and models, the prompt keys, and the step grammar; `propose_config_change` validates the full playbook and hands problems back to chat to fix before the user sees anything. A valid proposal always waits for review in the approval panel, even with auto-apply on, as a step-level diff (added, removed, and changed steps, routing, and an instructions text diff) marked "applies to all projects". Approve or reject only; to revise, ask chat. Approving an update is refused if the playbook changed after chat read it. There is no delete. The tools are hidden from doc focus mode and unreachable from action runs. Steps written by chat use prompt text only; the editor no longer offers skill steps, though existing ones still load and run.
- `src/shared/configKinds.ts`, `src/main/kpmTools/tools/config.ts`, `src/renderer/components/settings/PendingConfigPanel.tsx`, `src/renderer/stores/proposedChangeDisposal.ts` (`config` adapter)

### Automated review loop
When the playbook includes review, a reviewer agent inspects the diff and its findings go back to the implementer. Only critical and warning findings force another round; suggestions are addressed once. The reviewer sees what the implementer declined last round, the loop stops when a pass changes nothing or the pass limit is reached, and a failed review lens puts the run in needs-attention. Run Review in the detail pane triggers a review on demand.
- `src/main/services/agents/autoReview.ts`, `reviewOutputContract.ts`, `BoardAgentOrchestrator.ts`

### Pull requests
From the detail pane the user can create a PR (draft by default) or link an existing one, and generate a reviewer-oriented title and description from the branch diff, commit log, PR template, Work Brief, and optionally a project document for feature context. Push failures lead with a plain reason. Chat can read any PR by URL or number.
- `src/main/services/repo/GitHubService.ts`, `ghUtils.ts`; `src/main/kpmTools/tools/github.ts`, `git-push.ts`
- `src/renderer/components/development/` (`CreatePrModal.tsx`, `LinkPrDialog.tsx`, `LinkPrToItemDialog.tsx`, `GeneratePrContentModal.tsx`), `src/renderer/stores/devSessions/prSlice.ts`

### PR review threads
For a linked PR, KPM polls GitHub review threads, assesses each one, and shows them in the Review tab as a decision queue (next action, per-thread disposition: implement, push back, or needs input; latest verdict per reviewer). Replies can be written or delegated to the agent and are approved before posting. Each task opts in to having assessed comments addressed automatically by its agent.
- `src/main/services/repo/ReviewPollService.ts`, `ReviewService.ts`, `ReviewAssessmentService.ts`
- `src/renderer/components/development/ReviewTab.tsx`, `ReviewReplyApprovalPanel.tsx`

### Merge queue
Sessions with open, non-draft PRs appear in a queue above the board, ordered by plan dependencies with drag-to-reorder overrides. PRs whose dependencies aren't merged are marked blocked.
- `src/renderer/components/board-view/MergeQueuePanel.tsx`, `mergeQueue.ts`; `src/main/services/repo/mergeOrder.ts`

### Repository environment
Each connected repo can capture its shell environment for agents (auto, direnv, nix, or none), chosen per run in the Start modal, and can point chat at a specific worktree instead of the repo root.
- `src/main/services/repo/EnvironmentService.ts`, `RepoService.ts`; `src/renderer/components/sidebar-tree/RepoContextMenu.tsx`

---

## Tracker integration

### Connections and mappings
Jira and Linear credentials are stored in the OS keychain; both can be connected at once. A project is linked to a Jira project or Linear team through an association with a filter (JQL for Jira), status mappings, and custom field defaults. A type-mapping grid maps KPM levels (project, feature, task) to tracker issue types in both directions.
- `src/main/services/core/TrackerService.ts`, `src/main/trackers/TrackerClientService.ts`, `src/main/db/domain/TypeMappingService.ts`, `src/main/tracker-clients/{jira,linear}/`
- Settings, Workflow, Tracker (`src/renderer/components/settings/TrackerSettings.tsx`, `src/renderer/components/tracker/`)

### Sync and export
The top-bar "Jira Sync" / "Linear Sync" button opens the sync panel. Inbound, the user reviews tracker changes, resolves three-way conflicts, and decides what to do with items deleted in the tracker. Outbound, queued items go through an export review (status mappings, custom fields, per-item diffs) before anything is pushed. New issues are assigned to the user unless "Assign issues I export to me" is off (Settings, Workflow). Deleting a linked plan item stages a tracker deletion that is confirmed or cancelled in the export review. Import pulls matching issues in as plan items using the type mapping. Sync only runs when the user asks.
- `src/main/db/domain/SyncService.ts`, `ExportService.ts`, `ExportPlan.ts`, `ImportService.ts`, `PlanItemRemoval.ts`, `TrackerDeletionDrain.ts`
- `src/renderer/components/tracker/sync/` (`TrackerSyncPanel.tsx`, `SyncReviewPanel.tsx`, `SyncReviewModal.tsx`)
- Payloads pass through `toExternalMarkdown` (see the root `CLAUDE.md`)

### Jira chat tools
Chat can list Jira projects, search with JQL, fetch an issue, and compare an issue against its linked plan item. Linear has no chat tools.
- `src/main/kpmTools/tools/jira.ts`

### Storybook
A project can store a Storybook URL (Settings, Workflow, Storybook) so chat can list, inspect, and search components before planning UI work.
- `src/main/kpmTools/tools/storybook.ts`, `src/renderer/components/settings/StorybookSettings.tsx`

---

## Actions

An action is a saved prompt plus how it starts and what it may do. Triggers: manual, an interval, or an event (app opened, board agent finished, PR changed, ticket changed, branch changed); every action can also be run by hand. A capability grant (read project, read integrations, report a finding, write outputs, propose documents, propose plan changes) decides which tools the run gets and where results land: findings go to the notification bell and outputs to `outputs/actions/<name>.md`. Actions that propose changes run as a chat so proposals reach the approval queue; triggered actions can't propose. Managed in Settings, Actions and run from Cmd+K.
- `src/shared/actions.ts`, `src/main/services/core/ActionService.ts`, `actionCapabilities.ts`, `src/main/services/repo/ActionRunnerService.ts`
- `src/renderer/components/settings/ActionsSettings.tsx`, `src/renderer/stores/actionStore.ts`

---

## Settings

Settings tabs, in order: General (AI provider readiness, default chat provider and model, approval mode, global instructions), Appearance, Actions, Workflow (Tracker, Git branch naming, Storybook), Keyboard Shortcuts, Prompts, Playbooks, MCP Servers, Writes (project only), Usage. Tab identity lives in `src/renderer/components/settings/settingsTabs.tsx`; persisted keys in `src/shared/settingsRegistry.ts`.

### Themes
Built-in themes plus VS Code themes imported by URL, applied to the app, the editor, and diagrams, and set before first paint so launch doesn't flash.
- `src/shared/theme.ts` (single owner of theme colors; see the root `CLAUDE.md`), `src/main/services/core/CustomThemeService.ts`, `src/renderer/components/settings/ThemesSettings.tsx`

### Usage
Token usage and estimated cost by source and model, per project or across all projects, with a per-project reset.
- `src/main/services/core/ClaudeUsageService.ts`, `src/renderer/components/settings/UsageSettings.tsx`

---

## Onboarding

With no project open, a welcome pane offers "Open a repository" (creates a project named after the folder), "New project", recent projects, and agent setup. The create form takes a name, repositories, and an optional notes folder (a KPM-managed folder is used otherwise). Once a project exists, the workspace home offers to generate its AGENTS.md when it is missing or still the placeholder; "Regenerate Project Context" in Cmd+K reruns it. Generation runs in the background against the connected repos and ends in a diff review, or in the approval queue if the dialog was closed.
- `src/main/services/generation/OnboardingService.ts`
- `src/renderer/components/welcome/`, `src/renderer/components/onboarding/` (`CreateProjectModal.tsx`, `RegenerateContextModal.tsx`), `src/renderer/components/workspace/WorkspaceHome.tsx`

---

## Diagnostics

### Tool call log (Cmd+Shift+T)
A panel listing chat tool calls with inputs and referenced files.
- `src/main/services/toollog/ToolCallLogger.ts`, `src/renderer/components/tool-log/ToolLogPanel.tsx`

### Performance logging
Opt-in timing spans for project load, view switches, and plan refresh, enabled with `KPM_PERF=1`.
- `src/main/services/PerfLogger.ts`, `src/renderer/utils/perfLogger.ts`

---

## UI surface map

Component directories under `src/renderer/components/` and the features they surface.

| Directory | Surfaces |
|---|---|
| `layout/` | App shell, top bar, view switcher, approval overlays |
| `planning/` | Board host, create/edit modals, Work Brief and Repository Scope editors, bulk menu, pending-change panels |
| `board-view/` | Board, detail pane, Start modal, phase stepper, merge queue, commit composer |
| `development/` | PR create/link/generate dialogs, Review tab |
| `chat/` | Chat panel, session tabs, composer, model and effort controls, slash commands, background task strip |
| `workspace/` | Workspace layout, document tabs, file editor, workspace home |
| `sidebar/`, `sidebar-tree/` | Sidebar, repo and project file tree, context menus |
| `focus-mode/` | Focus reader and document chat |
| `markdown-document-modal/` | Markdown file dialog for proposals, with diff |
| `confluence/`, `linearDocuments/`, `documentSync/` | Document linking, publishing, and sync preview |
| `tracker/` | Tracker config dialogs, mappings, sync and export review |
| `settings/` | Settings modal and every tab |
| `command-palette/` | Cmd+K |
| `global-search/` | Global search |
| `terminal/` | Terminal panel |
| `notifications/`, `background-tasks/`, `permission/` | Top-bar bell, background task badge, write prompt and waiting-requests pill |
| `welcome/`, `onboarding/` | No-project landing, create project, AGENTS.md generation |
| `keyboard-shortcuts/`, `tool-log/`, `image-viewer-modal/` | Shortcut overlay, tool call log, image viewer |
| `plan-ref/`, `file-ref/` | Plan reference chips, file links in chat |
| `ui/`, `icons/` | Shared primitives and SVG icons |
