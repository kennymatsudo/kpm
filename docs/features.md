# KPM Feature Catalog

Comprehensive inventory of all features in the KPM Electron app, organized by domain. Each feature includes its implementation locations, UI surfaces, external integrations, and maturity signals.

## Purpose of this Document

This catalog is a working reference for three jobs:

1. **Keep-or-kill decisions** — for each feature, the code locations, maturity signal, and dependency list give enough information to assess cost of upkeep vs. value delivered. See "Organizational Patterns" and "Gaps & Orphaned Features" at the end for a first pass.
2. **Feature showcase** — the feature descriptions and entry points can be lifted into demo scripts, onboarding docs, release notes, or a marketing site. Each entry is written so a non-author can understand what the feature is without reading the code.
3. **UI-to-feature mapping** — the "UI Surface Map" section pairs each component directory (`planning/`, `board-view/`, `workspace/`, etc.) with the features it surfaces. Use it when planning redesigns, extracting component ownership, or identifying dead UI that no longer ties to a live feature.

Feature numbers (`### 1.`, `### 2.` …) are stable IDs used throughout this doc for cross-references — do not renumber when adding features; append to the end. When merging narrow features into a higher-level one, keep the surviving number and retire the others (never reuse a retired number); log the merge in "Summary."

## Feature Evaluation Criteria

When deciding whether to keep, invest in, or sunset a feature, cross-check against the four criteria from `core-principles.md`:

1. **Does it maintain context continuity?** (Discovery → planning → execution → artifacts)
2. **Does it keep planning out of the repo?** (Data lives in SQLite, not `.md` files in the code tree)
3. **Does it serve the individual developer?** (Not team collaboration — that belongs in Jira)
4. **Does it help communicate outward?** (Artifacts for stakeholders, not live sharing)

A feature that scores low on all four is a candidate for removal even if it is technically sound.

## Table of Contents

**Feature Groups**

Numbers have gaps where features were merged into a higher-level entry or removed — see "Summary" for the consolidation log. Don't reuse a retired number.

1. [Planning & Plan Management](#planning--plan-management) (1–5, 9, 10)
2. [Chat & Claude Integration](#chat--claude-integration) (11–13, 17)
3. [Agentic Task Execution (Board)](#agentic-task-execution-board) (19, 23, 25, 105)
4. [Tracker Integration](#tracker-integration-jiralinear) (27, 31, 33, 35)
5. [Documents & Context](#documents--context) (38, 40, 106)
6. [Artifacts & Generation](#artifacts--generation) (43)
7. [Global Search & Navigation](#global-search--navigation) (50–52)
8. [Confluence Integration](#confluence-integration) (53)
9. [Agent Sessions & Orchestration](#agent-sessions--orchestration) (57, 59, 104)
10. [Settings & Configuration](#settings--configuration) (61, 62, 64, 65)
11. [File & Workspace Management](#file--workspace-management) (68, 69, 73)
12. [Notifications & Updates](#notifications--updates) (74, 107, 110)
13. [Onboarding & Initial Setup](#onboarding--initial-setup) (76)
14. [Debugging & Monitoring](#debugging--monitoring) (77, 79)
15. [Recently Audited Additions](#recently-audited-additions) (96, 97, 99, 101, 102)

**Reference Sections**
- [UI Surface Map](#ui-surface--feature-map) — component directory → feature
- [Cross-Cutting Infrastructure & Patterns](#cross-cutting-infrastructure--patterns) — features 83–95 (non-user-facing)
- [Organizational Patterns](#organizational-patterns) — by maturity, complexity, user touchpoints, dependency scope
- [Gaps & Orphaned Features](#gaps--orphaned-features) — candidates for investment or removal

---

## Planning & Plan Management

### 1. Plan Item Hierarchy (Project → Feature → Task)
- **What it does:** Organizes work into a three-level hierarchy (project/feature/task labels). Users create, edit, reorder, reparent, and delete items; items carry status, description, intent, acceptance criteria, external tracker links, release tags, completion timestamps, and KPM-local repo targets (one primary connected repo plus optional affected repos). Chat providers infer repo targets when proposing an item, and the user can change them in the approval panel before the item is created.
- **Key code locations:**
  - Services: `src/main/services/core/PlanService.ts`, `src/main/db/domain/PlanActionService.ts`, `src/main/db/domain/PlanItemService.ts`, `src/main/db/repositories/impl/PlanItemRepository.ts`
  - Claude tools: `src/main/kpmTools/tools/plan-items.ts`, `src/main/kpmTools/tools/plan-changes.ts`
  - IPC handlers: `src/main/ipc/handlers/plan.ts`
  - Stores: `src/renderer/stores/project/planSlice.ts`
  - Components: `src/renderer/components/board-view/BoardView.tsx`, `src/renderer/components/planning/CreateItemModal.tsx`
- **Entry points / surfaces:**
  - Board view: kanban columns by status category, children nested under their parent card, right-click a card for CRUD
  - Create item modal: title-only quick create, with an expanded Work Brief, Repository Scope, and operational controls
  - Task edit modal: unified Work Brief and Repository Scope editing with revision-guarded atomic saves
- **Dependencies / integrations:**
  - SQLite: `plan_items` table with parent_id, label, status, external_key fields; `plan_item_repositories` stores primary/affected connected repo targets
  - Jira/Linear: plan items link to external tracker issues via external_key and `kpm_tracker_associations`
  - SQLite: `completed_at` is set/cleared by `PlanItemRepository` when items move to/from done; no feature currently reads it
  - Claude SDK: in-process tools for querying, creating, updating plan items (with user approval gate)
- **Maturity signal:** Mature. Core to app. Full CRUD, performance optimized with perf logging. Reparenting is no longer exposed in the UI — it goes through the chat tools or the API.

### 2. Work Brief and Repository Scope (Intent, Description, Acceptance Criteria, Repos)
- **What it does:** Treats title, description, intent, and acceptance criteria as one revisioned Work Brief while keeping Repository Scope separate. Expanded create and edit forms use the same controlled editors; edits submit one atomic action batch with a revision guard for Work Brief changes. Description can sync to Jira/Linear, while intent and acceptance criteria guide execution. `source_document_id` remains a non-UI breadcrumb to discovery context.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/PlanItemRepository.ts` (Work Brief compare-and-revise and repo target persistence)
  - Types and schemas: `src/shared/base-types.ts`, `src/shared/workBrief.ts`, `src/shared/planActionSchema.ts`
  - Claude tool: `src/main/kpmTools/tools/plan-changes.ts`
  - Components: `WorkBriefEditor.tsx`, `RepositoryScopeEditor.tsx`, `CreateItemModal.tsx`, `TaskEditModal.tsx`, and focused approval action details under `components/planning/action-details/`
- **Entry points / surfaces:**
  - Expanded create modal and Plan Item edit modal
  - Proposed-change approval details, including Work Brief diffs and editable connected-repo names
  - Agent context builder (`DevSessionService.buildAgentContext`): the Work Brief defines the captured execution contract
- **Dependencies / integrations:**
  - Tracker export: title and context can sync; intent, criteria, and Repository Scope stay KPM-local
  - Dev sessions: new sessions capture the Work Brief revision; reused sessions and follow-up turns automatically reconcile to the latest approved revision
  - PR description generation (feature 25): `GitHubService` includes intent and acceptance criteria in generation context
- **Maturity signal:** Mature. Follow-on ideas (per-criterion status ticking, doc→plan breadcrumb UI) are deliberately not built.

### 3. Plan Item Relations (Dependencies, Blockers, Related)
- **What it does:** Link plan items via three relation types: depends_on (blocking dependencies), blocks (what this item blocks), relates_to (loose associations). Users query and modify relations; system prevents circular dependencies.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/PlanRelationRepository.ts`
  - Claude tools: `src/main/kpmTools/tools/relations.ts` (read), `src/main/kpmTools/tools/plan-changes.ts` (modify: AddDependencyAction, RemoveDependencyAction)
  - IPC handlers: `src/main/ipc/handlers/plan.ts`
  - Stores: `src/renderer/stores/project/planSlice.ts`
  - Components: Plan card shows dependency summary; dedicated relation editor not yet in UI
- **Entry points / surfaces:**
  - Plan card detail panel: shows "blocked by" and "blocks" with titles and status
  - Claude tool: `get_enriched_relations` for querying
  - Claude tool: `modify_plan` with AddDependency/RemoveDependency actions
- **Dependencies / integrations:**
  - SQLite: `plan_relations` table (from_item_id, to_item_id, relation_type)
  - Sync service: three-way conflict detection considers linked items
- **Maturity signal:** Mature. Read-heavy. Circular dependency checks in place. No dedicated UI for managing relations yet (only via Claude or API).

### 4. Plan Item Status Tracking (Status Categories: not_started, in_progress, in_review, done, blocked, canceled)
- **What it does:** Each plan item has a status within one of six categories. The board filters and organizes by status. Status transitions trigger tracker sync queuing and event notifications to listeners.
- **Key code locations:**
  - DB: `src/main/db/domain/PlanActionService.ts` (`executeUpdateItem`), `src/main/db/repositories/impl/PlanItemRepository.ts` (`updateStatusCategory`)
  - IPC handlers: `src/main/ipc/handlers/plan.ts` (updateItemStatus)
  - Stores: `src/renderer/stores/project/planSlice.ts` (statusChanged event)
  - Components: `src/renderer/components/board-view/BoardView.tsx` (column drop handling), `src/renderer/components/board-view/dropBehavior.ts`
  - Events: `src/renderer/stores/storeEvents.ts` (status-changed event)
- **Entry points / surfaces:**
  - Board view: columns organized by status category; dragging a card between columns is the only way a user sets status directly
  - Agent execution and tracker sync move items on their own (start implementation → in_progress, review handoff → in_review)
- **Dependencies / integrations:**
  - Tracker sync: `queueTrackerUpdateIfNeeded` called on status change
  - `completed_at`: stamped on transition to done and cleared on transition away (`PlanItemRepository`)
- **Maturity signal:** Mature. Core feature, well-tested status flow.

### 5. Plan View (Board)
- **What it does:** One renderer over `plan_items`: kanban columns fixed to the six status categories (not_started, in_progress, in_review, done, blocked, canceled). Dragging a card between columns changes its status, children nest under their parent card behind a per-card toggle, and clicking a card opens a detail pane that — for plan items with an active or past dev session — also surfaces implementation activity, diffs, and PR info (see Agentic Task Execution). Two alternate views were removed: a free-form spatial canvas (with Visual Groups and per-item positions) and a Tree outline. With the outline went the view switcher, the click-to-set status dropdown, and drag-to-reparent.
- **Key code locations:**
  - Board: `src/renderer/components/board-view/BoardView.tsx`, `BoardColumn.tsx`, `BoardCard.tsx`, `dropBehavior.ts`; detail-pane activity/diff tabs in `ActivityTab.tsx`, `ChangesTab.tsx`
  - Host: `src/renderer/components/planning/index.tsx` (`PlanView` — shared modals, context menu, selection)
  - Store: `src/renderer/stores/project/planSlice.ts` (hierarchy and status)
- **Entry points / surfaces:**
  - Planning header: search, status filter, people filter, selection count
  - Board: drag between columns, right-click menu, double-click to edit, click card for detail pane (Activity/Changes/Review tabs for dev sessions)
- **Dependencies / integrations:**
  - Detail pane pulls in dev-session state (`dev_sessions.automation_phase`) and GitHub PR info for active work
  - Multi-select coordinates with Bulk Plan Actions (feature 9)
- **Maturity signal:** Mature. The automation-phase state machine behind the cards is the behaviorally complex part.

### 9. Bulk Plan Actions (Create Multiple Items, Reparent, Delete)
- **What it does:** Multi-select plan items and perform batch operations: delete, reparent to a new parent, update status, apply labels. Actions flow through approval queue.
- **Key code locations:**
  - Component: `src/renderer/components/planning/BulkActionsMenu.tsx`
  - Dialog: `src/renderer/components/planning/BulkDeleteConfirmDialog.tsx`
  - Service/approval: Handled by `PlanActionService` and `useProposedChangeDisposal`
  - Store: `src/renderer/stores/project/planSlice.ts` (multi-select state)
- **Entry points / surfaces:**
  - Cmd+click (or Shift+click) to multi-select, right-click for bulk menu
  - Confirmation dialogs before destructive operations
- **Dependencies / integrations:**
  - Approval queue: bulk operations are submitted as plan actions for user confirmation
- **Maturity signal:** Mature. Multi-select and bulk ops well-tested.

### 10. Plan Item Approval Flow (Pending Actions Panel, Auto-Apply Setting)
- **What it does:** By default, all plan modifications proposed by Claude are queued for user review before execution. Unified approval queue handles plan actions, document updates, and implementation proposals. Users review diff and approve/reject. A global setting (`chat_approval_mode`: `manual` | `auto_apply`) lets a user turn off the review step entirely — in `auto_apply` mode the same proposals are applied atomically as soon as they arrive instead of queuing, and the system prompt tells Claude not to mention an approval step.
- **Key code locations:**
  - Service: `src/main/db/domain/PlanActionService.ts` (action execution after approval)
  - Store: `src/renderer/stores/proposedChangeDisposal.ts` (unified queue for all proposal types; the global approval mode determines whether a proposal queues or applies immediately)
  - Setting: `src/shared/appSettings.ts` (`CHAT_APPROVAL_MODE_KEY = 'chat_approval_mode'`)
  - Component: `src/renderer/components/planning/PendingActionsPanel.tsx`
  - Component: `src/renderer/components/layout/ApprovalOverlays.tsx` (modal for reviewing)
  - Component: `src/renderer/components/settings/GeneralSettings.tsx` (`handleApprovalToggle`; "Review required" / "Auto-apply" status badge)
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts` (tracks tool calls)
- **Entry points / surfaces:**
  - Pending actions panel (right sidebar or overlay modal) in manual mode
  - Item-by-item review with "Approve" / "Reject" buttons
  - Diff view for document updates
  - Settings → General: toggle between manual review and auto-apply
- **Dependencies / integrations:**
  - Claude SDK: tool proposals emit PlanActions that trigger approval (or immediate application in auto-apply mode)
  - SQLite: audit trail via chat_messages and tool call logs
  - Three-way conflict detection: sync service checks for conflicts before approval
  - System prompt: `chat_approval_mode` changes the "Change Application" section Claude sees (see feature 13)
- **Maturity signal:** Mature. Critical feature, well-hardened. Auto-apply is an explicit opt-in, not a default.

---

## Chat & Claude Integration

### 11. Main Chat Interface (Streaming Sessions, History, Images, Slash Commands)
- **What it does:** Unified chat connected via persistent streaming sessions, supporting text, dragged/pasted images, and focused resources. Each chat persists its own provider, model, and provider-specific effort — Claude (Claude Agent SDK), Codex (Codex SDK), or pi (pi.dev) — with controls in the composer. New chats inherit the Settings defaults once; changing an existing chat never changes those defaults. Codex and pi run on a shared turn-queue base and expose a leaner capability set than Claude (see `providerCapabilities.ts`). Users can run multiple independent, named chat sessions per project — a session switcher lists them and switching loads that session's isolated history. Typing `/` opens a slash-command menu (user commands from `~/.claude/commands/`, installed skills, plugin commands; CLI built-ins filtered out) — filesystem-scanned before a session connects, then backed by the SDK's own `supportedCommands`/`commands_changed` once live. Messages sent while Claude is still responding are queued and steered into the current turn, rendering in strict chronological order (queued message, then the response that answered it). Long-running tool calls show a live elapsed-timer label.
- **Key code locations:**
  - Service: `src/main/services/streaming/StreamingSessionService.ts` (session lifecycle, reconnection, queued-message ordering, `tool_progress` heartbeat merge)
  - Service: `src/main/services/core/ChatService.ts` (message-send orchestration, chat reset, focus-document session reconciliation; plain history/usage reads go from `ipc/handlers/chat.ts` straight to the repositories)
  - Store: `src/renderer/stores/chat/index.ts` (sessions map, viewed session, draft messages, model state)
  - Components: `MessageList.tsx` (queued messages + inline image rendering), `ChatInput.tsx` (text/image input, drag-drop + paste), `ChatHeader.tsx`, `SessionList.tsx` + `NewSessionButton.tsx` (session switcher), `ProcessTimeline.tsx` (tool activity + elapsed-seconds label), `ModelSelector.tsx`
  - Provider selection: `src/shared/types.ts` (`ChatProvider = 'claude' | 'codex' | 'pi'`); deep choice module `src/main/chat/modelChoice/`; persisted aggregate on `chat_sessions`; backends `ClaudeSdkSession` / `CodexChatSession` / `src/main/pi/PiChatSession.ts` behind `IChatSession` (Codex + pi share `BaseTurnQueueChatSession`); capability descriptor `src/shared/providerCapabilities.ts`, readiness `src/shared/providerResolution.ts`; renderer controls `ModelSelector.tsx` → `ChatChoiceControls.tsx`, store `src/renderer/stores/chat/settingsSlice.ts`
  - Slash commands: `src/main/services/core/SlashCommandService.ts` (filesystem scan), `src/renderer/components/chat/SlashCommandMenu.tsx` + `useSlashCommandTypeahead.ts`, IPC channel `chat:get-slash-commands` (Claude only — `liveSlashCommands` capability)
  - Images: `src/main/services/files/TempImageService.ts` (save/delete temp images), `src/main/ipc/handlers/tempImages.ts`, `src/renderer/components/image-viewer-modal/index.tsx` (full-resolution viewer with zoom/pan, delete)
  - Type guard: `src/main/claude/sdkTypeGuards.ts` (`tool_progress` heartbeat message)
  - IPC handlers: `src/main/ipc/handlers/chat.ts`
  - DB: `chat_messages` (unified history, `chat_session_id` FK), `chat_sessions` (metadata)
- **Entry points / surfaces:**
  - Chat panel (right sidebar or modal in workspace view); session dropdown + "New Session" button
  - Type `/` in ChatInput to open slash-command typeahead (arrow keys to navigate, Enter to select)
  - Drag/paste images into chat input with inline thumbnail preview and remove button; click thumbnail to open image viewer modal
  - Message list shows streamed responses in real-time, with queued follow-ups ordered above the response that consumed them; active tool-call rows show a climbing `{n}s` label
- **Dependencies / integrations:**
  - Claude Agent SDK: streaming query with in-process MCP server; `tool_progress` heartbeats drive the elapsed timer; init message's `skills`/`plugins` arrays classify slash commands
  - Streaming: push-to-pull adapter (`AsyncMessageQueue`) converts the renderer's user-message input into the pull-based generator the SDK's `query()` consumes as streaming input; SDK output reaches the renderer via pushed IPC events, not polling
  - Approval queue: plan actions tagged with `chat_session_id` to avoid cross-session duplication
  - Session resumption: SDK automatically resumes conversation history on reconnect
- **Maturity signal:** Mature. Core feature. Production-grade streaming implementation with reconnect, timeout handling, permission prompting, and well-isolated sessions. Known: max 30-minute idle timeout before auto-reconnect.

### 12. Focused Resources (Context Files for Chat)
- **What it does:** Users pin files/folders to "focused resources" to feed them into Claude's context. Rendered in system prompt as file tree. Users can add via drag-drop from file tree, button click, or Claude suggestions. Persisted per project and chat session.
- **Key code locations:**
  - Store: `src/renderer/stores/project/uiSlice.ts` and `src/renderer/stores/projectDomains.ts` (focused resources list)
  - Service: `src/main/services/core/ChatRuntimeService.ts` (builds context from focused resources)
  - Component: `src/renderer/components/sidebar-tree/ReposAndFilesSection.tsx`, `src/renderer/components/sidebar-tree/RepoContextMenu.tsx`, `src/renderer/components/sidebar-tree/FileContextMenu.tsx`
  - Prompt building: `src/main/chat/prompts/focusedResources.ts`
  - Type: `FocusedResource` in `shared/types.ts`
- **Entry points / surfaces:**
  - Drag file from file tree to "Focused Resources" panel
  - Click "Add" button in focused resources panel to browse
  - Files listed with remove button
  - Chat UI shows icon indicating resources are included
- **Dependencies / integrations:**
  - File tree: drag-drop integration
  - Claude context: focused resources are serialized into system prompt
  - Repo files: reads file contents from disk for context building
  - Type inference: guesses file type to decide whether to inline full content or just path
- **Maturity signal:** Mature. Context building well-tested.

### 13. Claude System Prompts (Grounding, Constraints, Plan Rules, Response Style, User Overrides)
- **What it does:** Dynamic system prompt assembled from fixed sections rather than a mode taxonomy — an earlier EXPLORE/PLAN/ANALYZE/ADVISE mode system was deliberately removed on the premise that modern Claude reads intent from the prompt rather than needing a mode switch. Sections include: grounding (repo access, scan-before-modify), constraints, change-application behavior (manual review vs. auto-apply), workspace boundaries, tool decision tree, plan structure rules, task creation guidance, response style, project context (CLAUDE.md), and the current plan reference table. `currentView` ('plan' | 'workspace') adds a short view-context hint without reintroducing mode-based behavior branching. Users can override any registry prompt section with custom content from Settings → Prompts; overrides take precedence over the built-in default and a "Reset" button restores it.
- **Key code locations:**
  - Module: `src/main/chat/prompts/` directory
  - Assembly: `src/main/chat/prompts/index.ts` (`buildSystemPrompt`, `buildFocusSystemPrompt`)
  - Repo access + plan-modification guidance: `src/main/chat/prompts/modes.ts` (name retained; no longer a mode taxonomy)
  - Tool docs: `src/main/chat/prompts/toolDocs.ts`
  - Workspace guidelines: `src/main/chat/prompts/workspace.ts` (grounding, constraints, workspace section, plan system rules, response style)
  - Plan formatting: `src/main/chat/prompts/planFormatting.ts`
  - Prompt registry: `src/main/chat/prompts/promptRegistry.ts` (all prompt keys and defaults)
  - Prompt building: `src/main/claude/sdkOptionsBuilder.ts` (selects focus vs. main prompt), `src/main/services/streaming/StreamingSessionService.ts` (supplies `PlanContext`)
  - Overrides: `src/main/services/core/PromptOverrideService.ts`, `src/main/ipc/handlers/promptOverrides.ts`, `src/renderer/stores/promptOverrideStore.ts`, `src/renderer/components/settings/PromptsSettings.tsx` (editor UI); stored in `app_settings` with a `prompt_override:` key prefix
- **Entry points / surfaces:**
  - System prompt is built automatically per turn — not directly user-facing
  - View context (Plan vs. Workspace) influences a short contextual hint, not overall structure
  - Settings → Prompts tab: pick a prompt from a dropdown, edit in a text editor showing the default as placeholder, "Reset" to clear an override
- **Dependencies / integrations:**
  - Plan context: `PlanContext` (`src/main/chat/prompts/types.ts`) supplied by the streaming session
  - Approval mode: `chat_approval_mode` setting changes the "Change Application" section's wording (manual review vs. auto-apply)
  - Task prompts: task creation guidance includes the active `TaskPromptTemplate` when set
- **Maturity signal:** Mature. Sophisticated multi-module approach with a straightforward override mechanism layered on top. Roadmap for phase 4 includes customer-facing prompt builder.

### 17. In-Process MCP Tools (Claude Tool Integration)
- **What it does:** KPM provides Claude with direct function calls to query and modify plan items, manage documents, and more — roughly 20 tools spanning plan and relations, Jira, documents, GitHub, Confluence, files, git, and Storybook. Tools are implemented as direct function calls (not a subprocess MCP server), reducing latency, and run in the main process with full database access. Modification tools go through the approval flow before executing. When a tool result exceeds the SDK's token budget, the SDK spills the full payload to a file under `~/.claude/projects/` instead of returning it inline; the `read_spill_file` tool lets Claude page through that file (up to 50,000 characters per chunk via `offset`/`length`) since the spill directory sits outside the sandboxed Read/Grep/Glob scope — it's the only path back to that content.
- **Key code locations:**
  - Factory: `src/main/kpmTools/createKpmServer.ts` (creates MCP server from tool functions; `runWithToolExecutionContext`)
  - Tool modules: `src/main/kpmTools/tools/*.ts` (plan-items, plan-changes, jira, relations, document-read, document-update, document-edit, confluence, github, storybook, context-file-update, file-move, file-delete, list-project-files, plan-refs, review-assessment, spill-read, git-read, git-push)
  - Spill recovery: `src/main/kpmTools/tools/spill-read.ts` (`read_spill_file`, validates the path stays under `~/.claude/projects/`); tool docs in `toolDocs.ts` instruct calling with just `file_path` first to get `totalChars`, then paging until `hasMore` is false
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts` (logs all tool calls)
  - Permission prompting: `src/main/claude/permissions.ts` (permission model via SDK)
- **Entry points / surfaces:**
  - Transparent to user (called by Claude in chat); spill recovery triggers automatically after a "result exceeds maximum allowed tokens" error
  - Tool call log available in debug panel (shows tool name, input, output)
  - Permissions UI prompts user first time a tool is used
- **Dependencies / integrations:**
  - Claude Agent SDK: defines tool signatures via the `tool()` helper; spill-file mechanism and error format are SDK-owned, KPM only supplies the recovery tool
  - Approval queue: plan modification tools emit actions that queue for approval
  - Permissions: tool permissions cached and persisted per project
  - Token usage: tool I/O counts toward token budget
- **Maturity signal:** Mature. Production-grade tool system with permission model, logging, and a narrow defensive recovery path for oversized results.

---

## Agentic Task Execution (Board)

### 19. Plan-item Dev Sessions (Implementation Workflow, Worktrees, Agent Context)
- **What it does:** Users start agentic execution for a plan item from the board view. Each new session captures the current Work Brief revision, creates an isolated git worktree, resolves `@plan/<uuid>` refs, prepends meaningful project context, attaches selected context files, and spawns an implementation agent through `AgentSessionManager`. Start reuses the latest same-repo session and its worktree. If the approved Work Brief changed, KPM makes the latest revision authoritative automatically: a reused session is refreshed before it starts, follow-up turns receive the current brief, and a completed implementation turn reconciles before the playbook advances to review or completion. Supplemental text is appended only when the user explicitly enters it. Pending proposed changes remain subject to the configured approval or auto-apply policy and do not become execution context until applied. Sessions track status (pending → active → inactive) across app restarts. Board cards show a compact phase badge derived from automation phase, agent liveness, and staleness, and the Activity tab groups tool calls under the narration written immediately before them.
- **Key code locations:**
  - Service: `src/main/services/repo/DevSessionService.ts` (`startAgentSession` entrypoint, `buildAgentContext(input: AgentContextInput)` — renders task facts through `## Intent`/`## Acceptance Criteria`/`## Context`-or-`## Description`, while role and harness policy are added separately; `buildPlanRefSection` prepends a `<plan-refs>` block; composes `scaffoldWorktree` from `src/main/services/repo/worktreeScaffold.ts` to create the worktree via `git worktree add`)
  - Orchestration: `src/main/services/agents/BoardAgentOrchestrator.ts` (automation state machine, wired in via `AgentSessionManager`)
  - Agent backends: `ClaudeSdkSession`, `CodexSdkAgentSession`, `PiSdkAgentSession`, `CliAgentSession` (Gemini / legacy Claude via CLI) — dispatched by `AgentSessionManager`
  - Worktree support: `src/main/services/repo/worktreeScaffold.ts` (create via `git worktree add`), `DevSessionService.openInEditor` + `editorLauncher.ts` (open in editor), `devSessionGitInspection.ts` + `gitUtils.ts` (status/diff); worktree state lives on `dev_sessions.worktree_path` — the dead `worktrees` table plus `WorktreeService`/`WorktreeRepository` were removed
  - Repository: `src/main/db/repositories/impl/DevSessionRepository.ts`
  - IPC handlers: `src/main/ipc/handlers/devSessions.ts`, `agentSessions.ts`, `worktree.ts`
  - Components: `src/renderer/components/board-view/DetailPane.tsx`, `BoardCard.tsx` (`phaseIndicator` computation), `MergeQueuePanel.tsx`, `ActivityTab.tsx` (narrative grouping, non-stealing auto-scroll), `DetailPaneHeader.tsx` + `src/renderer/components/planning/PlanCardMenu.tsx` ("Open in Editor")
  - Types: `DevSessionAutomationPhase`, `isLiveAutomationPhase`, `isCommitHookRepairPhase` (`shared/types.ts`)
  - DB: `dev_sessions` table (status, worktree_path, branch_name, automation_phase, etc.)
- **Entry points / surfaces:**
  - Board card: drag to `in_progress` or click `Play` — prefers resuming the latest inactive/pending session over creating a new worktree; `Stop` stops the active run; phase badge on each card face. New sessions default to the Plan Item's primary repo, while the user can select a different repo for that execution without changing the Plan Item.
  - Board detail pane: Activity (narrative feed) / Changes / Review tabs
  - Start Agent modal: shows the current Work Brief and accepts only explicit supplemental instructions; reconciliation is automatic
  - Detail pane header overflow menu / plan card menu: "Open in Editor" opens the worktree in the system editor
- **Dependencies / integrations:**
  - Plan context: `buildAgentContext()` includes item title, intent, acceptance criteria, subtasks, and resolved `@plan/<uuid>` refs without a tool round-trip
  - Status tracking: lifecycle persisted in `status`; board automation state persisted in `automation_phase`
  - Approval queue: user approval required before starting a session
  - GitHub: linked PRs and review threads visible in the board detail pane (see GitHub PR Integration and Review Loop features)
  - Agent prompt templates: users can customize task-specific prompts via the `task_prompt_templates` table
- **Maturity signal:** Mature. Core feature. Board execution state machine is sophisticated; phase badges exist specifically to compensate for sessions going `inactive` between per-turn completions. Known: requires user approval before starting.

### 23. Review Loop & Automated Addressing (GitHub PR Review + Decision Queue)
- **What it does:** Dev sessions track linked GitHub PRs. Unresolved review threads become review tasks (`needs_review` → `assessed` → `in_progress` → `ready_to_post` → `done`), each with a disposition (`implement`, `push_back`, `needs_user_input`) that the user can override. The Review tab presents this as a focused decision queue rather than a flat task list: a next-action bar surfaces the most actionable thread, an accordion auto-expands it and collapses the rest to scannable rows, and a deduped per-reviewer verdict strip shows each GitHub reviewer's latest top-level verdict (linking out to GitHub) instead of re-displaying full review bodies. When the selected execution playbook includes opposing review, addressing findings is automatic and bounded: `BoardAgentOrchestrator` launches the configured review step and routes actionable findings back to the implementation agent according to the playbook's pass limits. The default implement-only playbook skips this review. Users can also reply to threads directly from KPM, optionally delegating the reply to Claude.
- **Key code locations:**
  - Service: `src/main/services/repo/ReviewService.ts` (reconcile threads into tasks, reply orchestration), `GitHubService.ts` (fetch PR/threads/reviews), `ReviewAssessmentService.ts` (assess thread resolution), `ReviewPollService.ts` (poll for updates)
  - Orchestration: `src/main/services/agents/BoardAgentOrchestrator.ts` (`onSessionComplete` review-complete branch; automation phases `reviewing` → `addressing_review` → `ready_for_review`)
  - Service: `src/main/services/agents/autoReview.ts` (one-shot opposing review launch + findings parsing), `DevSessionService.ts` (`sendAgentFollowUp` delivers aggregated findings back to the implementation session)
  - Repository: `src/main/db/repositories/impl/ReviewTaskRepository.ts`, `ReviewOwnershipRepository.ts`, `ReviewSyncStateRepository.ts`
  - Claude tool: `src/main/kpmTools/tools/review-assessment.ts` (`kpm_assess_review_status`)
  - IPC handlers: `src/main/ipc/handlers/review.ts`
  - Component: `src/renderer/components/development/ReviewTab.tsx` (decision queue: `NextActionBar`, thread accordion, `summarizeReviewers` verdict strip), `ReviewReplyApprovalPanel.tsx`
  - Store: `src/renderer/stores/devSessions/index.ts` (review state)
  - Types: `ReviewTaskStatus`, `ReviewDisposition` (`shared/types.ts`)
  - DB: `review_tasks`, `review_sync_state`, `review_ownership` tables; `agent_review_runs` / `agent_review_findings` (audit trail for the automated review pass)
- **Entry points / surfaces:**
  - Board detail pane: "Review" tab (conditional — only when the session has a linked PR); next-action bar; accordion; reviewer verdict strip; disposition override buttons (implement / push back / needs user input)
  - Automated addressing is fully automatic — no board button triggers it; the board card's phase badge reflects "Reviewing"/"Addressing review", and `needs_attention` surfaces if the automated follow-up itself fails
- **Dependencies / integrations:**
  - GitHub API: fetch PR, list review threads and top-level reviews, post replies
  - Board execution: review state machine phases drive both the decision queue and the automated addressing pass
  - Claude SDK: review assessment tool classifies thread disposition
  - Approval queue: replies queued for approval before posting
  - Race guard: a manual follow-up sent while review is running skips the automated follow-up, since the session is already progressing
- **Maturity signal:** Mature. Sophisticated review orchestration, deliberately bounded (one review pass, one address pass) rather than an open-ended loop; UI reworked from a flat task list into a decision-queue presentation without changing the underlying workflow.

### 25. GitHub PR Integration (Linking + Description Generation)
- **What it does:** Users link a development session to its GitHub PR — or create one directly from KPM — and generate reviewer-oriented PR text with Claude. Linking fetches PR info (title, description, diff, review threads) for display and feeds the review loop's thread polling. Description generation builds context from the committed branch diff, commit log, the repo's PR template, and plan context (intent + acceptance criteria), optionally augmented with a project markdown document as feature context so the description can explain how the PR fits into a larger initiative without dumping roadmap detail into the body. Users edit the drafted text before creating the PR with `gh` or copying it.
- **Key code locations:**
  - Service: `src/main/services/repo/GitHubService.ts` (fetch PR, list reviews, committed diff, commit log, PR template, `gh pr create`)
  - Components: `src/renderer/components/development/LinkPrDialog.tsx`, `CreatePrModal.tsx`, `GeneratePrContentModal.tsx`
  - Store: `src/renderer/stores/devSessions/prSlice.ts`
  - IPC handlers: `src/main/ipc/handlers/github.ts`
  - Claude chat tool: `src/main/kpmTools/tools/github.ts` (`generate_pr_description`, returns context for chat rather than creating a PR)
  - DB: `dev_sessions.pr_url`
- **Entry points / surfaces:**
  - Board detail pane: "Link PR" button; "Create PR" button; overflow menu "PR content"; PR info (title, status, link) and file diff shown in the Changes tab
  - Modal shows generated text for review/editing before create/copy; optional feature-context selector regenerates the draft against a chosen project document
- **Dependencies / integrations:**
  - GitHub API/CLI: fetch PR, list comments, post replies, auth check, branch push, PR creation
  - Plan context: item intent and acceptance criteria included in generation
  - Project documents: optional markdown file summarized into reviewer-facing feature context
  - Review Loop (feature 23): linked PRs feed review-thread polling and assessment
- **Maturity signal:** Mature. PR linking and description generation are well-integrated with the review loop and dev-session lifecycle.

### 105. Execution Playbooks (Configurable Board Agent Flows)
- **What it does:** A playbook is a persisted, validated recipe defining the bounded multi-step flow a board agent runs to implement a plan item — it replaced the old boolean Standard/Workflow `execution_mode` picker with a first-class, reusable, user-editable object. Each playbook is `{ id, name, builtIn, steps[] }`; a step names the session (`main` implementation agent vs. a spawned `subagent`), an ordered agent fallback chain (or parallel `runs` for fan-out, e.g. two-axis review), a role-instruction prompt key, a directive (inline prompt or skill invocation, with `{{output:stepId}}` / `{{findings}}` interpolation), and routing (a findings-check loop-back with a bounded `maxPasses`, an explicit `next`, a `pauseBefore` human gate, and a `writes` flag letting a subagent edit the worktree). The split of responsibility is the point: the **user owns the recipe** (which agents, which prompts, how many review passes, where to pause); **KPM owns the guarantees** — worktree safety (the harness commits agent work onto the task branch), persistence (the cursor, pass counts, step outputs, and an immutable snapshot survive a restart), and terminal states (the phase machine, not the playbook, decides `ready_for_review` / `needs_attention` / move to In Review).
- **Built-in playbooks** (`BUILT_IN_PLAYBOOKS`, editable through persisted customizations): `builtin.implement_only` — a single implement step (the default and the legacy `review_policy = 'skip'` fallback); `builtin.implement_opposing_review` — implement → one opposing review → one address pass; `builtin.implement_code_review` — TDD implement → parallel two-axis review (Standards + Spec) → address loop. Saving changes to a built-in persists a custom playbook with the same stable id, so it shadows the shipped recipe without modifying source defaults; Reset removes that customization and reveals the current built-in again.
- **Key code locations:**
  - Shared model + logic: `src/shared/playbooks.ts` (types, Zod `playbookSchema`, `BUILT_IN_PLAYBOOKS`, `DEFAULT_PLAYBOOK`, validation helpers), `src/shared/playbookRuntime.ts` (`resolvePlaybookPlan`, `advancePlaybook`, `renderPlaybookDirective`)
  - Service + repository: `src/main/services/core/PlaybookService.ts` (CRUD + default; persisted customizations shadow built-ins by id), `src/main/db/repositories/impl/PlaybookRepository.ts`
  - Interpreter: `src/main/services/agents/BoardAgentOrchestrator.ts` (loads the snapshot, dispatches steps, aggregates fan-out runs, advances the cursor), `automationPhaseMachine.ts` (sole writer of `automation_phase` + cursor fields), `autoReview.ts` (`launchPlaybookSubagent`), `boardProviderRegistry.ts`
  - Session wiring: `src/main/services/repo/DevSessionService.ts` (snapshot creation, `savePlaybookOutputs`, `resumePlaybook`)
  - Renderer: `src/renderer/services/playbookService.ts`; settings `src/renderer/components/settings/PlaybooksSettings.tsx` + `playbookEditor.ts`; board `src/renderer/components/board-view/AgentStartModal.tsx` (playbook picker + resolved-plan preview), `PhaseStepper.tsx` + `panelStatus.ts` (`derivePanelStatus`)
  - IPC: `src/shared/ipc/playbookEndpoints.ts` (`playbook:list|create|update|delete|duplicate|set-default|providers|skills`), handlers `src/main/ipc/handlers/playbooks.ts`; the selected `playbookId` flows through `agent-session:create-and-start`
  - DB: `execution_playbooks` table (custom playbooks; migration `104_custom_execution_playbooks`), default id in `app_settings` (`default_playbook_id`); running-session columns on `dev_sessions` — `playbook_id`, `playbook_snapshot` (immutable authoritative copy), `current_step_id`, `step_pass_counts`, `step_outputs`, `paused_reason` (migrations `103_execution_playbook_persistence` + `105_playbook_step_outputs`)
- **Entry points / surfaces:**
  - Settings → Playbooks tab: create / select / edit / duplicate / delete playbooks and pick the default; a "Role instructions" sub-tab overrides the agent role prompts; built-ins can be customized in place and reset to their shipped recipe; validation issues block Save
  - Board "Start Implementation" modal: playbook picker (defaults to the configured default) with a per-step resolved-plan preview (`provider/model`, flagged when a provider is unavailable); Start is disabled when a required provider can't be resolved
  - Board detail pane: `PhaseStepper` renders the snapshot's steps with the live cursor and pass counts; a paused run surfaces `one_more_pass` / `proceed` (max-passes) or `resume` (gate) actions
- **Dependencies / integrations:**
  - Plan-item Dev Sessions (feature 19) and Review Loop & Automated Addressing (feature 23): playbooks drive the same automation-phase machine and opposing-review pass those features describe
  - Chat/agent providers (feature 11): agent candidate chains resolve against available providers (Claude / Codex / pi / Gemini) via `boardProviderRegistry`
  - `review_policy` (auto/skip): honored only as a compatibility fallback for pre-migration-103 sessions with no snapshot; new runs are always snapshot-driven
  - Board Agent Prompt Customization (feature 57): role prompts (`agents.*` keys) are registered in `promptRegistry.ts` and user-overridable
- **Maturity signal:** Mature. Replaced the Standard/Workflow `execution_mode` boolean (that column is now vestigial — unread by any service); the persisted snapshot plus the phase machine make runs restart-safe, and the Zod schema enforces reachability and bounded review cycles.

---

## Tracker Integration (Jira/Linear)

### 27. Tracker Connections & Configuration (Jira & Linear)
- **What it does:** Users configure credentials for Jira (site URL, email, API token) and Linear (API token), stored in the OS keychain — both trackers can be connected simultaneously. From a connection, users authorize specific Jira projects or Linear teams as "scopes" (multiple scopes per tracker). An **association** then ties a connection + scope + JQL/filter + status/custom-field mappings together, defining which issues sync with KPM and how fields map (e.g. Jira "In Progress" → KPM "in_progress"). A separate **type-mapping** grid defines how KPM labels (project/feature/task) map to tracker issue types (Jira Epic/Story/Task, Linear Roadmap/Cycle/Issue) — bidirectional, used by both import (type → label) and export (label → type).
- **Key code locations:**
  - Service: `src/main/services/core/TrackerService.ts` (connection/scope/association CRUD), `src/main/trackers/TrackerClientService.ts` (credential storage, client factory), `src/main/db/domain/TypeMappingService.ts`
  - Client services: `src/main/tracker-clients/jira/client.ts`, `src/main/tracker-clients/linear/client.ts`
  - IPC handlers: `src/main/ipc/handlers/tracker.ts`
  - Components: `src/renderer/components/settings/TrackerSettings.tsx` (credentials + scopes), `src/renderer/components/tracker/config/TrackerLinkProjectDialog.tsx` (association editor), `src/renderer/components/tracker/mapping/StatusMappingForm.tsx`, `TypeMappingDialog.tsx`
  - Repository: `src/main/db/repositories/impl/TypeMappingRepository.ts`
  - DB: `tracker_connections` (tracker_type, site_url, display_name), `tracker_project_scopes` (connection_id, project_key/name), `kpm_tracker_associations` (kpm_project_id, scope_id, issue_filter, status_mapping, custom_field_values, epic_key), `tracker_type_mappings` (kpm_project_id, scope_id, kpm_label, tracker_issue_type_id/name)
- **Entry points / surfaces:**
  - Settings → Connections → Tracker: "Connect Jira"/"Connect Linear" with a credential dialog and test-connection; scope dropdown after connecting; "Add Association" with a JQL editor (Jira) or filter selector (Linear) plus a status-mapping table; Type Mapping grid (KPM labels × tracker types)
- **Dependencies / integrations:**
  - Jira API v3, Linear API v1; OS keychain (credentials never stored in plaintext)
  - Sync Pipeline (feature 33) and Import (feature 35) read associations and type mappings to decide what to fetch and how to map it
- **Maturity signal:** Mature. Secure credential handling, multi-tracker support, and a sophisticated multi-directional mapping model.

### 31. Jira & Linear Query Tools (Search, Get Issues, Compare)
- **What it does:** Claude chat tools query Jira issues by project and JQL, fetch a single issue, list projects, and compare a Jira issue's fields against a linked KPM plan item's fields for conflict detection. Linear has an equivalent read client (search issues, get issue, list teams) used by the tracker UI and sync pipeline, but it is **not currently exposed as a chat tool** — Claude chat can query Jira directly; Linear data only reaches chat indirectly, through KPM's own plan-item and sync surfaces.
- **Key code locations:**
  - Jira client: `src/main/tracker-clients/jira/client.ts` (searchIssues, getIssue, getProjects, getCustomFields)
  - Claude tools: `src/main/kpmTools/tools/jira.ts` (`jira_list_projects`, `jira_search`, `jira_get_issue`, `jira_compare_plan`)
  - Linear client: `src/main/tracker-clients/linear/client.ts` (searchIssues, getIssue, getTeams) — UI/sync-only, no chat tool wrapper today
  - IPC handlers: `src/main/ipc/handlers/tracker.ts`
- **Entry points / surfaces:**
  - Claude chat: "search Jira for active issues", "show me PROJ-123", "compare this plan item against its linked Jira issue"
  - Jira tool calls appear in the tool call log
- **Dependencies / integrations:**
  - Jira API v3, Linear API v1
  - `jira_compare_plan`: shows field differences for conflict detection
- **Maturity signal:** Mature for Jira. Linear query tools exist at the client layer but aren't wired into chat — parity would require dedicated Linear tool wrappers, not reuse of `jira.ts`.

### 33. Sync Pipeline (Preview, Queue, Execute)
- **What it does:** Changes destined for the tracker move through three stages. A **preview** step shows which items will be created/updated/deleted and detects three-way conflicts (item changed locally, tracker changed externally, and KPM's cached snapshot differs from both) so the user can pick a resolution (keep local / take tracker version) per conflicting row. Approved changes move into a persisted **sync queue** — it survives an app restart before the user syncs, and custom field values can still be edited there. **Executing** the sync posts create/update/delete calls to the tracker API, updates the sync snapshot as the new baseline, and reports progress via notification. Newly created issues are assigned to the user's own tracker account unless the "Assign issues I export to me" setting (Settings → Workflow → Tracker) is turned off; existing issues are never reassigned, and a tracker that refuses the assignee still gets the issue, with a warning on the completion screen. Diffing at every stage reads a cache of each tracker issue's last-known state, stored directly on the linked `plan_items` row (`external_key`, `external_status`, `last_synced_at`, etc.) rather than a separate cache table.
- **Key code locations:**
  - Service: `src/main/db/domain/SyncService.ts` (`generateSyncPreview`, `applySyncChanges`, queuing logic, populates the issue-state cache after a successful sync), `src/main/db/domain/ExportService.ts` (formats KPM data for tracker APIs)
  - Repositories: `src/main/db/repositories/impl/OutboundChangeRepository.ts` (persisted sync queue), `SyncRepository.ts` (sync snapshots), and `ExternalPlanItemRepository.ts` (reads cached fields off `plan_items` where `external_key IS NOT NULL`)
  - Stores: `src/renderer/stores/tracker/useSyncStore.ts` (preview state), `useSyncReviewStore.ts` (review state)
  - Components: `src/renderer/components/tracker/sync/TrackerSyncPanel.tsx` (preview table), `SyncConflictCard.tsx`
  - IPC handlers: `src/main/ipc/handlers/tracker.ts` (`getSyncPreview`, `applySyncChanges`), `src/main/ipc/handlers/export.ts`
  - DB: `sync_queue`, `sync_snapshots` tables; tracker-issue cache columns live on `plan_items` (`external_key`, `external_id`, `external_type`, `external_issue_type`, `external_status`, `external_url`, `association_id`, `last_synced_at`)
- **Entry points / surfaces:**
  - Tracker tab: "Sync to Jira/Linear" opens a preview modal (old value | new value | conflict indicator per item); click a conflict row to pick a resolution; "Apply" queues the change; queue view lets users edit custom field values or clear the queue before the approval-gated export posts to the tracker
- **Dependencies / integrations:**
  - Jira/Linear API: POST/PUT to create/update issues; status mapping and custom-field formatting per association (feature 27)
  - Approval queue: sync execution is queued for user approval before posting
  - Import (feature 35): shares the same tracker-issue cache for detecting already-imported items
- **Maturity signal:** Mature. Conflict detection and queue persistence are the most sophisticated part of tracker integration.

### 35. Import (Load Issues from Tracker)
- **What it does:** Bulk-import issues from tracker (via association JQL/filter) into KPM as plan items. Creates hierarchy based on issue type mapping (Epic → project, Story → feature, Task → task). The dedicated preview-then-import wizard was removed; import is now a single "Import" button inside the sync panel that runs the fetch-and-create flow directly, with a progress indicator (fetching/importing) rather than a preview table.
- **Key code locations:**
  - Service: `src/main/db/domain/ImportService.ts` (generateImportPreview, importIssues)
  - Service: `src/main/services/core/TrackerService.ts` (wrapper)
  - Component: `src/renderer/components/tracker/sync/TrackerSyncPanel.tsx` (`handleImport`, import progress UI)
  - Store: `src/renderer/stores/trackerStore.ts` (`importAll`, `importPreview`, `importProgress`)
  - IPC handlers: `src/main/ipc/handlers/tracker.ts`
- **Entry points / surfaces:**
  - Tracker tab → sync panel: "Import" button per association
  - Progress indicator while fetching/importing; no separate preview step in the current UI
- **Dependencies / integrations:**
  - Association JQL/filter: controls which issues are fetched
  - Type mapping: determines parent-child relationships on import
  - Sync Pipeline (feature 33): imported issues populate the same tracker-issue cache used for sync diffing
- **Maturity signal:** Mature backend; UI simplified to a direct import action (preview wizard component removed).

---

## Documents & Context

### 38. Project Documents & Context File (CLAUDE.md / AGENTS.md)
- **What it does:** Project documents (architecture notes, dev guides, any other markdown) live as plain files on disk in the project folder — there is no DB-backed document store (the early `documents` table was dropped in migration `079_drop_documents_table`), so file path is the canonical identity. Documents are discovered by walking the project folder (filtered to markdown extensions) and indexed for full-text search. One file is special: CLAUDE.md or AGENTS.md at the project root is automatically read by Claude and Claude Code as project-level context on every session. Users edit any of these through the markdown editor; documents can also be linked to Confluence pages for publishing.
- **Key code locations:**
  - Context file: `src/main/services/core/ContextFileService.ts` (read/write CLAUDE.md/AGENTS.md), `src/main/project-context/contextFileCompat.ts` (filename-variant compatibility)
  - Document discovery: `src/main/services/core/SearchService.ts` (`listDocumentFiles` walks the project folder and indexes results for FTS)
  - Component: `src/renderer/components/markdown-document-modal/index.tsx` (editor UI, shared by documents and the context file)
  - Store: `src/renderer/stores/workspaceStore.ts` (open-document state)
  - IPC handlers: `src/main/ipc/handlers/files.ts`
- **Entry points / surfaces:**
  - Workspace sidebar project file tree: browse and open any markdown file; "Context" button opens the CLAUDE.md/AGENTS.md editor specifically
  - Markdown editor modal with preview
- **Dependencies / integrations:**
  - Dev sessions: the project-level context file is injected into the agent prompt at session start (placeholder content excluded); the worktree's own CLAUDE.md/AGENTS.md is auto-read by the SDK
  - Global search: documents indexed for FTS queries
  - Confluence sync: documents can be synced to Confluence pages
  - File watching: detects external changes to open documents
- **Maturity signal:** Mature for the context file. Plain project documents have no dedicated management UI beyond the shared file tree/editor — there's no in-app concept of document "type" (architecture/dev guide/custom).

### 40. Document & Context-File Editing Tools (Propose Create/Edit)
- **What it does:** Claude proposes markdown changes through three tools that share one approval mechanism. Creating a document proposes a brand-new file — the diff shows full new content. Editing an existing document uses `old_string` → `new_string` matching, with a batched multi-hunk mode (`edits[]`) that validates and applies all hunks atomically as one combined diff and a single approval entry. The context-file tool uses the same edit mechanism but targets CLAUDE.md/AGENTS.md specifically, tracked as a distinct approval type from other documents. All three queue through the approval system (or apply immediately in auto-apply mode).
- **Key code locations:**
  - Claude tools: `src/main/kpmTools/tools/document-update.ts` (create), `document-edit.ts` (edit, single- and multi-hunk), `context-file-update.ts` (context-file edit)
  - Approval queue: `src/renderer/stores/proposedChangeDisposal.ts` (`ProposedChange` discriminated union)
  - Components: `src/renderer/components/planning/PendingDocumentPanel.tsx`, `src/renderer/components/ui/DiffViewer.tsx` (shared diff rendering)
- **Entry points / surfaces:**
  - Pending document panel / pending actions panel (approval overlay): diff view with Accept/Reject
  - Newly created files open automatically in the workspace editor
- **Dependencies / integrations:**
  - File system: edit tools read the current file server-side to validate before computing the new content
  - Approval queue: batch edits yield one entry regardless of hunk count; edits fail cleanly if `old_string` isn't found or is ambiguous, or if any hunk in a batch fails
- **Maturity signal:** Mature. Robust edit validation; creation and editing share one proposal→approval shape across both plain documents and the context file.

### 106. Markdown Focus Reader (Immersive Reading + Per-Document Chat)
- **What it does:** Users can enter a distraction-free full-screen reading mode for any open markdown file: larger type, a light/dark reading theme independent of the app theme, a table-of-contents rail with scroll-spy, in-document search, and reading-position persistence per document. A companion chat panel can be opened alongside the reader, scoped to that one document — its own persisted thread, separate from the project's main chat sessions. This chat follows the same rules as main chat: direct writes need the project's write grant, and any document/context-file edit still goes through `propose_document_edit` / `propose_context_edit` and KPM's normal approval flow (or auto-apply, per the global setting) — focus mode does not bypass it.
- **Key code locations:**
  - Component: `src/renderer/components/focus-mode/FocusMode.tsx` (reader shell: TOC, search, reading theme, scroll-spy)
  - Component: `src/renderer/components/focus-mode/FocusChatPanel.tsx` (per-document chat UI)
  - Hook: `src/renderer/components/focus-mode/useReadingProgress.ts` (active heading + scroll progress)
  - Store: `src/renderer/stores/focusModeStore.ts` (open/close, reading theme and scroll-position persistence in localStorage)
  - Entry point: `src/renderer/components/workspace/FileEditor.tsx` (`handleEnterFocus` — focus button shown only for markdown files)
  - Prompt: `src/main/chat/prompts/index.ts` (focus-session system prompt: focused document is the implicit subject; repo changes need the write unlock; document/context changes still require `propose_document_edit`/`propose_context_edit`)
  - Session plumbing: `src/main/services/core/ChatService.ts` (`focusDocument` param), `src/main/claude/sdkOptionsBuilder.ts` (`isFocusSession`), `getFocusDocumentChatSession` in `src/renderer/services/chatService.ts`
  - DB: `chat_sessions` columns `scope` (`'main' | 'focus_document'`), `focus_document_path`, `focus_document_title`, `focus_document_hash` — migration `091_focus_document_chat_sessions`; one session per (project, document path)
- **Entry points / surfaces:**
  - Workspace file editor: focus button on markdown files
  - Reader: TOC toggle, search, light/dark reading theme toggle, close (Escape)
  - Chat toggle within the reader opens/closes the per-document chat panel
- **Dependencies / integrations:**
  - Claude Agent SDK: separate session per focused document, reusing the main chat session/message infrastructure with `scope = 'focus_document'`
  - Approval queue: document and context-file edits proposed from focus chat queue (or auto-apply) exactly like main chat
  - Markdown rendering: shares `markdown.tsx` transforms (plan refs, soft breaks) with the rest of the app
- **Maturity signal:** Mature. Reading position and theme persist across sessions; chat thread persists per document.

---

## Artifacts & Generation

### 43. Artifact Generation (Weekly Updates, Test Plans, Custom Outputs)
- **What it does:** Claude-generated markdown documents saved to a project's `outputs/` folder. There are no built-in generators: a hardcoded weekly-update/test-plan pipeline was replaced by user-configurable prompts, and the seeded "Weekly Update"/"Test Plan" built-ins were later removed. Generating a weekly update, a test plan, or any other stakeholder-facing doc means creating an action (see Actions, feature 109) granted `write_outputs` and running it — `ActionRunnerService` writes the file. PR descriptions are generated through the GitHub/dev-session flow instead (see GitHub PR Integration).
- **Key code locations:**
  - Definition and validation: `src/main/services/core/ActionService.ts`, `src/shared/actions.ts`, `src/main/db/repositories/impl/ActionRepository.ts`, `ActionRunRepository.ts`
  - Execution: `src/main/services/repo/ActionRunnerService.ts` (one capability-gated run path for manual and triggered actions)
  - IPC: `src/main/ipc/handlers/actions.ts` (`runNow` starts a headless run; history is stored in `action_runs`)
  - UI: `src/renderer/components/command-palette/CommandPalette.tsx`, `src/renderer/components/settings/ActionsSettings.tsx`, and `src/renderer/stores/actionStore.ts`
- **Entry points / surfaces:**
  - Command palette (Cmd+K): run any action granted `write_outputs`
  - Settings → Actions: create, configure, run, and inspect recent output-producing actions
- **Dependencies / integrations:**
  - Actions (feature 109): the only current way to define what gets generated — there is no chat tool or board-detail button that triggers generation directly
  - File system: writes Markdown to `project/outputs/actions/<action-name>.md`
  - File Explorer (feature 68): how the written files are reached in-app — `outputs/` is not hidden
- **Maturity signal:** Functional. The specific "weekly update" and "test plan" artifact types no longer exist as built-ins — producing either now requires the user to author their own action.

---

## Global Search & Navigation

### 50. Global Search (FTS5 Full-Text Search)
- **What it does:** Search across plan items, documents, and external tracker issues. Uses SQLite FTS5 virtual table for fast substring and phrase matching. Results ranked by relevance and entity type.
- **Key code locations:**
  - Service: `src/main/services/core/SearchService.ts` (query, index building, document watching)
  - Database access: `SearchService` queries `global_search_index` and `global_search_fts` directly
  - DB: `global_search_fts` virtual FTS5 table + `global_search_index` metadata table
  - Component: `src/renderer/components/global-search/GlobalSearch.tsx`
  - Component: `src/renderer/components/global-search/SearchResultItem.tsx`
  - Store: `src/renderer/stores/searchStore.ts`
  - IPC handlers: `src/main/ipc/handlers/search.ts`
- **Entry points / surfaces:**
  - Cmd+F (global search) or click search icon in sidebar
  - Type query, results populate in real-time
  - Click result to navigate to item
  - Filters available: entity type (plan item, document), status, label
- **Dependencies / integrations:**
  - File system watcher: SearchService watches project folder for .md file changes and re-indexes
  - Databases: queries across multiple tables (plan_items including externally-linked tracker rows, documents)
  - FTS5: substring matching, phrase search with quotes, ranking by relevance
- **Maturity signal:** Mature. Search engine robust with incremental indexing.

### 51. Command Palette (Cmd+K)
- **What it does:** Quick command palette: create plan item, navigate to item, and run any action (feature 109). Supports fuzzy search on command names, descriptions, and keywords. A chat-mode action with a target opens a second picker page to select the document or repo it runs against.
- **Key code locations:**
  - Component: `src/renderer/components/command-palette/CommandPalette.tsx`
  - Store: `src/renderer/stores/actionStore.ts` (actions as commands)
  - Integration: actions appear as executable commands; "Manage actions…" opens Settings → Actions
  - Keyboard hook: Cmd+K globally
- **Entry points / surfaces:**
  - Cmd+K keyboard shortcut
  - Modal popup with command search
  - Categories: Prompts, Project, Navigation
  - Execute command or navigate
  - For targeted prompts (`target_type: 'document'` or `'repo'`): second picker page lists available targets; Backspace returns to command list
- **Dependencies / integrations:**
  - Actions: listed as executables in the palette; targeted chat actions attach the selected entity as a focused resource before sending
  - Plan navigation: can search and navigate to plan items
  - Project actions: create new project, etc.
- **Maturity signal:** Mature. Command palette functional. Extensible via actions.

### 52. Sidebar Navigation (Projects, Sources, Context, Search)
- **What it does:** Left sidebar with: project list, repo sources (branches, file tree), focused resources, global search. Collapsible sections.
- **Key code locations:**
  - Component: `src/renderer/components/sidebar/` (multiple sub-components)
  - Component: `src/renderer/components/sidebar-tree/` (hierarchical tree for repos and files)
  - Store: `src/renderer/stores/fileTreeStore.ts` (file tree state)
  - Store: `src/renderer/stores/project/uiSlice.ts` (focused resources)
  - Component: `src/renderer/components/sidebar-tree/RepoListSection.tsx` (branch info)
- **Entry points / surfaces:**
  - Left sidebar (always visible)
  - Collapsible sections: Projects, Sources, Context, Search
  - Click project to switch
  - Click repo/file to expand tree
  - Drag files to focused resources
- **Dependencies / integrations:**
  - RepoWatcherService: branch info updates in real-time
  - File tree: renders from file system
  - Context store: shows focused resources
- **Maturity signal:** Mature. Navigation well-organized.

---

## Confluence Integration

### 53. Confluence Integration (Page Links + Preview Sync)
- **What it does:** Users link project documents to Confluence pages (stores `site_url`, `page_id`, `page_title`, `space_key`, `last_synced_at`); once linked, the page URL is available to Claude via a tool for reference. From a linked document, a sync-preview modal shows local vs. remote content, flags conflicts if either side changed since the last sync, and lets the user push local markdown to Confluence or pull remote content back into the project file.
- **Key code locations:**
  - DB: `confluence_page_links` table (document_path, site_url, space_key, page_id, page_title, last_synced_at)
  - Repository: `src/main/db/repositories/impl/ConfluenceLinkRepository.ts`
  - Service: `src/main/services/confluence/ConfluenceSyncService.ts` (link management + `generateSyncPreview`)
  - Claude tool: `src/main/kpmTools/tools/confluence.ts` (`get_confluence_url`)
  - Components: `src/renderer/components/confluence/LinkToConfluenceModal.tsx`, `ConfluenceSyncPreviewModal.tsx`
  - IPC handlers: `src/main/ipc/handlers/confluence.ts`
- **Entry points / surfaces:**
  - Document sidebar Confluence section: "Link to Confluence" button
  - Document detail: "Sync to Confluence" button (if linked) opens the preview modal (local content, remote content, version, conflict state); user chooses push or pull
- **Dependencies / integrations:**
  - Confluence API: page lookup, fetch/update pages using Jira/Atlassian credentials
  - Claude context: linked Confluence URL available for reference
- **Maturity signal:** Mature. Link storage, URL parsing, page verification, and bidirectional sync with conflict preview and hash/version baseline tracking are all implemented.

---

## Agent Sessions & Orchestration

### 57. Board Agent Prompt Customization (Overrides + Task Templates)
- **What it does:** Implementation and opposing-review prompts for board execution are configured via Settings, not a separate "agent team" subsystem — an earlier per-project agent-team mode (with an `agent_prompts` table and `AgentPromptRepository`) was removed, and that table was dropped in migration `080_drop_agent_prompts`. Two customization layers remain: system-prompt-section overrides via `PromptOverrideService` (same mechanism as chat prompt overrides, feature 13), and **task prompt templates** — per-project or global reusable instructions (e.g. "prioritize tests", "use TypeScript conventions") resolved to an effective template and folded into the agent's prompt when a dev session starts.
- **Key code locations:**
  - Overrides: `src/main/services/core/PromptOverrideService.ts`; Settings UI under the Prompts settings tab
  - Task templates: `src/main/db/repositories/impl/TaskPromptTemplateRepository.ts` (effective-template resolution), `src/main/services/core/TaskPromptTemplateService.ts`, `src/renderer/components/settings/TaskPromptSettings.tsx`, `src/renderer/stores/taskPromptTemplateStore.ts`, `src/main/ipc/handlers/taskPromptTemplates.ts`
  - DB: `task_prompt_templates` table (project_id, name, prompt_content, is_default); `agent_prompts` table was dropped in migration `080_drop_agent_prompts`
- **Entry points / surfaces:**
  - Settings → Prompts tab (board prompt overrides); Settings → Task Prompts tab (create global default or per-project override, editor with preview)
- **Dependencies / integrations:**
  - Dev sessions: the effective task template is included in the agent's prompt at session start
- **Maturity signal:** Stable. Agent-team mode removed; prompt customization now flows entirely through settings-based overrides and task templates.

### 59. Agent Session Manager (Registry, Backend Dispatch, Hooks)
- **What it does:** Non-user-facing registry that tracks live board agent sessions and dispatches to the right backend implementation — see Plan-item Dev Sessions (feature 19) for the user-facing session lifecycle this drives. Completed sessions (complete/failed/stopped) stay in the registry for 30 minutes to cover follow-up requests before automatic eviction; `sendAgentFollowUp` falls back to a full restart if the session has already been evicted. CLI-backed agents (Gemini / legacy Claude) additionally run through a local hook server that listens for pre/post-execution hook callbacks.
- **Key code locations:**
  - Service: `src/main/services/agents/AgentSessionManager.ts` (registry, event wiring, review persistence, 30-min TTL eviction), `BaseAgentSession.ts` (shared base class)
  - Hook integration: `src/main/services/agents/hooks/claudeCodeHooks.ts`, `hookServer.ts` (`createHookServer`)
  - IPC handlers: `src/main/ipc/handlers/agentSessions.ts`
- **Entry points / surfaces:** Not directly user-facing — see feature 19 for the board UI this powers.
- **Dependencies / integrations:**
  - Dev sessions: the manager is what `DevSessionService.startAgentSession` dispatches through
  - Agent catalog: lists available agent types/backends
- **Maturity signal:** Mature. Multi-session support and TTL-based eviction are well-tested.

### 109. Actions (Saved Prompts, Optionally Triggered)
- **What it does:** An action is a prompt the user wrote plus how it starts and what it is allowed to do. It replaced two features that were the same object with different activation — Command+K custom prompts (manual, global) and scheduled loops (interval, project-scoped). A trigger is `manual` (only when invoked), `interval` (5 min to 1 week), or `event` (`app_opened`, `board_agent_finished`, `pr_changed`, `ticket_changed`, `branch_changed`). Manual invocation stays available under every trigger kind.
- **Capability grant replaces the output mode.** The retired `LoopOutputMode` enum was carrying two decisions at once — what a run may touch, and where its result lands. Both now come from a grant of `read_project`, `read_integrations`, `report_finding`, `write_outputs`, `propose_documents`, `propose_plan`. Delivery is a consequence of which grant the run exercises rather than a separate setting, so one action can both report a finding and write a file — a combination the enum could not express. The grant is enforced by the tool runtime, not by prompt wording: `listTools` and `executeTool` both check it, so the model never sees a withheld tool and is refused if it names one anyway.
- **Where proposals go.** An action that proposes changes must have `manualRun: 'chat'`, which sends the prompt into a real chat session so its proposals reach the approval queue. A triggered propose grant is rejected outright, because a background run has no user present and the approval queue does not persist. This is the deliberate replacement for `maintain` mode, which auto-applied document edits to disk with nobody reviewing them.
- **Key code locations:**
  - Shared model: `src/shared/actions.ts` (types, Zod `actionFieldsSchema`/`actionEditableSchema`, `toEditable`, `formatTrigger`, capability label table, cross-field validation)
  - Capability translation: `src/main/services/core/actionCapabilities.ts` (`toolCapabilitiesFor` — maps user-facing grants to `KpmToolCapability`); enforcement in `src/main/kpmTools/runtime.ts` (`isWithinGrant`) and `src/main/kpmTools/createKpmServer.ts` (`getGrantedKpmServer`)
  - Service + repositories: `src/main/services/core/ActionService.ts` (name uniqueness, merged-state re-validation, scheduler coordination), `src/main/db/repositories/impl/ActionRepository.ts`, `ActionRunRepository.ts`
  - Runner: `src/main/services/repo/ActionRunnerService.ts` (interval registration on `PollScheduler`, `UpdateEventBus` subscription for event triggers, single execution path, `report_finding` / `write_outputs` delivery, carried-forward memory)
  - IPC: `src/shared/ipc/actionEndpoints.ts` (`action:list|get|create|update|set-enabled|delete|run-now|history`), handlers `src/main/ipc/handlers/actions.ts`; push event `src/shared/ipc/actionEvents.ts` (`action:run`)
  - Renderer: `src/renderer/components/settings/ActionsSettings.tsx`, `src/renderer/stores/actionStore.ts`, `src/renderer/services/actionService.ts`, `src/renderer/components/command-palette/CommandPalette.tsx`
  - DB: `actions` + `action_runs` tables (migration `115_add_actions`, which also backfills from `custom_prompts` and `scheduled_loops`), `actions.model` (migration `116_add_action_model`), schedule adoption (migration `117_adopt_loop_schedules_as_actions`), legacy table drop (migration `118_drop_custom_prompts_and_scheduled_loops`)
- **Entry points / surfaces:**
  - Settings → Actions: list plus editor; capabilities as plain-language checkboxes, one "Runs" dropdown for the trigger, live validation that blocks Save, Run now, and recent run outcomes
  - Command+K: actions listed by name and keywords, plus "Manage actions…"; a chat-mode action with a target opens a second page to pick a document or repo
  - Notifications (`report_finding`) and `outputs/actions/<name>.md` (`write_outputs`)
- **Migration notes:** Ids carry over, so run history repointed without a mapping table. `notify` became `report_finding`, `report` became `write_outputs`, and `maintain` became a **manual chat action** — the prompt survives, the schedule does not, and it can be restored once proposals outlive the session that made them. `custom_prompts`, `scheduled_loops`, and `loop_runs` are dropped by migration 118, and the whole legacy stack — both services, the loop runner, the custom-prompt generation service, their handlers, endpoints, events, repositories, stores, and the Command+K task badge — is deleted. The `loop_finding` update event was renamed `action_finding` as part of that.
- **Maturity signal:** New, but the merge is complete — no legacy path remains. The capability grant is enforced at two layers and covered by tests. Retiring `CustomPromptGenerationService` also removed the one agent path in KPM that ran without a permission layer.

---

## Settings & Configuration

### 61. General Settings (Account, Workflow, App Preferences)
- **What it does:** Global app preferences. The Account tab shows API key/auth state and the chat approval-mode toggle (manual review vs. auto-apply, feature 10). The Workflow tab holds a Git sub-tab (branch naming template) plus sub-tabs that surface other settings features in project context: Tracker (feature 27) and Storybook. Theme selection and imported themes are covered separately in feature 96.
- **Key code locations:**
  - Service: `src/main/services/core/SettingsService.ts`
  - Store: `src/renderer/stores/generalSettingsStore.ts`
  - Component: `src/renderer/components/settings/GeneralSettings.tsx`, `src/renderer/components/settings/WorkflowSettings.tsx` (sub-tab shell for Tracker/Git/Storybook)
  - DB: `app_settings` table (key-value store)
  - IPC handlers: `src/main/ipc/handlers/settings.ts`
- **Entry points / surfaces:**
  - Settings modal: Account and Workflow tabs; branch naming template lives under Workflow → Git
  - Save button to persist
- **Dependencies / integrations:**
  - App lifecycle: theme applies to all windows
  - Git: branch naming template used when scaffolding dev-session worktrees
- **Maturity signal:** Mature. Basic settings comprehensive.

### 62. MCP Server Configuration
- **What it does:** Users can register custom MCP (Model Context Protocol) servers. System discovers and lists available servers, their resources, and tools. Persisted configuration allows servers to be used in prompts and agent sessions. Each chat provider reaches MCP differently: Claude servers come from `~/.claude.json` and are enabled per-server in KPM Settings; Codex reads its own config and KPM injects the `kpm` server; pi reaches every server in the user's `~/.pi/agent/mcp.json` through the `pi-mcp-adapter` extension's single `mcp` gateway tool, so pi servers are added and disabled in that file rather than in KPM. Board pi agents get no MCP.
- **Key code locations:**
  - Service: `src/main/services/core/McpDiscoveryService.ts` (discovers server capabilities)
  - Component: `src/renderer/components/settings/McpServersSettings.tsx`
  - Store: `src/renderer/stores/mcpServersStore.ts`
  - IPC handlers: `src/main/ipc/handlers/mcpServers.ts`
  - pi gateway: `MCP_GATEWAY_TOOLS` and the `bindExtensions` call in `src/main/pi/PiChatSession.ts` (extensions only start on the `session_start` event that `bindExtensions` emits)
  - DB: `app_settings` (MCP server configs stored as key-value)
- **Entry points / surfaces:**
  - Settings → Connections → MCP Servers
  - "Add MCP Server" button: enter command (e.g., npx @modelcontextprotocol/server-*.exe)
  - List of registered servers with capabilities
  - Enable/disable toggle per server
  - Test connection before saving
- **Dependencies / integrations:**
  - Claude Agent SDK: can use MCP servers for extended context/tools
  - Prompts: MCP resources/tools available to Claude
  - Slack MCP: optional Slack integration via MCP
  - File MCP: filesystem tools via MCP
- **Maturity signal:** Mature. MCP discovery and registration working.

### 64. Project Write Grant
- **What it does:** The first direct file, shell, or git write in a project prompts inline in chat with two answers: "Don't allow" or "Always allow in this project". Allowing persists a row in `project_write_grants` and covers every chat in that project — plus scheduled and Cmd+K action runs, which have no chat to ask in — until the user turns it off under Settings → Writes, which is also where writes can be turned on ahead of time. That matters for Codex, which reports read-only without attempting a write, so the prompt may never fire on its own. Nothing else prompts: reads, network reads, and MCP tools are allowed outright, credential and secret paths are denied outright, and project file and AGENTS.md edits are intercepted into the approval queue rather than asked about. The one other prompt is MCP form elicitation, answered for that call only.
- **Key code locations:**
  - Grant: `src/main/chat/writeGrants.ts` (project-scoped, hydrated at startup, coalesces concurrent asks)
  - Service: `src/main/services/core/PermissionService.ts` (hydrate / read / grant / revoke), `PermissionPromptService.ts` (`promptUser()` — runtime prompting logic)
  - Rules: `src/main/claude/permissions.ts` (`canUseTool`)
  - Components: `src/renderer/components/settings/PermissionsSettings.tsx` (toggle) and `useProjectWriteGrant.ts`, `src/renderer/components/permission/PermissionPrompt.tsx` (inline prompt)
  - DB: `project_write_grants` table (project_id, granted_at)
  - IPC handlers: `src/main/ipc/handlers/permission.ts`
- **Entry points / surfaces:**
  - Runtime: inline prompt in chat on the first write the project has not granted
  - Settings → Writes tab: on/off toggle for the current project, with what the grant covers
- **Dependencies / integrations:**
  - Claude Agent SDK: permission check runs before every tool execution
  - Codex / pi: the same grant selects Codex's `workspace-write` sandbox mode and gates pi's write builtins
  - Approval queue: project file and context file edits go there instead of prompting
- **Maturity signal:** Mature. One question, asked once per project, persisted.


---

## File & Workspace Management

### 68. File Explorer (Browse Project Folder)
- **What it does:** Sidebar tree showing project folder structure (excluding hidden files and node_modules), kept fresh by a filesystem watcher that refreshes the tree and offers open files a reload when they change externally (edits, git operations, etc.). Users can expand/collapse folders, drag files to chat or focused resources, view file details, open in editor, and create new files or folders via right-click context menu. Right-clicking a folder creates inside it; right-clicking a file creates a sibling in the same parent directory. The new-item input appears as a phantom row at the correct indentation level in the virtualized tree.
- **Key code locations:**
  - Service: `src/main/services/files/FileExplorerService.ts` (list directory, check hidden), `FileWatchService.ts` (fs.watch integration), `ProjectWatcherService.ts` (high-level watcher)
  - Component: `src/renderer/components/sidebar-tree/` (tree rendering and drag-drop), `ProjectTreeNode.tsx` (inline creation phantom row), `FileContextMenu.tsx` (New File / New Folder actions)
  - Store: `src/renderer/stores/fileTreeStore.ts` (expanded state, selection, refresh on watcher notification)
  - IPC handlers: `src/main/ipc/handlers/fileExplorer.ts`; watcher notifications pushed to renderer on file change
- **Entry points / surfaces:**
  - Sidebar: "Sources" section with file tree; click to expand/collapse
  - Drag file to add to focused resources
  - Right-click folder: New File, New Folder, open in editor, copy path, etc.; right-click file: New File (sibling), open in editor, copy path, etc.
  - Inline phantom-row input for naming new item; icon indicators for language/type
  - Automatic: tree updates and editor refresh prompts require no user action
- **Dependencies / integrations:**
  - File system: reads project folder structure, `fs.watch` for change detection
  - Focused resources: drag-drop integration
  - Workspace editor: can open files for editing; detects externally changed open files
  - Git: branch changes detected via the separate `RepoWatcherService`
- **Maturity signal:** Mature. File tree and watcher both responsive and robust.

### 69. Workspace View & File Editor
- **What it does:** The default main view is chat-first — full-width chat until a file is opened, at which point the layout splits into a center editor with chat narrowed to the side; closing the last file returns to chat-only. Markdown files open in the dedicated Markdown editor (Monaco-backed edit pane plus preview/toolbar); other text/code files use Monaco directly for editing and read-only viewing. Every file opened stays open as a tab, so reopening one is a click in the strip rather than another hunt through the file tree. There is no save action: edits autosave a second after typing stops, for background tabs as much as the visible one, and closing a tab inside that window writes it out first. Which tabs were open is remembered per project across restarts; the file tree marks them with an accent rail, full strength for the tab on screen and faded for the rest.
- **Key code locations:**
  - Component: `src/renderer/components/workspace/WorkspaceView.tsx` (layout), `DocumentTabStrip.tsx` (the strip), `FileEditor.tsx` (editor router), `documentTabLabels.ts` (labels, disambiguated only when names collide)
  - Autosave: `src/renderer/components/workspace/documentAutosave.ts` (timer logic) + `useDocumentAutosave.ts` (mounted above the editor, which is why a background tab still saves)
  - Store: `src/renderer/stores/workspaceStore.ts` (`openDocuments` + `activeDocumentId`, per-document dirty state and save errors), `workspaceDocumentPersistence.ts` (tab arrangement in localStorage)
  - Service: `src/main/services/files/RepoFileService.ts` (read/write files)
  - IPC handlers: `src/main/ipc/handlers/repoFiles.ts`
- **Entry points / surfaces:**
  - Workspace tab in main navigation (default view); click a file in the tree to open it and shift to split layout
  - Tab strip above the editor: click to switch, dirty dot per tab, close button on hover; arrow keys, Home/End, and Delete work within the strip
  - Cmd+W closes one tab and only reaches the chat session once the strip is empty; Cmd+Option+[ / ] cycles tabs
- **Dependencies / integrations:**
  - Markdown editor: toolbar, preview, markdown-specific editing flow; also the entry point for the Markdown Focus Reader (feature 106)
  - Monaco editor: syntax highlighting, read-only code viewing, basic language support for non-markdown files
  - Approval queue: file changes can be queued if from a Claude proposal
  - File watcher: every open tab follows an external update, rename, or deletion, not just the visible one
- **Maturity signal:** Mature. Layout adaptive and responsive. No drag-to-reorder or split panes. No advanced editor features (debugger, terminal integration).

### 73. Attachment Management (Upload & Link Files)
- **What it does:** Users can upload files (documents, images, etc.) and link them to plan items. Attachments stored in project folder or app cache.
- **Key code locations:**
  - Service: `src/main/services/core/AttachmentService.ts` (upload, delete, list)
  - Repository: `src/main/db/repositories/impl/AttachmentRepository.ts`
  - IPC handlers: `src/main/ipc/handlers/attachments.ts`
  - DB: `attachments` table (project_id, file_name, file_path, uploaded_by, created_at)
- **Entry points / surfaces:**
  - Plan item modal: attachments section
  - Drag file to modal to upload
- **Dependencies / integrations:**
  - File system: stores attachments in project folder
  - Database: tracks attachment metadata
- **Maturity signal:** Mature. Attachment management basic but functional.

---

## Notifications & Updates

### 74. Toast Notifications (Feedback Messages)
- **What it does:** Non-blocking toast notifications for successful actions (item created, synced, etc.), warnings, and errors. Auto-dismiss after timeout. Multiple toasts stacked.
- **Key code locations:**
  - Store: `src/renderer/stores/toastStore.ts` (queue, dismiss)
  - Component: `src/renderer/components/ui/Toast.tsx` (rendering)
  - Hook: `toast()` function exported from stores
- **Entry points / surfaces:**
  - Triggered throughout app on actions
  - Bottom-right corner by default
  - Click to dismiss, or auto-dismiss after 4-5 seconds
- **Dependencies / integrations:**
  - Global use: exported from stores for easy access
- **Maturity signal:** Mature. Toast system clean and widely used.

---

### 107. Notification Bell (Background Event Feed)
- **What it does:** A topbar bell collects events the user should know about while they were doing something else, with an unread count and a dropdown of the 50 most recent. Each entry carries a severity, a relative timestamp, and — where a target can be resolved — a click-through. Producers run in the main process and funnel through one event bus, so every source presents identically. Today those are: action findings, pull request changes picked up by review polling, and board agent automation reaching a phase that needs the user (`ready_for_review`, `needs_attention`, `paused`). Identical events inside a 30-second window collapse into one so a fast poller can't spam the feed. Notifications are in-memory only — the list resets on restart — and there is no OS-level delivery, so the app must be open to see them.
- **Key code locations:**
  - Bus: `src/main/services/core/UpdateEventBus.ts` (`UpdateEvent` union — one variant per source)
  - Service: `src/main/services/core/NotificationService.ts` (`NOTIFY_RULES`, one rule per event kind, owning its dedupe key and presentation; `present()` returning null suppresses)
  - Producers: `ActionRunnerService` (`action_finding`), `ReviewPollService` (`pr_changed`), `automationPhaseMachine` (`board_agent`)
  - IPC: `src/shared/ipc/notificationEvents.ts` (`notification:new` push event; no invoke surface)
  - Store: `src/renderer/stores/notificationStore.ts` (unread/read, 50-entry cap)
  - Component: `src/renderer/components/notifications/NotificationBadge.tsx` (bell, dropdown, link resolution)
- **Entry points / surfaces:**
  - Topbar bell → unread count → dropdown → click an entry to navigate, or dismiss it
  - `dev_session` links reveal the board session's detail pane; `plan_item` focuses the item; `pr`/`session`/`external` open the relevant URL
  - An entry from a project that isn't open names that project and switches to it before navigating, via the `switch-project` store event
- **Dependencies / integrations:**
  - Board automation: `automationPhaseMachine` is the sole writer of `dev_sessions.automation_phase`, which is why it is also the single place board notifications are emitted from
  - Cross-project concurrency (feature 110) owns the switch-then-navigate path these links use
  - `pr`/`session`/`external` links read a URL off a record in the open project's stores, so they remain resolvable only while that project is open — no notification kind produces one for another project today
- **Maturity signal:** Developing. The pipeline and the board/loop/PR producers work, but there is no persistence, no per-source settings, no OS delivery, and the toast system is entirely separate.

---

### 110. Cross-Project Concurrency (Work Keeps Running, and Says So)
- **What it does:** Work started in one project keeps running when the user opens another, and the UI says what is still running and what is blocked on them. Chat sessions, board agents, and terminal shells all live in the main process keyed by session id, so a project switch never stops them — the switch only resets the renderer's project-scoped stores. On top of that: the project switcher marks every project with live work (amber when something there is waiting on the user, pulsing accent when it is just busy); a topbar pill surfaces permission requests the user cannot see from where they are, including ones in another project, and clicking a row switches project and focuses the blocked chat tab; a background chat tab with a pending request marks itself; rejoining a session mid-turn replays the text and tool activity that streamed while the user was elsewhere; and the switch itself is a non-blocking progress sliver, so the outgoing project stays usable (and returnable) for the whole load.
- **Key code locations:**
  - Cross-project counts: `src/main/services/core/ActivityService.ts` (samples chat/agent/terminal registries, broadcasts only on change), `src/shared/ipc/activityEndpoints.ts` + `activityEvents.ts`
  - Count sources: `StreamingSessionService.processingCountsByProject`, `AgentSessionManager.activityCountsByProject`, `TerminalService.runningCountsByProject`
  - Renderer state: `src/renderer/stores/activityStore.ts`, `src/renderer/hooks/useActivitySync.ts` (both deliberately app-lifetime, not project-scoped)
  - Blocked requests: `src/renderer/stores/permissionStore.ts` (`selectUnseenRequests`, `settleRequest`), `src/renderer/components/permission/PendingRequestsBadge.tsx`, `permission:settled` in `src/shared/ipc/permissionEvents.ts`
  - Switching from anywhere: `switch-project` in `src/renderer/stores/storeEvents.ts`, subscribed only by `src/renderer/hooks/useProjectLoader.ts`
  - Mid-turn rejoin: `ActiveSessionInfo.partialResponse`/`partialActivities` in `StreamingSessionService`, replayed by `rehydrateActiveSessions` in `src/renderer/hooks/chatEventRouter.ts`
  - Terminal scoping: `src/main/services/streaming/TerminalService.ts` (project-tagged sessions, project-filtered `list`, `killForProject`)
- **Entry points / surfaces:**
  - Project switcher → dot beside each busy project, and beside the closed project button when another project is busy; tooltip names what is running
  - Topbar "N waiting" pill → dropdown of blocked requests with their project → click to go answer it
  - Chat tab strip → amber dot on a background tab whose turn is waiting for approval
- **Dependencies / integrations:**
  - `projectScopedStores.ts` is the boundary: `permissionStore` and `activityStore` are deliberately absent from it, since resetting them on switch is the bug they exist to fix
  - Terminal sessions are project-scoped but never killed on switch; a project delete is the only thing that reaps them (`killForProject`, called from `useProjectLoader.deleteCurrentProject`)
  - Notification bell (feature 107) reuses `switch-project` for cross-project click-through
- **Known gaps:**
  - Board agent question *text* raised while another project is open is still dropped by `agentEventRouter`'s `isKnownTrackedId` filter. The `waiting_for_input` agent state that drives the UI is reconciled from main on switch back, and the activity snapshot counts it, so nothing is silently stuck — but no surface renders the question text today, in any project.
  - Replayed in-flight activities all land before the replayed text; main does not record their original interleaving.
  - Only one window, so "concurrently" means switching between projects, not viewing two at once.
- **Maturity signal:** Developing. The backend never interrupted anything; what is new is the renderer no longer hiding it. No per-project notification muting, no OS-level delivery, no multi-window.

---

## Onboarding & Initial Setup

### 76. Project Onboarding & Context Generation (AGENTS.md Generation)
- **What it does:** First launch (or any time no project is open) shows a welcome pane in the main content area: open a repository (creates a project instantly, named after the folder), start a blank project, open an existing one, and a Claude Code availability line. Creating a project via the modal is a single instant form (name, code repositories, optional notes-and-context folder) — no generation step blocks it. The folder field is optional because a project that names none lands in a KPM-managed folder under `<userData>/projects/`, the location `project:get-default-location` reports; naming one adopts it as-is, creating it if it doesn't exist yet, and `project:inspect-folder` warns first when the chosen folder is a git repository (KPM's AGENTS.md would land in its `git status`). Once created, the workspace home screen offers a dismissible nudge to generate the project's AGENTS.md context file if one is missing or still the placeholder written at creation. Accepting the nudge (or invoking "Regenerate Context" once a real file exists) opens a modal that configures scope, runs Claude against the connected repos as a background task, and shows a diff-reviewed preview before saving. The generated file targets non-discoverable content (cross-repo relationships, verified commands, boundaries, doc pointers, ≤80 lines) rather than restating searchable architecture. If generation completes while the modal is closed, the result routes into the standard approval queue (or auto-applies, per the global setting) instead of requiring a badge-click back into the modal. Reads an existing AGENTS.md or CLAUDE.md if either is present in the repo.
- **Key code locations:**
  - Service: `src/main/services/generation/OnboardingService.ts` (scan + generation, plus `startGeneration`/`saveContext`/context-directory persistence called directly by the IPC handler)
  - Component: `src/renderer/components/welcome/WelcomePane.tsx` (no-project landing surface)
  - Component: `src/renderer/components/onboarding/CreateProjectModal.tsx` (instant create form)
  - Component: `src/renderer/components/onboarding/RegenerateContextModal.tsx` (configure → generate → review)
  - Component: `src/renderer/components/workspace/WorkspaceHome.tsx` (post-create nudge)
  - Bridge: `src/renderer/services/onboardingTaskBridge.ts` (background-completion routing into the approval queue)
  - IPC handlers: `src/main/ipc/handlers/onboarding.ts`
  - Shared: `src/shared/contextFile.ts` (placeholder content + `isPlaceholderContext`)
  - DB: stores selected directories in `projects.context_directories`
- **Entry points / surfaces:**
  - Welcome pane (no project open) → "Open a repository" instant create, "New project" modal, project list, Claude availability status
  - Create Project modal → name, optional folder, connect repositories → creates project immediately
  - Workspace home nudge → "Generate context" → opens `RegenerateContextModal`
  - Configure phase: description + per-repo feature directories
  - Generate phase: progress log, runs as a background task (can continue in background)
  - Review phase (modal open): diff against existing content, editable, Accept & Save; modal closed: pending item in the approval queue
- **Dependencies / integrations:**
  - Claude SDK: Sonnet for codebase analysis and synthesis
  - File system: scans directories
  - Context file: saves generated AGENTS.md to project folder; also injected into board dev-session prompts (see feature 19)
  - Background task store: generation survives modal close; topbar badge resumes into `RegenerateContextModal` when the result can't be queue-routed (different project open)
  - Approval queue: `processContextFileUpdate` handles review-or-auto-apply for background completions
- **Maturity signal:** Mature. Create/generate flows decoupled; generation is opt-in and non-blocking.

---

## Debugging & Monitoring

### 77. Debug & Performance Logging (Tool Calls, Render/Latency Metrics)
- **What it does:** Two debug-only introspection surfaces. Tool call logging records every Claude tool call — name, category, input parameters, referenced file paths, turn index, timestamp — viewable in a debug panel to understand what Claude did and troubleshoot duplicate reads or noisy tool usage. Performance logging is opt-in (via env var) and records chat streaming latency, view-switch timing, and sync-operation timing to help identify bottlenecks.
- **Key code locations:**
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts` (logs to memory + NDJSON temp file), `src/renderer/components/tool-log/ToolLogPanel.tsx`, `src/renderer/stores/toolLogStore.ts`, `src/main/ipc/handlers/toollog.ts`
  - Perf logging: `src/renderer/utils/perfLogger.ts` (`isPerfLoggingEnabled()`), spans started at the call sites that care (project load, view switch, plan refresh)
- **Entry points / surfaces:**
  - Debug menu / developer tools: "Tool Call Log" panel — filter by tool name or date, click to expand
  - Perf metrics panel and console logs (only when enabled)
- **Dependencies / integrations:**
  - Streaming session: tool calls logged during chat; approval queue: tool calls correlated with approval items
  - Environment: `KPM_PERF=1` or `KPM_PERF=true` enables performance logging
- **Maturity signal:** Mature. Tool logging is comprehensive and always available; perf logging is a solid opt-in aid for optimizing hot paths.

### 79. Shell Open/Reveal Operations
- **What it does:** Provides safe Electron shell operations for revealing files in Finder/Explorer, opening local paths with the default application, and opening validated external URLs in the browser.
- **Key code locations:**
  - IPC handler: `src/main/ipc/handlers/shell.ts`
  - URL safety: `src/main/security/externalUrl.ts`
- **Entry points / surfaces:**
  - File/repo context menus
  - Artifact/document open actions
  - PR and external-link buttons
- **Dependencies / integrations:**
  - Electron `shell`
  - External URL allow-list validation
- **Maturity signal:** Mature. Small, security-scoped platform integration.

---

## Cross-Cutting Infrastructure & Patterns

### 83. Service Container & Dependency Injection
- **Architecture:** All services created via factory functions with dependencies injected. Single composition root in `appServices.ts`, instantiated once through `initializeServices()`.
- **Key code locations:**
  - Composition root: `src/main/services/appServices.ts`
  - Container: `src/main/services/container.ts`
  - Service interfaces: Each service has interface defining contract
  - Factories: Each service is a factory function (e.g., `createPlanService`)
- **Why it matters:** Services can be mocked for testing. Clean dependency graphs. No circular imports.

### 84. Approval Queue (Unified Pending Actions)
- **Architecture:** Single queue for plan actions, document updates, implementation proposals, context file edits, and review replies. Items processed one at a time. Approval UI shows diffs and context. User can approve/reject. Rejected items don't execute.
- **Key code locations:**
  - Store: `src/renderer/stores/proposedChangeDisposal.ts` (unified queue)
  - Component: `src/renderer/components/planning/PendingActionsPanel.tsx`, approval overlays
  - Discriminated union: `ProposedChange` (`plan-actions`, `document`, `context-file`, `move`, `delete`, and `review-reply`)
- **Why it matters:** Prevents Claude from making changes unilaterally. Single approval model for all change types. Reduces user confusion.

### 85. Store Events (Cross-Store Communication)
- **Architecture:** Zustand stores avoid circular imports by emitting typed events via `storeEvents.ts`. Other stores subscribe to events (e.g., `status-changed` event). Decoupled communication without shared context.
- **Key code locations:**
  - Module: `src/renderer/stores/storeEvents.ts` (event definitions and emitter)
  - Listeners: stores subscribe via `subscribe()` or `on()` helpers
- **Events:** see `storeEvents.ts` for the current set (`status-changed`, `plan-item-created`, `navigate-to-view`, `reveal-board-column`, `file-explorer-changed`, `chat-file-updated`, `tracker-export-completed`, etc.) — don't hand-duplicate the list elsewhere, it drifts.
- **Why it matters:** Avoids circular dependencies between stores. Clean event-driven architecture.

### 86. IPC Handler Pattern (Validation + Service Delegation)
- **Architecture:** Each IPC handler validates input with Zod schema, then delegates to service layer. Services return `ServiceResult<T>` (success/failure). IPC handlers forward result to renderer.
- **Key code locations:**
  - Validation schemas: `src/shared/ipc/{domain}Endpoints.ts` (one registry per domain, the single owner of each endpoint's Zod schema)
  - Handler pattern: `src/main/ipc/handlers/*.ts` (each handler follows same pattern)
  - Utility: `createRegistryIpcHandlers()`/`bindRegistryHandlers()` (`src/main/ipc/validation/utils.ts`) for consistent wrapping
- **Why it matters:** Clear separation of concerns. Type-safe IPC. Easy to test services independently of IPC.

### 87. Streaming Session Architecture (Push-to-Pull Adapter)
- **Architecture:** The Claude Agent SDK's `query()` consumes streaming input as a pull-based async generator, but the renderer's user input arrives as discrete push events over IPC. `AsyncMessageQueue` bridges the two — it queues incoming renderer messages and the SDK pulls from it as its input generator. In the other direction, SDK output reaches the renderer via pushed IPC events (`webContents.send`), not renderer-initiated polling.
- **Key code locations:**
  - Service: `src/main/services/streaming/StreamingSessionService.ts` (manages session + message queue, sends IPC events on new output)
  - Adapter: `src/main/claude/streaming/AsyncMessageQueue.ts` (renderer-input push-to-pull adapter for the SDK generator)
- **Why it matters:** Lets streaming-input mode support mid-turn steering (queued follow-ups) without the renderer needing to poll for SDK output.

### 88. Database Repositories (Type-Safe Data Access)
- **Architecture:** Repository pattern isolates database operations. Each repository has interface and implementation. DI container provides repositories to services. Prevents circular data access, aids testing.
- **Key code locations:**
  - Interfaces: `src/main/db/interfaces/` (organized by domain)
  - Implementations: `src/main/db/repositories/` (SQL operations)
  - Container: `src/main/db/container.ts` (factory for all repositories)
- **Why it matters:** Type-safe queries. Swappable implementations for testing. Centralized SQL logic.

### 89. Domain Services (Multi-Table Transactions)
- **Architecture:** Some operations require multi-table coordination (import, sync, plan actions). Domain services in `src/main/db/domain/` handle these. Direct database access (not via repositories). Services return explicit error types.
- **Key code locations:**
  - Services: `src/main/db/domain/*.ts` (SyncService, ImportService, PlanActionService, etc.)
  - Used by: Application services call domain services for complex ops
- **Why it matters:** Keeps transactional logic in one place. Testable, despite DB access.

### 90. Zustand Store Slices (Modular State)
- **Architecture:** Main project store is sliced: `projectSlice.ts` (CRUD), `planSlice.ts` (plan items, actions), `uiSlice.ts` (UI state), `resourceSlice.ts` (repos, attachments, worktrees). Slices composed into single store via `useProjectDomainStore()`. Fine-grained subscriptions.
- **Key code locations:**
  - Slices: `src/renderer/stores/project/*.ts`
  - Composition: `src/renderer/stores/projectDomains.ts` (combines slices)
  - Usage: `useProjectDomainStore(useShallow(state => ...))` pattern
- **Why it matters:** Avoids monolithic store. Each slice can be tested independently. Fine-grained subscriptions prevent unnecessary renders.

### 91. Claude Tool Schemas (Type-Safe Tool Definitions)
- **Architecture:** Tools defined via `tool()` helper with Zod schemas for input/output. Tool handlers typed. SDK validates inputs before calling.
- **Key code locations:**
  - Tool factory: `src/main/kpmTools/tools/index.ts` (tool() helper)
  - Schemas: Each tool file (plan-items, plan-changes, etc.) defines its own schemas
  - Creation: `createKpmServer.ts` assembles all tools into MCP server
- **Why it matters:** Type-safe tool definitions. SDK validates inputs. Errors caught early.

### 92. Prompt Registry (Centralized Prompt Definitions)
- **Architecture:** All Claude system prompts registered in `src/main/chat/prompts/promptRegistry.ts`. Each prompt has: key, name, description, category, default content, variables. System prompt built by assembling registry modules. User can override any prompt.
- **Key code locations:**
  - Registry: `src/main/chat/prompts/promptRegistry.ts`
  - Modules: `src/main/chat/prompts/*.ts` (modes, tools, workspace, etc.)
  - Override service: `src/main/services/core/PromptOverrideService.ts` (resolves user overrides)
  - Prompt building: `src/main/services/streaming/StreamingSessionService.ts`
- **Why it matters:** Centralized prompt management. Easy to customize. Versioning and testing prompts.

### 93. Git Integration (Utilities & Watcher)
- **Architecture:** Git operations wrapped in `gitUtils.ts` (getDiff, getCommitLog, etc.). `RepoWatcherService` watches `.git/HEAD` for branch changes and broadcasts via IPC. Branch state stored in store for UI display.
- **Key code locations:**
  - Utils: `src/main/services/repo/gitUtils.ts` (exec git commands)
  - Watcher: `src/main/services/repo/RepoWatcherService.ts` (monitors branch changes)
  - IPC broadcasts: `repo:branch-changed` event
  - Store: `src/renderer/stores/project/resourceSlice.ts` (repoBranches state)
  - UI: Branch badge in `src/renderer/components/sidebar-tree/RepoItem.tsx`
- **Why it matters:** Git-aware branch tracking. Real-time UI updates. No polling overhead (fs.watch).

### 94. Context Building (Plan Context for Claude)
- **Architecture:** When a chat session needs plan context, `buildContext()` (from `createContextBuilder`) queries the project, repos, attachments, and plan items and assembles a `PlanContext` for the system prompt. `buildItemReferenceTable()` renders the item tree with hierarchy, status, and labels, switching to a root-only summary above `FULL_HIERARCHY_THRESHOLD` items to avoid prompt bloat.
- **Key code locations:**
  - Function: `src/main/claude/contextBuilders.ts` (`createContextBuilder`, `buildContext`)
  - Types: `src/main/chat/prompts/types.ts` (`PlanContext`)
  - Formatting: `src/main/chat/prompts/planFormatting.ts` (`buildItemReferenceTable`, `FULL_HIERARCHY_THRESHOLD`)
  - Size control: full hierarchy below threshold, root items + `query_plan_items` tool above it
- **Why it matters:** Claude understands project structure without exposing all items. Efficient context encoding.

### 95. Activity Tracking (Tool Calls, Plan Changes)
- **Architecture:** All tool calls logged with input, output, duration. Plan actions logged with source (user, Claude). Activity available for audit trails and performance analysis.
- **Key code locations:**
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts`
  - Activity getter: `src/main/claude/activity.ts` (recent tool activity)
  - Storage: in-memory recent entries per chat session plus temp NDJSON log file
  - Retrieval: `src/main/ipc/handlers/toollog.ts`
- **Why it matters:** Debugging. Understanding what Claude did. Audit trail for compliance.

---

## Recently Audited Additions

### 96. Custom Themes and VS Code Theme Import
- **What it does:** Users choose built-in themes or import a VS Code theme from `vscodethemes.com`. Imported themes are normalized into KPM color tokens, applied to the app shell, and reused by Monaco so the editor matches the selected theme. Theme colors have a single owner (`src/shared/theme.ts`) shared by the renderer and main process, projected to CSS variables at runtime rather than declared in `index.css`. The theme applies synchronously before React mounts (no post-mount flash), and the main process reads the last-resolved background color to set the window's background before the page paints, so launch never flashes an unstyled default.
- **Key code locations:**
  - Shared color manifest: `src/shared/theme.ts` (palettes, semantic/depth defaults, CSS variable generation)
  - Service: `src/main/services/core/CustomThemeService.ts`
  - Repository: `src/main/db/repositories/impl/CustomThemeRepository.ts`
  - IPC handlers: `src/main/ipc/handlers/customThemes.ts`, `src/main/ipc/handlers/theme.ts` (renderer reports resolved background color)
  - Types: `src/shared/customThemes.ts`
  - Context: `src/renderer/contexts/ThemeContext.tsx`
  - Components: `src/renderer/components/settings/ThemesSettings.tsx`, `src/renderer/components/settings/ThemeSelector.tsx`
  - Theme runtime (DOM application, Mermaid/Monaco projections): `src/renderer/themes/index.ts`
  - Pre-mount boot: `src/renderer/themeBoot.ts`
  - Window background persistence: `src/main/bootstrap/themeAppearance.ts`, read by `src/main/bootstrap/windowManager.ts`
  - DB: `custom_themes`
- **Entry points / surfaces:**
  - Settings → Themes tab
  - Theme grid with preview swatches
  - Import field for VS Code Themes URLs
  - Delete button for custom themes
- **Dependencies / integrations:**
  - Marketplace VSIX download from Visual Studio Marketplace
  - Monaco theme data generation
  - Local storage for current theme preference and last-resolved custom-theme colors (used by the pre-mount boot before the custom-theme IPC load resolves)
- **Maturity signal:** Mature. URL validation, package size limits, zip parsing, persistence, delete flow, and unit tests exist.

### 97. Repository Environment Configuration
- **What it does:** Connected repositories declare how KPM should capture shell environment (`auto`, `direnv`, `nix`, `none`) and which checkout/worktree should be active for chat context. Environment is captured at agent session start and injected into the agent's process environment.
- **Key code locations:**
  - Service: `src/main/services/repo/RepoService.ts`
  - Service: `src/main/services/repo/EnvironmentService.ts`
  - Service: `src/main/services/repo/DevSessionService.ts` (environment injection)
  - Repository: `src/main/db/repositories/impl/RepoRepository.ts`
  - Components: `src/renderer/components/board-view/AgentStartModal.tsx` (environment picker), `src/renderer/components/sidebar-tree/RepoContextMenu.tsx`, `src/renderer/components/sidebar-tree/RepoListSection.tsx`
  - Stores: `src/renderer/stores/project/resourceSlice.ts`
  - IPC handlers: `src/main/ipc/handlers/repos.ts`
  - DB fields: `repos.environment_mode`, `repos.active_worktree_path`
- **Entry points / surfaces:**
  - Start Agent modal: environment mode picker (Auto / DirEnv / None) per session
  - Repository context menu: active worktree switcher
  - Chat context: active worktree path is preferred over the repo root when set
- **Dependencies / integrations:**
  - Git worktree discovery
  - `direnv`, `nix-shell`, or flake-based environment capture when configured
  - PTY setup output and cancellation
- **Maturity signal:** Mature. User-visible configuration is persisted and used by chat, repo watching, and session startup.

### 99. Merge Queue and PR Ordering
- **What it does:** Board view shows sessions with open PRs in a merge queue. Ordering is derived from plan-item dependency graph by default, with drag-to-reorder overrides persisted per session. Blocked PRs are marked when their dependencies are not merged.
- **Key code locations:**
  - Component: `src/renderer/components/board-view/MergeQueuePanel.tsx`
  - Service: `src/main/services/repo/mergeOrder.ts`
  - Service: `src/main/services/repo/DevSessionService.ts`
  - Repository: `src/main/db/repositories/impl/DevSessionRepository.ts`
  - Store: `src/renderer/stores/devSessions/index.ts`
  - IPC handlers: `src/main/ipc/handlers/devSessions.ts`
  - DB field: `dev_sessions.merge_order`
- **Entry points / surfaces:**
  - Board view: horizontal merge queue above status columns
  - Drag queue item to assign explicit order
  - Click session title to open detail pane
  - Click PR number to open GitHub
- **Dependencies / integrations:**
  - GitHub PR state/review decision
  - Plan dependencies for topological ordering
  - Dev session PR metadata
- **Maturity signal:** Mature. Small but well-integrated workflow with persisted user overrides.

### 101. Storybook Component Discovery
- **What it does:** Projects can store a Storybook URL. Claude tools query the Storybook `index.json` to list, inspect, and search design-system components before planning UI work.
- **Key code locations:**
  - Project field: `projects.storybook_url`
  - Claude tool: `src/main/kpmTools/tools/storybook.ts`
  - Prompt docs: `src/main/chat/prompts/toolDocs.ts`
  - Project service: `src/main/services/core/ProjectService.ts`
  - Component: `src/renderer/components/settings/StorybookSettings.tsx`
  - IPC handlers: `src/main/ipc/handlers/projects.ts`
- **Entry points / surfaces:**
  - Settings → Connections → Storybook
  - Test connection button
  - Claude tools: `storybook_list_components`, `storybook_get_component`, `storybook_search`
- **Dependencies / integrations:**
  - Reachable Storybook instance
  - Storybook `index.json`
  - Claude in-process MCP tools
- **Maturity signal:** Mature but optional. It is enabled only when a project has a Storybook URL.

### 102. Plan References (`@plan/<uuid>` tokens)
- **What it does:** Markdown surfaces (descriptions, intents, acceptance criteria, chat, project documents) can carry `@plan/<uuid>` tokens that resolve to a `PlanItem`. Tokens render as inline chips in the renderer, fold to readable titles in Monaco, expand to full item context for agents, and are rewritten to native syntax (Jira ADF, Linear refs, Confluence links, GitHub markdown) at every export boundary so they never leak to external trackers.
- **Key code locations:**
  - Token primitive: `src/shared/planRefs.ts` (pure parser/expander)
  - Resolver: `src/main/documents/planRefResolver.ts` (used at every export boundary)
  - Agent context: `src/main/claude/contextRefs.ts` (`formatPlanRefSection` prepends a `<plan-refs>` block)
  - Claude tool: `src/main/kpmTools/tools/plan-refs.ts` (`extract_plan_items_from_doc`)
  - Validation: `src/main/db/domain/PlanActionService.ts` (rejects unresolved refs)
  - Renderer chip: `src/renderer/components/plan-ref/PlanRefChip.tsx`, `src/renderer/utils/markdown.tsx`
  - Monaco integration: `src/renderer/components/ui/planRefMonaco.tsx` (folds UUIDs to titles, surfaces unresolved-ref diagnostics)
  - Search: refs surface in approval UI and global search index
  - Export sites: `markdown-to-adf.ts` (Jira), `ExportService.ts` (Linear), `ConfluenceSyncService.ts`, `GitHubService.ts`
- **Entry points / surfaces:**
  - Type `@plan/` in any markdown editor surface
  - Refs render as chips with hover preview
  - Claude can author refs in plan modifications (validated server-side)
- **Dependencies / integrations:**
  - Plan items: token resolves to `PlanItem` by id
  - Export pipeline: every export path calls the resolver before sending
- **Maturity signal:** Mature. Backlinks panel and `set_external_link` PlanAction deferred.

---

## Summary

**Total distinct features cataloged:** 60, after a consolidation pass that folded narrowly-scoped entries into their higher-level parent feature (below) so the catalog tracks capabilities rather than every implementation detail. Feature IDs are stable and not reused — a retired number's content lives at the target number shown.

**Consolidation log (this pass):**

| Retired | Folded into | Retired | Folded into |
|---|---|---|---|
| 6, 7 | 5 (Plan View) | 44, 45 | 43 (Artifact Generation) |
| 14 | 13 (System Prompts) | 54 | 53 (Confluence Integration) |
| 15, 16, 103 | 11 (Main Chat Interface) | 55, 56 | removed |
| 18, 20, 21, 108 | 19 (Plan-item Dev Sessions) | 58 | 57 (Board Agent Prompt Customization) |
| 107 | 17 (In-Process MCP Tools) | 60 | 23 (Review Loop & Automated Addressing) |
| 24 | 23 (Review Loop & Automated Addressing) | 63, 66 | removed — redundant pointers to 27/61 and 13 |
| 26 | 25 (GitHub PR Integration) | 67 | 64 (Tool Permissions) |
| 28, 29, 30 | 27 (Tracker Connections & Configuration) | 70 | 69 (Workspace View & File Editor) |
| 32 | 31 (Jira & Linear Query Tools) | 71 | 68 (File Explorer) |
| 34, 36, 37 | 33 (Sync Pipeline) | 72 | 11 (Main Chat Interface, image viewer) |
| 39 | 38 (Project Documents & Context File) | 75 | removed — dead feature, no longer tracked |
| 41, 42 | 40 (Document & Context-File Editing Tools) | 78 | 77 (Debug & Performance Logging) |
| | | 80–82 | removed |
| 8 | removed — Visual Groups only ever rendered on the Cards canvas, and went with it | | |
| 65, 104 | 109 (Actions) — Command+K custom prompts and scheduled loops merged into one object | | |

The standalone "Permissions & Security" group was folded into Settings & Configuration (feature 64). A second, verbatim-duplicate copy of the Cross-Cutting Infrastructure section (features 83–95) was also removed — it existed only as a condensed restatement and had already drifted from the primary copy.

Earlier history: Feature 5 narrowed from three plan views to one — the Cards canvas went with Visual Groups, then the Tree outline was removed as the orphan this catalog had already flagged, leaving the board; Feature 57 was reworked from "Agent Team Prompts" into "Board Agent Prompts"; Feature 105 was reworked from "Workflow Mode" into "Execution Playbooks"; Features 98 and 100 were removed; Feature 102 "Plan References" was added.

**Feature density by area:**
- Planning & Plan Management (7)
- Chat & Claude Integration (4)
- Agentic Task Execution (Board) (4)
- Tracker Integration (4)
- Documents & Context (3)
- Artifacts & Generation (1)
- Global Search & Navigation (3)
- Confluence Integration (1)
- Agent Sessions & Orchestration (3)
- Settings & Configuration (4)
- File & Workspace Management (3)
- Notifications & Updates (2)
- Onboarding & Initial Setup (1)
- Debugging & Monitoring (2)
- Cross-Cutting Infrastructure (13)
- Recently Audited Additions (5)

---

## UI Surface → Feature Map

### layout/ Components
- `Layout.tsx`: Overall app shell; hosts sidebar, main view, chat panel
  - Features: 52 (Sidebar Navigation), 74 (Toast Notifications)
- `TopBar.tsx`: Header bar hosting the project section, plan filters, and status badges
  - Features: 52 (Sidebar Navigation), 50 (Global Search), 107 (Notification Bell), 110 (Cross-Project Concurrency)
- `TopBarProjectSection.tsx`: Project name button + switcher submenu with per-project activity dots, and the Workspace/Execute switcher
  - Features: 110 (Cross-Project Concurrency)
- `TopBarPlanningControls.tsx`: Search, status filter, people filter, and selection count for the board
  - Features: 5 (Plan View), 9 (Bulk Actions)
- `Resize` hooks: Resizable panels
  - Features: 69 (Workspace View & File Editor)

### planning/ Components
- `index.tsx`: `PlanView` — mounts the board and owns the shared modals, context menus, and selection
  - Features: 5 (Plan View), 9 (Bulk Actions)
- `CreateItemModal.tsx` / `TaskEditModal.tsx`: Quick create plus unified Work Brief, Repository Scope, and operational editing
  - Features: 1 (Plan Item Hierarchy), 2 (Work Brief and Repository Scope)
- `WorkBriefEditor.tsx` / `RepositoryScopeEditor.tsx`: Reusable controlled editors shared by create, edit, and applicable approval paths
  - Features: 2 (Work Brief and Repository Scope)
- `PendingActionsPanel.tsx`: Approval queue display for plan actions, including Work Brief diffs and editable Repository Scope
  - Features: 2 (Work Brief and Repository Scope), 10 (Plan Item Approval Flow), 40 (Document & Context-File Editing Tools)
- `PlanCardMenu.tsx`: Card context menu
  - Features: 1, 4, 5, 9 (Plan item operations)

### board-view/ Components
- `BoardView.tsx`: Kanban board layout by status
  - Features: 5 (Plan View), 23 (Review Loop & Automated Addressing), 25 (GitHub PR Integration), 99 (Merge Queue)
- `BoardColumn.tsx`: Single status column
  - Features: 5 (Plan View)
- `BoardCard.tsx`: Card in board column, with phase indicator badge
  - Features: 5 (Plan View), 19 (Plan-item Dev Sessions — phase indicators)
- `DetailPane.tsx`: Right-side detail panel (activity, changes, review)
  - Features: 19 (Plan-item Dev Sessions), 23 (Review Loop & Automated Addressing), 25 (GitHub PR Integration), 105 (Execution Playbooks)
- `PhaseStepper.tsx`: Playbook step progress + paused-run actions in the detail pane
  - Features: 105 (Execution Playbooks), 19 (Plan-item Dev Sessions)
- `ActivityTab.tsx`: Narrative activity feed tab
  - Features: 19 (Plan-item Dev Sessions — narrative activity feed)
- `ChangesTab.tsx`: Detail panel tab showing dev session diff
  - Features: 19, 25
- `MergeQueuePanel.tsx`: Open-PR ordering with dependency-derived blockers
  - Features: 99 (Merge Queue)
- `AgentStartModal.tsx`: Start Implementation modal, including the current Work Brief, playbook picker, and resolved-plan preview
  - Features: 19 (Plan-item Dev Sessions), 105 (Execution Playbooks)

### chat/ Components
- `MessageList.tsx`: Rendered chat history with streaming
  - Features: 11 (Main Chat Interface)
- `ChatInput.tsx`: Text + image input
  - Features: 11 (Main Chat Interface), 12 (Focused Resources)
- `ChatHeader.tsx`: Session id + history dropdown
  - Features: 11 (Main Chat Interface), 13 (System Prompts)
- `SessionList.tsx`: List of chat sessions; marks a background tab awaiting approval
  - Features: 11 (Main Chat Interface), 110 (Cross-Project Concurrency)
- `ModelSelector.tsx`: Choose chat provider (Claude/Codex/pi) and model
  - Features: 11 (Main Chat Interface)
- `SessionHistory.tsx`: Past messages in session
  - Features: 11 (Main Chat Interface)
- `ProcessTimeline.tsx`: Consolidated thinking + tool activity
  - Features: 11 (Main Chat Interface, with extended thinking)
- `SlashCommandMenu.tsx`: Floating slash command typeahead
  - Features: 11 (Main Chat Interface)

### development/ Components
- `ReviewTab.tsx`: Review thread list rendered in the board detail pane
  - Features: 23 (Review Loop & Automated Addressing)
- `ReviewReplyApprovalPanel.tsx`: Reply composition for review threads
  - Features: 23 (Review Loop & Automated Addressing)
- `LinkPrDialog.tsx`: Link session to GitHub PR
  - Features: 25 (GitHub PR Integration)
- `LinkPrToItemDialog.tsx`: Link an existing PR to a plan item
  - Features: 25 (GitHub PR Integration)
- `CreatePrModal.tsx`: Create PR from branch
  - Features: 25 (GitHub PR Integration)
- `GeneratePrContentModal.tsx`: View/copy AI-generated PR title and description
  - Features: 25 (GitHub PR Integration)

### workspace/ Components
- `WorkspaceView.tsx`: Chat-first layout with file editor
  - Features: 69 (Workspace View & File Editor), 11 (Main Chat Interface)
- `FileEditor.tsx`: workspace file editor router (Markdown editor + Monaco); also the focus-mode entry point
  - Features: 69 (Workspace View & File Editor), 106 (Markdown Focus Reader)
- `DocumentTabStrip.tsx`: the open-document tab strip above the editor
  - Features: 69 (Workspace View & File Editor)
- `WorkspaceHome.tsx`: Default workspace landing page; also surfaces the post-create context-generation nudge
  - Features: 69 (Workspace View & File Editor), 76 (Project Onboarding & Context Generation)

### focus-mode/ Components
- `FocusMode.tsx`: Full-screen reading shell (TOC, search, reading theme)
  - Features: 106 (Markdown Focus Reader)
- `FocusChatPanel.tsx`: Per-document persisted chat panel
  - Features: 106 (Markdown Focus Reader)

### tracker/ Components
- `TrackerSection.tsx`: Tracker integration controls in sidebar
  - Features: 27, 31, 33, 35 (Tracker Integration)
- `config/TrackerLinkProjectDialog.tsx`: Association/project link editor
  - Features: 27 (Tracker Connections & Configuration)
- `mapping/StatusMappingForm.tsx`, `mapping/TypeMappingDialog.tsx`: Field mapping editors
  - Features: 27 (Tracker Connections & Configuration)
- `sync/TrackerSyncPanel.tsx`, `sync/SyncReviewPanel.tsx`, `sync/SyncConflictCard.tsx`: Three-way conflict preview and review UI, and direct import action
  - Features: 33 (Sync Pipeline), 35 (Import)

### sidebar/ Components
- `RepoListSection.tsx`: Repository sources with branch info
  - Features: 52 (Sidebar Navigation), 93 (Git Integration)
- File/repo context menu focus actions: pinned files, folders, and repos for chat context
  - Features: 12 (Focused Resources)
- Project list: Switch between projects
  - Features: 52 (Sidebar Navigation)

### sidebar-tree/ Components
- `ReposAndFilesSection.tsx`, `ProjectFilesTreeSection.tsx`: Hierarchical repo/file tree
  - Features: 68 (File Explorer), 52 (Sidebar Navigation)

### settings/ Components
- `SettingsModal.tsx`: Settings hub with tabs
  - Features: 61, 62, 64, 65 (Settings & Configuration)
- `TrackerSettings.tsx`: Tracker configuration and Jira/Linear credential management
  - Features: 27, 31, 33, 35 (Tracker Integration)
- `McpServersSettings.tsx`: MCP server registration
  - Features: 62 (MCP Server Configuration)
- `PermissionsSettings.tsx`: Tool permissions management
  - Features: 64 (Tool Permissions)
- `ActionsSettings.tsx`: Action editor (prompt, trigger, capability grant)
  - Features: 109 (Actions)
- `PromptsSettings.tsx`: System prompt overrides
  - Features: 13 (Claude System Prompts)
- `ThemesSettings.tsx`, `ThemeSelector.tsx`: Built-in and imported themes
  - Features: 96 (Custom Themes)
- `TaskPromptSettings.tsx`: Implementation agent instructions
  - Features: 57 (Board Agent Prompt Customization)
- `PlaybooksSettings.tsx`: Execution playbook editor + role-instruction overrides
  - Features: 105 (Execution Playbooks)
- `StorybookSettings.tsx`: Storybook URL and connection test
  - Features: 101 (Storybook Component Discovery)

### command-palette/ Components
- `CommandPalette.tsx`: Cmd+K interface with fuzzy search
  - Features: 51 (Command Palette), 109 (Actions)

### confluence/ Components
- `LinkToConfluenceModal.tsx`: Dialog to link document to Confluence page
  - Features: 53 (Confluence Integration)
- `ConfluenceSyncPreviewModal.tsx`: Preview before syncing
  - Features: 53 (Confluence Integration)

### permission/ Components
- `PermissionPrompt.tsx`: Runtime permission prompt, inline in the viewed session
  - Features: 64 (Tool Permissions)
- `PendingRequestsBadge.tsx`: Topbar pill for requests the user can't see from here (background tab, other project)
  - Features: 64 (Tool Permissions), 110 (Cross-Project Concurrency)

### global-search/ Components
- `GlobalSearch.tsx`: Search UI and results
  - Features: 50 (Global Search)
- `SearchResultItem.tsx`: Single result rendering
  - Features: 50 (Global Search)

### image-viewer-modal/ Components
- `index.tsx`: Full-size image viewer with zoom/pan
  - Features: 11 (Main Chat Interface)

### markdown-document-modal/ Components
- `index.tsx`: Markdown editor for documents and context files
  - Features: 38 (Project Documents & Context File), 40 (Document & Context-File Editing Tools)

### tool-log/ Components
- Tool log panel for inspecting tool calls
  - Features: 77 (Debug & Performance Logging)

### onboarding/ Components
- `CreateProjectModal.tsx`: instant project-creation form; `RegenerateContextModal.tsx`: configure → generate → review flow for AGENTS.md context generation
  - Features: 76 (Project Onboarding & Context Generation)

### welcome/ Components
- `WelcomePane.tsx`: no-project landing surface — open a repository (instant create), project list, Claude availability status
  - Features: 76 (Project Onboarding & Context Generation)

### ui/ Components (Shared primitives)
- `Modal.tsx`, `DiffViewer.tsx`, `DropdownMenu.tsx`, `Select.tsx`: Reusable UI elements
  - Used across: 10, 33, 40, etc. (all approval/diff workflows)

---

## Organizational Patterns

### By Maturity
- **Mature (production-ready):** Nearly every cataloged feature, across every group, except the items called out below.
- **Mature with roadmap items:** Board execution (19, 23, 105), Agent orchestration (57, 59).
- **Early/Partial:** Some artifact types remain lighter-weight than the core planning/dev-session workflows.
- **Experimental/Optional:** Actions (109, new — it merged the lightly-used custom-prompt and scheduled-loop features).

### By Complexity (Internal)
- **High complexity:** Sync Pipeline (33), board execution state machine (23, 105), streaming session architecture (87), context building (94).
- **Medium:** Plan action approval (10), dev sessions (19), tracker integration (27, 31, 33, 35), search (50), actions (109).
- **Low:** Notifications (74).

### By User Touchpoints
- **High-frequency:** Main chat (11), plan view (5), workspace view & file editor (69).
- **Medium-frequency:** Settings (61, 62, 64, 65), Markdown focus reader (106).
- **Low-frequency:** Onboarding (76), Confluence integration (53), actions (109).

### By Dependency Complexity
- **Core foundation:** Service container (83), store events (85), IPC pattern (86), repositories (88).
- **Integrations:** Tracker (27, 31, 33, 35), GitHub (25), Confluence (53).
- **Claude SDK:** Streaming (87), tools (91), prompts (92), context (94), agent sessions (59), actions (109).

---

## Gaps & Orphaned Features

- **Optional:** Confluence integration (53) depends on Jira/Atlassian credentials and linked pages, so it is mature in code but not always visible in day-to-day project work.
- **Experimental:** Custom prompts (65) are lightweight; prompt editor UI is basic.
- **Known limitations:**
  - Status is set by dragging a card between board columns; the click-to-set status control went with the Tree view.
  - Reparenting has no UI affordance any more; it goes through the chat tools or the API.
  - Image editing not supported; inline image paste in chat only.
  - Markdown documents use a dedicated markdown editor (Monaco-backed edit pane plus preview/toolbar) rather than raw Monaco.
  - No advanced IDE features (IntelliSense, debugging, git integration in editor).
  - No real-time collaboration (single-user tool by design).
  - Prompt customization (13) is text-based only; no UI builder.
