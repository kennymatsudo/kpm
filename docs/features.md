# KPM Feature Index

An index of what a user can do in KPM and where the code lives. Read the code for behavior, [`core-principles.md`](core-principles.md) for why, and `src/**/AGENTS.md` for conventions. When you add a product surface, add one line under its area (feature, what the user can do, owning path).

## App shell

- **Views and top bar**: switch between Workspace and Execute per project; project switcher, board filters, sync button, status badges. `src/renderer/components/layout/`
- **Keyboard shortcuts**: full list in `src/renderer/components/keyboard-shortcuts/KeyboardShortcuts.tsx`; handlers in `src/renderer/components/layout/hooks/useLayoutShortcuts.ts`.
- **Command palette (Cmd+K)**: launch actions and "Regenerate Project Context". `src/renderer/components/command-palette/`
- **Global search (Cmd+Shift+F)**: full-text search over plan items and project documents. `src/main/services/core/SearchService.ts`, `src/renderer/components/global-search/`
- **Terminal panel (Cmd+`)**: shell tabs in the project's repo that survive project switches. `src/main/services/streaming/TerminalService.ts`, `src/renderer/components/terminal/`
- **Notification bell**: feed of findings, PR changes, and board agent events; in-memory only, no OS-level delivery. `src/main/services/core/NotificationService.ts`, `src/renderer/components/notifications/`
- **Background task badge**: reopen the dialog of a long-running task. `src/renderer/components/background-tasks/`
- **Cross-project concurrency**: chats, board agents, and terminals keep running across project switches; the waiting-requests pill lists permission requests from any project. `src/main/services/core/ActivityService.ts`, `src/renderer/components/permission/PendingRequestsBadge.tsx`
- **Toasts**: transient messages. `src/renderer/stores/toastStore.ts`

## Planning

- **Plan items**: project, feature, task hierarchy with status, tracker links, and repo targets; chat proposes reparenting, which has no direct UI. `src/main/services/core/PlanService.ts`, `src/main/db/domain/PlanActionService.ts`, `src/renderer/components/planning/`
- **Work Brief and Repository Scope**: edit title, description, intent, and acceptance criteria as one revisioned brief; only the description reaches Jira or Linear. `src/shared/workBrief.ts`, `src/renderer/components/planning/WorkBriefEditor.tsx`
- **Relations**: depend on, block, or relate items through chat; there is no dedicated relation editor. `src/main/db/repositories/impl/PlanRelationRepository.ts`, `src/main/kpmTools/tools/relations.ts`
- **Board**: kanban by status category; drag to change status, drag to In Progress to start an agent. `src/renderer/components/board-view/`
- **Proposed changes and approval**: everything chat proposes is queued for review or auto-applied per setting (`chat_approval_mode`). `src/renderer/stores/proposedChangeDisposal.ts`, `src/renderer/components/planning/PendingActionsPanel.tsx`
- **Plan references (`@plan/<uuid>`)**: chips in markdown, rewritten at every export boundary. `src/shared/planRefs.ts`, `src/main/documents/exportBoundary.ts`, `src/renderer/components/plan-ref/`

## Chat

- **Chat sessions**: multiple tabbed chats per project, each with its own provider (Claude, Codex, or pi), model, and effort; queued messages, image and file attachments, `/` slash commands (Claude only), Codex and pi cannot read PDFs. `src/main/services/streaming/StreamingSessionService.ts`, `src/main/claude/streaming/StreamingSession.ts`, `src/main/codex/CodexChatSession.ts`, `src/main/pi/PiChatSession.ts`, `src/renderer/components/chat/`
- **Model catalog**: model lists fetched at launch with a built-in fallback. `src/main/providers/modelCatalog.ts`, `src/shared/providerCapabilities.ts`
- **Focused resources**: pin files, folders, repos, and plan items to the next message. `src/main/chat/prompts/focusedResources.ts`, `src/renderer/stores/project/uiSlice.ts`
- **System prompt and overrides**: override any registry prompt in Settings, Prompts; optionally include `~/.claude/CLAUDE.md`. `src/main/chat/prompts/`, `src/main/services/core/PromptOverrideService.ts`
- **KPM tools**: in-process tools chat uses for plan, documents, files, git, PRs, Jira, and Confluence. `src/main/kpmTools/runtimeRegistry.ts`
- **Publishing grant**: `git_push` and PR writes ask once per project; revoke in Settings, Publishing. Other chat writes follow the user's own harness settings. `src/main/chat/writeGrants.ts`, `src/renderer/components/permission/PermissionPrompt.tsx`
- **MCP servers**: see what the selected provider can reach; Claude user servers are read-only here (managed with `claude mcp`). `src/main/services/core/McpDiscoveryService.ts`, `src/renderer/components/settings/McpServersSettings.tsx`

## Workspace and documents

- **File explorer**: repo and project file tree with context menus and worktree switching. `src/main/services/files/FileExplorerService.ts`, `src/renderer/components/sidebar-tree/`
- **Editor and document tabs**: markdown editor with preview, Monaco for other files, autosave, tabs remembered per project. `src/renderer/components/workspace/`, `src/main/services/files/RepoFileService.ts`
- **Project context file (AGENTS.md)**: fed into chat and board prompts; documents are plain files, there is no document database. `src/main/services/core/ContextFileService.ts`, `src/main/project-context/projectContextFile.ts`
- **Document proposals**: chat creates and edits documents and AGENTS.md through approval with a diff. `src/main/kpmTools/tools/document-update.ts`, `document-edit.ts`, `context-file-update.ts`, `src/renderer/components/markdown-document-modal/`
- **Focus reader (Cmd+Shift+M)**: full-screen reading mode with a document-scoped side chat. `src/renderer/components/focus-mode/`
- **Confluence and Linear publishing**: link a document to Confluence (push or pull) or publish to Linear (push only), through a preview. `src/main/services/documentSync/DocumentSyncService.ts`, `src/main/services/confluence/ConfluenceSyncService.ts`, `src/main/services/linearDocuments/LinearDocumentService.ts`

## Board execution

- **Dev sessions**: Play runs an implementation agent in an isolated worktree; detail pane has Activity, Changes, and Review tabs; attach an outside worktree or link an existing PR (chat does both through `propose_board_change`). Backends: Claude, Codex, pi, and Gemini CLI. `src/main/services/repo/DevSessionService.ts`, `src/main/services/agents/`, `src/renderer/components/board-view/`
- **Board Claude session class**: `ClaudeSdkSession` is the board agent session, not chat. `src/main/services/agents/ClaudeSdkSession.ts`
- **Execution playbooks**: ordered steps with agent fallback chains, review loops, and pause gates; built-ins plus custom, edited in Settings, Playbooks. `src/shared/playbooks.ts`, `src/main/services/core/PlaybookService.ts`, `src/main/services/agents/playbookStepRunner.ts`, `src/renderer/components/settings/PlaybooksSettings.tsx`
- **Drafting playbooks from chat**: chat creates or changes a playbook with `read_config` and `propose_config_change`; always queued for review, approve or reject only, and there is no delete. The tools are hidden from doc focus mode and unreachable from action runs. Steps written by chat use prompt text only, because skills are found only in `~/.claude/skills`, load differently per provider, and are read from disk at step start, which would break the run's snapshot. `src/shared/configKinds.ts`, `src/main/kpmTools/tools/config.ts`, `src/renderer/components/settings/PendingConfigPanel.tsx`
- **Automated review loop**: reviewer findings go back to the implementer; Run Review triggers one on demand. `src/main/services/agents/autoReview.ts`, `reviewOutputContract.ts`
- **Pull requests**: create (draft by default) or link a PR and generate its title and description; chat finds and reads PRs and edits them after the publishing grant. `src/main/services/repo/GitHubService.ts`, `src/main/kpmTools/tools/github.ts`, `github-writes.ts`, `git-push.ts`, `src/renderer/components/development/`
- **PR review threads**: polled threads are assessed and shown as a decision queue; replies are approved before posting. `src/main/services/repo/ReviewPollService.ts`, `ReviewAssessmentService.ts`, `src/renderer/components/development/ReviewTab.tsx`
- **Merge queue**: open PRs ordered by plan dependencies. `src/main/services/repo/mergeOrder.ts`, `src/renderer/components/board-view/MergeQueuePanel.tsx`
- **Repository environment**: capture a repo's shell environment for agents (auto, direnv, nix, none). `src/main/services/repo/EnvironmentService.ts`

## Tracker integration

- **Connections and mappings**: Jira and Linear credentials in the OS keychain, project associations, status and type mappings. `src/main/services/core/TrackerService.ts`, `src/main/tracker-clients/{jira,linear}/`, `src/renderer/components/settings/TrackerSettings.tsx`
- **Sync and export**: inbound review with conflict resolution, outbound export review, import as plan items; sync only runs when the user asks. `src/main/db/domain/SyncService.ts`, `ExportService.ts`, `ImportService.ts`, `src/renderer/components/tracker/sync/`
- **Jira chat tools**: list projects, search with JQL, fetch an issue, compare with its plan item. Linear has no chat tools. `src/main/kpmTools/tools/jira.ts`

## Actions

- **Actions**: saved prompts run manually, on an interval, or on an event, with a capability grant; findings go to the bell and outputs to `outputs/actions/<name>.md`; triggered actions cannot propose changes. Managed in Settings, Actions. `src/shared/actions.ts`, `src/main/services/core/ActionService.ts`, `src/main/services/repo/ActionRunnerService.ts`

## Settings

Tab identity and order live in `src/renderer/components/settings/settingsTabs.tsx`; persisted keys in `src/shared/settingsRegistry.ts`.

- **Themes**: built-in and imported VS Code themes. `src/shared/theme.ts`, `src/renderer/components/settings/ThemesSettings.tsx`
- **Usage**: token usage and estimated cost; Codex runs show cost as a dash. `src/main/services/core/ClaudeUsageService.ts`, `src/renderer/components/settings/UsageSettings.tsx`

## Onboarding

- **Welcome and project creation**: open a repository, create a project, generate AGENTS.md in the background. `src/main/services/generation/OnboardingService.ts`, `src/renderer/components/welcome/`, `src/renderer/components/onboarding/`

## Diagnostics

- **Tool call log (Cmd+Shift+T)**: chat tool calls with inputs. `src/main/services/toollog/ToolCallLogger.ts`, `src/renderer/components/tool-log/`
- **Performance logging**: opt-in timing spans with `KPM_PERF=1`. `src/main/services/PerfLogger.ts`
