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

1. [Planning & Plan Management](#planning--plan-management) (1–5, 8–10)
2. [Chat & Claude Integration](#chat--claude-integration) (11–13, 17)
3. [Agentic Task Execution (Board)](#agentic-task-execution-board) (19, 23, 25, 105)
4. [Tracker Integration](#tracker-integration-jiralinear) (27, 31, 33, 35)
5. [Documents & Context](#documents--context) (38, 40, 106)
6. [Artifacts & Generation](#artifacts--generation) (43, 46)
7. [Global Search & Navigation](#global-search--navigation) (50–52)
8. [Confluence Integration](#confluence-integration) (53)
9. [Briefing & Project Overview](#briefing--project-overview) (55)
10. [Agent Sessions & Orchestration](#agent-sessions--orchestration) (57, 59, 104)
11. [Settings & Configuration](#settings--configuration) (61, 62, 64, 65)
12. [File & Workspace Management](#file--workspace-management) (68, 69, 73)
13. [Notifications & Updates](#notifications--updates) (74)
14. [Onboarding & Initial Setup](#onboarding--initial-setup) (76)
15. [Debugging & Monitoring](#debugging--monitoring) (77, 79)
16. [Slack Integration](#slack-integration) (80)
17. [Recently Audited Additions](#recently-audited-additions) (96, 97, 99, 101, 102)

**Reference Sections**
- [UI Surface Map](#ui-surface--feature-map) — component directory → feature
- [Cross-Cutting Infrastructure & Patterns](#cross-cutting-infrastructure--patterns) — features 83–95 (non-user-facing)
- [Organizational Patterns](#organizational-patterns) — by maturity, complexity, user touchpoints, dependency scope
- [Gaps & Orphaned Features](#gaps--orphaned-features) — candidates for investment or removal

---

## Planning & Plan Management

### 1. Plan Item Hierarchy (Project → Feature → Task)
- **What it does:** Organizes work into a three-level hierarchy (project/feature/task labels). Users create, edit, reorder, reparent, and delete items; items carry status, description, intent, acceptance criteria, external tracker links, release tags, and completion timestamps.
- **Key code locations:**
  - Services: `src/main/services/core/PlanService.ts`, `src/main/db/domain/PlanActionService.ts`, `src/main/db/domain/PlanItemService.ts`, `src/main/db/repositories/impl/PlanItemRepository.ts`
  - Claude tools: `src/main/kpmTools/tools/plan-items.ts`, `src/main/kpmTools/tools/plan-changes.ts`
  - IPC handlers: `src/main/ipc/handlers/plan.ts`
  - Stores: `src/renderer/stores/project/planSlice.ts`
  - Components: `src/renderer/components/planning/Canvas.tsx`, `src/renderer/components/planning/PlanCard.tsx`, `src/renderer/components/planning/CreateItemModal.tsx`
- **Entry points / surfaces:**
  - Canvas view: drag-to-place cards, right-click context menu for CRUD
  - Tree view: hierarchical list with expand/collapse
  - Board view: kanban columns by status category
  - Create item modal: triggered from Cmd+K or canvas context menu
  - Inline editing on cards: title, description fields
- **Dependencies / integrations:**
  - SQLite: `plan_items` table with parent_id, label, status, external_key fields
  - Jira/Linear: plan items link to external tracker issues via external_key and `kpm_tracker_associations`
  - SQLite: `completed_at` is set/cleared by `PlanItemRepository` when items move to/from done; no feature currently reads it
  - Claude SDK: in-process tools for querying, creating, updating plan items (with user approval gate)
- **Maturity signal:** Mature. Core to app. Full CRUD, multi-view rendering, performance optimized with perf logging.

### 2. Plan Item Spec Fields (Intent, Acceptance Criteria, Source Document)
- **What it does:** Rich specification for implementation tasks. Intent (one-sentence commitment), acceptance_criteria (checklist), source_document_id (breadcrumb to discovery context). Visible in plan card modal (not on canvas per convention). Sent to implementation agents as the execution contract.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/PlanItemRepository.ts` (rowToPlanItem mapping)
  - Types: `src/shared/base-types.ts` (PlanItem interface)
  - Claude tool: `src/main/kpmTools/tools/plan-changes.ts` (CreateItemAction schema)
  - IPC validation: `src/shared/ipc/planEndpoints.ts`
  - Components: `src/renderer/components/planning/TaskEditModal.tsx`, `src/renderer/components/planning/action-details/UpdateItemDetail.tsx`
- **Entry points / surfaces:**
  - Plan card modal (full details tab)
  - Agent context builder (`DevSessionService.buildAgentContext`): specs shape the agent's task definition
- **Dependencies / integrations:**
  - Dev sessions: intent + criteria feed into agent system prompt
  - PR description generation (feature 25): `GitHubService` includes the plan item's intent and acceptance criteria in the generation context
- **Maturity signal:** Mature. Follow-on ideas (per-criterion status ticking, doc→plan breadcrumb) are deliberately not built.

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
  - Briefing service: identifies blocked items for prioritized briefing
  - Sync service: three-way conflict detection considers linked items
- **Maturity signal:** Mature. Read-heavy. Circular dependency checks in place. No dedicated UI for managing relations yet (only via Claude or API).

### 4. Plan Item Status Tracking (Status Categories: not_started, in_progress, in_review, done, blocked, canceled)
- **What it does:** Each plan item has a status within one of six categories. Canvas/tree/board views filter and organize by status. Status transitions trigger tracker sync queuing and event notifications to listeners.
- **Key code locations:**
  - DB: `src/main/db/domain/PlanActionService.ts` (`executeUpdateItem`), `src/main/db/repositories/impl/PlanItemRepository.ts` (`updateStatusCategory`)
  - IPC handlers: `src/main/ipc/handlers/plan.ts` (updateItemStatus)
  - Stores: `src/renderer/stores/project/planSlice.ts` (statusChanged event)
  - Components: `src/renderer/components/ui/StatusSelector.tsx` (renders both the dropdown and the status badge)
  - Events: `src/renderer/stores/storeEvents.ts` (status-changed event)
- **Entry points / surfaces:**
  - Status selector dropdown on plan cards
  - Context menu on cards: "Mark Done", "Mark In Progress"
  - Canvas filtering by status category
  - Board view: columns organized by status category
- **Dependencies / integrations:**
  - Tracker sync: `queueTrackerUpdateIfNeeded` called on status change
  - Briefing: filters by status to surface "in progress" and "blocked" items
  - `completed_at`: stamped on transition to done and cleared on transition away (`PlanItemRepository`)
- **Maturity signal:** Mature. Core feature, well-tested status flow.

### 5. Plan Views (Canvas, Tree, Board)
- **What it does:** Three interchangeable views over the same plan-item data, switched via the planning view switcher — there's no per-view data model, just different renderers over `plan_items`. **Canvas** is a free-form 2D layout: drag cards to position, zoom/pan, right-click for context menu, performance-optimized with depth-based render bucketing for 100+ item scenes. **Tree** is a traditional outline with expand/collapse, multi-select, and drag-to-reparent. **Board** is kanban columns fixed to the six status categories (not_started, in_progress, in_review, done, blocked, canceled); dragging a card between columns changes its status, and clicking a card opens a detail pane that — for plan items with an active or past dev session — also surfaces implementation activity, diffs, and PR info (see Agentic Task Execution).
- **Key code locations:**
  - Canvas: `src/renderer/components/planning/Canvas.tsx` (layout + events), `PlanCard.tsx` (card + perf tracking), `CanvasContextMenu.tsx`; position persisted via `PlanService.updatePosition`; height/padding formulas in `src/renderer/utils/planHierarchy.ts` + `src/renderer/constants/planCardStyles.ts`
  - Tree: `src/renderer/components/tree-view/TreeView.tsx`
  - Board: `src/renderer/components/board-view/BoardView.tsx`, `BoardColumn.tsx`, `BoardCard.tsx`, `dropBehavior.ts`; detail-pane activity/diff tabs in `ActivityTab.tsx`, `ChangesTab.tsx`
  - Shared: `src/renderer/stores/project/planSlice.ts` (position, hierarchy, and status all live here regardless of view)
- **Entry points / surfaces:**
  - View switcher in the planning header
  - Canvas: drag to reposition, right-click menu, double-click to edit, arrow keys to pan, wheel to zoom
  - Tree: drag-to-reparent, multi-select, arrow-key navigation
  - Board: drag between columns, click card for detail pane (Activity/Changes/Review tabs for dev sessions)
- **Dependencies / integrations:**
  - Canvas: items can be assigned to Visual Group containers (feature 8), which render as background frames
  - Board: detail pane pulls in dev-session state (`dev_sessions.automation_phase`) and GitHub PR info for active work
  - Multi-select (tree, canvas) coordinates with Bulk Plan Actions (feature 9)
- **Maturity signal:** Mature. Canvas is the most heavily optimized (perf logging, render bucketing) and has no formal auto-layout — positioning is manual. Board's automation-phase state machine is the most behaviorally complex of the three. Tree is the simplest, best-tested secondary view.

### 8. Visual Groups (Figma-Style Frame Containers)
- **What it does:** Users can create rectangular group containers and assign plan items to them for visual organization (non-hierarchical). Groups have position, size, name, color. Purely visual—no effect on hierarchy or execution.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/GroupRepository.ts`
  - Service: `src/main/services/core/GroupService.ts`
  - Claude tools: `src/main/kpmTools/tools/groups.ts` (read and modify with PlanActions)
  - IPC handlers: `src/main/ipc/handlers/groups.ts`
  - Component: `src/renderer/components/planning/GroupContainer.tsx` (canvas rendering)
  - Stores: `src/renderer/stores/groupStore.ts`
- **Entry points / surfaces:**
  - Canvas context menu: "Create Group"
  - Drag items into/out of groups
  - Group name/color editing via context menu
  - Claude tool for creating groups as part of plan restructuring
- **Dependencies / integrations:**
  - SQLite: `groups` table (project_id, name, position_x/y, width/height)
  - Canvas layout: groups render as background containers with rounded corners
- **Maturity signal:** Mature. Lightweight feature, well-integrated with canvas.

### 9. Bulk Plan Actions (Create Multiple Items, Reparent, Delete)
- **What it does:** From canvas, multi-select plan items and perform batch operations: delete, reparent to a new parent, update status, apply labels. Actions flow through approval queue.
- **Key code locations:**
  - Component: `src/renderer/components/planning/BulkActionsMenu.tsx`
  - Dialog: `src/renderer/components/planning/BulkDeleteConfirmDialog.tsx`
  - Service/approval: Handled by `PlanActionService` and `approvalQueueStore`
  - Store: `src/renderer/stores/project/planSlice.ts` (multi-select state)
- **Entry points / surfaces:**
  - Canvas: Cmd+click (or Shift+click) to multi-select, right-click for bulk menu
  - Confirmation dialogs before destructive operations
- **Dependencies / integrations:**
  - Approval queue: bulk operations are submitted as plan actions for user confirmation
- **Maturity signal:** Mature. Multi-select and bulk ops well-tested.

### 10. Plan Item Approval Flow (Pending Actions Panel, Auto-Apply Setting)
- **What it does:** By default, all plan modifications proposed by Claude are queued for user review before execution. Unified approval queue handles plan actions, document updates, and implementation proposals. Users review diff and approve/reject. A global setting (`chat_approval_mode`: `manual` | `auto_apply`) lets a user turn off the review step entirely — in `auto_apply` mode the same proposals are applied atomically as soon as they arrive instead of queuing, and the system prompt tells Claude not to mention an approval step.
- **Key code locations:**
  - Service: `src/main/db/domain/PlanActionService.ts` (action execution after approval)
  - Store: `src/renderer/stores/approvalQueueStore.ts` (unified queue for all approval types; `shouldAutoApplyApprovals()` gates whether items queue or apply immediately)
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
- **What it does:** Unified chat connected via persistent streaming sessions, supporting text, dragged/pasted images, and focused resources. The provider is selectable per session — Claude (Claude Agent SDK), Codex (Codex SDK), or pi (pi.dev) — with the provider/model picker in the header; Codex and pi run on a shared turn-queue base and expose a leaner capability set than Claude (see `providerCapabilities.ts`). Users can run multiple independent, named chat sessions per project — a session switcher lists them and switching loads that session's isolated history. Typing `/` opens a slash-command menu (user commands from `~/.claude/commands/`, installed skills, plugin commands; CLI built-ins filtered out) — filesystem-scanned before a session connects, then backed by the SDK's own `supportedCommands`/`commands_changed` once live. Messages sent while Claude is still responding are queued and steered into the current turn, rendering in strict chronological order (queued message, then the response that answered it). Long-running tool calls show a live elapsed-timer label.
- **Key code locations:**
  - Service: `src/main/services/streaming/StreamingSessionService.ts` (session lifecycle, reconnection, queued-message ordering, `tool_progress` heartbeat merge)
  - Service: `src/main/services/core/ChatService.ts` (message-send orchestration, chat reset, focus-document session reconciliation; plain history/usage reads go from `ipc/handlers/chat.ts` straight to the repositories)
  - Store: `src/renderer/stores/chat/index.ts` (sessions map, viewed session, draft messages, model state)
  - Components: `MessageList.tsx` (queued messages + inline image rendering), `ChatInput.tsx` (text/image input, drag-drop + paste), `ChatHeader.tsx`, `SessionList.tsx` + `NewSessionButton.tsx` (session switcher), `ProcessTimeline.tsx` (tool activity + elapsed-seconds label), `ModelSelector.tsx`
  - Provider selection: `src/shared/types.ts` (`ChatProvider = 'claude' | 'codex' | 'pi'`); backends `ClaudeSdkSession` / `CodexChatSession` / `src/main/pi/PiChatSession.ts` behind `IChatSession` (Codex + pi share `BaseTurnQueueChatSession`); capability descriptor `src/shared/providerCapabilities.ts`, readiness `src/shared/providerResolution.ts`; renderer picker `ModelSelector.tsx` → `PiModelPicker.tsx` + `usePiProviderPicker.ts`, store `src/renderer/stores/chat/settingsSlice.ts` (persisted via the `chatProvider` setting)
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
- **What it does:** KPM provides Claude with direct function calls to query and modify plan items, manage documents, and more — roughly 20 tools spanning plan/relations/groups, Jira, documents, GitHub, Confluence, briefing, files, git, and Storybook. Tools are implemented as direct function calls (not a subprocess MCP server), reducing latency, and run in the main process with full database access. Modification tools go through the approval flow before executing. When a tool result exceeds the SDK's token budget, the SDK spills the full payload to a file under `~/.claude/projects/` instead of returning it inline; the `read_spill_file` tool lets Claude page through that file (up to 50,000 characters per chunk via `offset`/`length`) since the spill directory sits outside the sandboxed Read/Grep/Glob scope — it's the only path back to that content.
- **Key code locations:**
  - Factory: `src/main/kpmTools/tools/createKpmServer.ts` (creates MCP server from tool functions; `runWithToolExecutionContext`)
  - Tool modules: `src/main/kpmTools/tools/*.ts` (plan-items, plan-changes, jira, relations, document-read, document-update, document-edit, groups, confluence, github, storybook, briefing, context-file-update, file-move, file-delete, list-project-files, plan-refs, review-assessment, spill-read, git-read)
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
- **What it does:** Users start agentic execution for a plan item from the board view. Each session creates an isolated git worktree, builds an agent prompt from the plan item's title/intent/acceptance-criteria/context (with `@plan/<uuid>` refs resolved, the project-level AGENTS.md prepended when it has real content, and attached context files wrapped in via `<context-file>` blocks), and spawns an implementation agent — Claude via the Agent SDK, Codex via the Codex SDK (Codex also backs main chat and opposing review — see feature 11), or Gemini/legacy Claude via CLI, all dispatched through `AgentSessionManager`. Each board turn is a discrete single-shot `query()`; completion is the SDK async iterator ending, not a terminal process exiting. Sessions track status (pending → active → inactive) and persist across app restarts. Board cards show a compact phase badge (e.g. "Reviewing", "Needs attention", "Fixing checks", "Addressing review") derived from automation phase, agent liveness, and staleness — kept live even after the underlying session goes `inactive` between turns, so the board doesn't read as idle mid-automation. The detail pane's Activity tab renders tool calls as a narrative feed, grouped under the narration Claude wrote immediately before them.
- **Key code locations:**
  - Service: `src/main/services/repo/DevSessionService.ts` (`startAgentSession` entrypoint, `buildAgentContext(input: AgentContextInput)` — renders `## Intent`/`## Acceptance Criteria`/`## Context`-or-`## Description`/`## Instructions` based on which spec fields the item carries, `buildPlanRefSection` prepends a `<plan-refs>` block; composes `scaffoldWorktree` from `src/main/services/repo/worktreeScaffold.ts` to create the worktree via `git worktree add`)
  - Orchestration: `src/main/services/agents/BoardAgentOrchestrator.ts` (automation state machine, wired in via `AgentSessionManager`)
  - Agent backends: `ClaudeSdkSession`, `CodexSdkAgentSession`, `CliAgentSession` (Gemini / legacy Claude via CLI) — dispatched by `AgentSessionManager`
  - Worktree support: `src/main/services/repo/worktreeScaffold.ts` (create via `git worktree add`), `DevSessionService.openInEditor` + `editorLauncher.ts` (open in editor), `devSessionGitInspection.ts` + `gitUtils.ts` (status/diff); worktree state lives on `dev_sessions.worktree_path` — the dead `worktrees` table plus `WorktreeService`/`WorktreeRepository` were removed
  - Repository: `src/main/db/repositories/impl/DevSessionRepository.ts`
  - IPC handlers: `src/main/ipc/handlers/devSessions.ts`, `agentSessions.ts`, `worktree.ts`
  - Components: `src/renderer/components/board-view/DetailPane.tsx`, `BoardCard.tsx` (`phaseIndicator` computation), `MergeQueuePanel.tsx`, `ActivityTab.tsx` (narrative grouping, non-stealing auto-scroll), `DetailPaneHeader.tsx` + `src/renderer/components/planning/PlanCardMenu.tsx` ("Open in Editor")
  - Types: `DevSessionAutomationPhase`, `isLiveAutomationPhase`, `isCommitHookRepairPhase` (`shared/types.ts`)
  - DB: `dev_sessions` table (status, worktree_path, branch_name, automation_phase, etc.)
- **Entry points / surfaces:**
  - Board card: drag to `in_progress` or click `Play` — prefers resuming the latest inactive/pending session over creating a new worktree; `Stop` stops the active run; phase badge on each card face
  - Board detail pane: Activity (narrative feed) / Changes / Review tabs
  - Detail pane header overflow menu / plan card menu: "Open in Editor" opens the worktree in the system editor
- **Dependencies / integrations:**
  - Plan context: `buildAgentContext()` includes item title, intent, acceptance criteria, subtasks, and resolved `@plan/<uuid>` refs without a tool round-trip
  - Status tracking: lifecycle persisted in `status`; board automation state persisted in `automation_phase`
  - Approval queue: user approval required before starting a session
  - GitHub: linked PRs and review threads visible in the board detail pane (see GitHub PR Integration and Review Loop features)
  - Agent prompt templates: users can customize task-specific prompts via the `task_prompt_templates` table
- **Maturity signal:** Mature. Core feature. Board execution state machine is sophisticated; phase badges exist specifically to compensate for sessions going `inactive` between per-turn completions. Known: requires user approval before starting.

### 23. Review Loop & Automated Addressing (GitHub PR Review + Decision Queue)
- **What it does:** Dev sessions track linked GitHub PRs. Unresolved review threads become review tasks (`needs_review` → `assessed` → `in_progress` → `ready_to_post` → `done`), each with a disposition (`implement`, `push_back`, `needs_user_input`) that the user can override. The Review tab presents this as a focused decision queue rather than a flat task list: a next-action bar surfaces the most actionable thread, an accordion auto-expands it and collapses the rest to scannable rows, and a deduped per-reviewer verdict strip shows each GitHub reviewer's latest top-level verdict (linking out to GitHub) instead of re-displaying full review bodies. Addressing findings is automatic and bounded, not a manual button: after implementation completes, `BoardAgentOrchestrator` launches one opposing-agent review; if it returns findings, the implementation agent gets one aggregated follow-up turn to address them before the task moves to `In Review` — there is no infinite review/fix loop, and if there are no findings the task moves straight to `In Review`. Users can also reply to threads directly from KPM, optionally delegating the reply to Claude.
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
- **Built-in playbooks** (`BUILT_IN_PLAYBOOKS`, read-only, duplicate-to-edit): `builtin.implement_opposing_review` — implement → one opposing review → one address pass (the default); `builtin.implement_only` — a single implement step (also the legacy `review_policy = 'skip'` fallback); `builtin.loop_until_clean` — implement → review → address, looping up to 3 passes then pausing; `builtin.implement_code_review` — TDD implement → parallel two-axis review (Standards + Spec) → address loop.
- **Key code locations:**
  - Shared model + logic: `src/shared/playbooks.ts` (types, Zod `playbookSchema`, `BUILT_IN_PLAYBOOKS`, `DEFAULT_PLAYBOOK`, validation helpers), `src/shared/playbookRuntime.ts` (`resolvePlaybookPlan`, `advancePlaybook`, `renderPlaybookDirective`)
  - Service + repository: `src/main/services/core/PlaybookService.ts` (CRUD + default; built-ins read-only), `src/main/db/repositories/impl/PlaybookRepository.ts`
  - Interpreter: `src/main/services/agents/BoardAgentOrchestrator.ts` (loads the snapshot, dispatches steps, aggregates fan-out runs, advances the cursor), `automationPhaseMachine.ts` (sole writer of `automation_phase` + cursor fields), `autoReview.ts` (`launchPlaybookSubagent`), `boardProviderRegistry.ts`
  - Session wiring: `src/main/services/repo/DevSessionService.ts` (snapshot creation, `savePlaybookOutputs`, `resumePlaybook`)
  - Renderer: `src/renderer/services/playbookService.ts`; settings `src/renderer/components/settings/PlaybooksSettings.tsx` + `playbookEditor.ts`; board `src/renderer/components/board-view/AgentStartModal.tsx` (playbook picker + resolved-plan preview), `PhaseStepper.tsx` + `panelStatus.ts` (`derivePanelStatus`)
  - IPC: `src/shared/ipc/playbookEndpoints.ts` (`playbook:list|create|update|delete|duplicate|set-default|providers|skills`), handlers `src/main/ipc/handlers/playbooks.ts`; the selected `playbookId` flows through `agent-session:create-and-start`
  - DB: `execution_playbooks` table (custom playbooks; migration `104_custom_execution_playbooks`), default id in `app_settings` (`default_playbook_id`); running-session columns on `dev_sessions` — `playbook_id`, `playbook_snapshot` (immutable authoritative copy), `current_step_id`, `step_pass_counts`, `step_outputs`, `paused_reason` (migrations `103_execution_playbook_persistence` + `105_playbook_step_outputs`)
- **Entry points / surfaces:**
  - Settings → Playbooks tab: create / select / duplicate / delete playbooks and pick the default; a "Role instructions" sub-tab overrides the agent role prompts; built-ins render read-only; validation issues block Save
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
- **What it does:** Changes destined for the tracker move through three stages. A **preview** step shows which items will be created/updated/deleted and detects three-way conflicts (item changed locally, tracker changed externally, and KPM's cached snapshot differs from both) so the user can pick a resolution (keep local / take tracker version) per conflicting row. Approved changes move into a persisted **sync queue** — it survives an app restart before the user syncs, and custom field values can still be edited there. **Executing** the sync posts create/update/delete calls to the tracker API, updates the sync snapshot as the new baseline, and reports progress via notification. Diffing at every stage reads a cache of each tracker issue's last-known state, stored directly on the linked `plan_items` row (`external_key`, `external_status`, `last_synced_at`, etc.) rather than a separate cache table.
- **Key code locations:**
  - Service: `src/main/db/domain/SyncService.ts` (`generateSyncPreview`, `applySyncChanges`, queuing logic, populates the issue-state cache after a successful sync), `src/main/db/domain/ExportService.ts` (formats KPM data for tracker APIs)
  - Repository: `src/main/db/repositories/impl/SyncQueueRepository.ts`, `src/main/db/repositories/impl/ExternalPlanItemRepository.ts` (reads the cached fields off `plan_items` where `external_key IS NOT NULL`)
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
  - Approval queue: `src/renderer/stores/approvalQueueStore.ts` (`PendingDocumentItem`, `PendingContextFileItem` types)
  - Components: `src/renderer/components/planning/PendingDocumentPanel.tsx`, `src/renderer/components/ui/DiffViewer.tsx` (shared diff rendering)
- **Entry points / surfaces:**
  - Pending document panel / pending actions panel (approval overlay): diff view with Accept/Reject
  - Newly created files open automatically in the workspace editor
- **Dependencies / integrations:**
  - File system: edit tools read the current file server-side to validate before computing the new content
  - Approval queue: batch edits yield one entry regardless of hunk count; edits fail cleanly if `old_string` isn't found or is ambiguous, or if any hunk in a batch fails
- **Maturity signal:** Mature. Robust edit validation; creation and editing share one proposal→approval shape across both plain documents and the context file.

### 106. Markdown Focus Reader (Immersive Reading + Per-Document Chat)
- **What it does:** Users can enter a distraction-free full-screen reading mode for any open markdown file: larger type, a light/dark reading theme independent of the app theme, a table-of-contents rail with scroll-spy, in-document search, and reading-position persistence per document. A companion chat panel can be opened alongside the reader, scoped to that one document — its own persisted thread, separate from the project's main chat sessions. This chat follows the same rules as main chat: connected repos stay read-only, and any document/context-file edit still goes through `propose_document_edit` / `propose_context_edit` and KPM's normal approval flow (or auto-apply, per the global setting) — focus mode does not bypass it.
- **Key code locations:**
  - Component: `src/renderer/components/focus-mode/FocusMode.tsx` (reader shell: TOC, search, reading theme, scroll-spy)
  - Component: `src/renderer/components/focus-mode/FocusChatPanel.tsx` (per-document chat UI)
  - Hook: `src/renderer/components/focus-mode/useReadingProgress.ts` (active heading + scroll progress)
  - Store: `src/renderer/stores/focusModeStore.ts` (open/close, reading theme and scroll-position persistence in localStorage)
  - Entry point: `src/renderer/components/workspace/FileEditor.tsx` (`handleEnterFocus` — focus button shown only for markdown files)
  - Prompt: `src/main/chat/prompts/index.ts` (focus-session system prompt: focused document is the implicit subject; repos read-only; document/context changes still require `propose_document_edit`/`propose_context_edit`)
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
- **What it does:** Claude-generated markdown documents saved to a project's `outputs/` folder. There are no built-in generators today: a hardcoded weekly-update/test-plan pipeline was replaced by user-configurable custom prompts (migration `036_custom_prompts`'s stated purpose), and the "Weekly Update"/"Test Plan" prompts that were then seeded as built-ins were themselves later removed — `CustomPromptRepository.ensureBuiltinsExist` actively deletes any leftover built-in rows with those names on startup, and ships no replacement built-ins. Generating a weekly update, a test plan, or any other stakeholder-facing doc now means creating a custom prompt (see Custom Prompts, feature 65) with run mode "artifact" and running it. PR descriptions are generated through the GitHub/dev-session flow instead (see GitHub PR Integration).
- **Key code locations:**
  - Execution: `src/main/services/generation/CustomPromptGenerationService.ts` (`executePrompt` — model is `getConfig().generation.deepModel`, defaulting to Sonnet, with adaptive extended thinking and access to the KPM MCP server's tools)
  - Built-in cleanup: `src/main/db/repositories/impl/CustomPromptRepository.ts` (`ensureBuiltinsExist` deletes legacy "Weekly Update"/"Test Plan" rows; no built-ins are seeded)
  - IPC handlers: `src/main/ipc/handlers/customPrompts.ts` (`execute` streams `progress`/`complete`/`error` events)
  - UI: `src/renderer/components/command-palette/CommandPalette.tsx` (execution), `src/renderer/components/layout/CustomPromptTaskBadge.tsx` + `src/renderer/stores/customPromptTaskStore.ts` (in-flight indicator; reveals the file in the OS file manager on completion)
- **Entry points / surfaces:**
  - Command palette (Cmd+K): run any custom prompt with run mode "artifact"
  - Top-bar badge shows in-flight generations with elapsed time; on completion the output file is revealed in the OS file manager
- **Dependencies / integrations:**
  - Custom Prompts (feature 65): the only current way to define what gets generated — there is no chat tool or board-detail button that triggers generation directly
  - File system: writes `.md` to `project/outputs/`
  - Artifacts Manager (feature 46): the backend for the files this pipeline writes, independent of how they were generated
- **Maturity signal:** The generation pipeline itself (custom prompt → deep model → `outputs/`) is functional. The specific "weekly update" and "test plan" artifact types no longer exist as built-ins — producing either now requires the user to author their own custom prompt.

### 46. Artifacts Manager (File List + Open)
- **What it does:** Backend file management for markdown files in a project's `outputs/` folder — list, read, delete, and import, exposed over IPC as `window.api.artifacts`. No renderer component currently calls any of these methods: there is no "Artifacts" tab in the board detail pane (its tabs are Activity/Changes/Review — see Plan-item Dev Sessions, feature 19) and `artifactsStore.ts`'s `artifacts`/`isLoadingArtifacts`/`artifactsError` state is unread and unset anywhere. The store's command-palette open/close state (unrelated to artifact listing) is the only part of it actually in use. In practice, files written to `outputs/` are reached via the File Explorer (feature 68), which does not hide the `outputs/` folder, or via the OS file manager, which opens automatically to the new file right after a custom-prompt generation completes (see Artifact Generation, feature 43).
- **Key code locations:**
  - Service: `src/main/services/core/ArtifactService.ts` (`list`, `read`, `delete`, `import`)
  - IPC handlers: `src/main/ipc/handlers/artifacts.ts`; endpoints: `src/shared/ipc/artifactEndpoints.ts`
  - Store: `src/renderer/stores/artifactsStore.ts` (artifact list/loading/error state defined but unused; only command-palette open state is read)
- **Entry points / surfaces:**
  - None in-app today. Files are reachable via the File Explorer (feature 68) or the OS file manager.
- **Dependencies / integrations:**
  - File system: lists/reads/deletes/imports files in `outputs/`
- **Maturity signal:** Backend is implemented and IPC-wired but has no current renderer caller — the in-app artifact-management UI this backend was built for does not exist today.

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
- **What it does:** Quick command palette for actions: create plan item, navigate to item, run custom prompts, execute saved commands. Supports fuzzy search on command names and descriptions. Targeted prompts open a second picker page to select the document or repo they should run against before executing.
- **Key code locations:**
  - Component: `src/renderer/components/command-palette/CommandPalette.tsx`
  - Store: `src/renderer/stores/customPromptStore.ts` (custom prompts as commands)
  - Integration: custom prompts appear as executable commands
  - Keyboard hook: Cmd+K globally
- **Entry points / surfaces:**
  - Cmd+K keyboard shortcut
  - Modal popup with command search
  - Categories: Prompts, Project, Navigation
  - Execute command or navigate
  - For targeted prompts (`target_type: 'document'` or `'repo'`): second picker page lists available targets; Backspace returns to command list
- **Dependencies / integrations:**
  - Custom prompts: listed as executables in palette; targeted prompts attach selected entity as focused resource before sending
  - Plan navigation: can search and navigate to plan items
  - Project actions: create new project, etc.
- **Maturity signal:** Mature. Command palette functional. Extensible via custom prompts.

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

## Briefing & Project Overview

### 55. Project Briefing (Generation + Display)
- **What it does:** A one-shot briefing gathers project status — blocked items, stale tasks, ready work, inactive dev sessions, recent chat — and Claude synthesizes it into an actionable summary with signal counts and recommendations, through a two-stage pipeline (`fastModel` synthesis, `deepModel` final pass with extended thinking; both default to Sonnet). The result displays in a modal that streams the generation live, caches the finished briefing in `project_briefings` (reused until stale), and offers a Refresh action to regenerate; closing the modal dismisses it.
- **Key code locations:**
  - Service: `src/main/services/core/BriefingService.ts` (two-stage pipeline: `fastModel` synthesis + `deepModel` final, configurable via `getConfig().generation`)
  - Claude tool: `src/main/kpmTools/tools/briefing.ts` (`get_briefing`)
  - Component: `src/renderer/components/briefing/BriefingModal.tsx`
  - IPC handlers: `src/main/ipc/handlers/briefing.ts`
  - Store: `src/renderer/stores/briefingStore.ts`
- **Entry points / surfaces:**
  - Chat: user asks "what should I do next?" or "project briefing" — Claude calls `get_briefing`
  - Modal shows the generated briefing with signal counts (blocked/stale/ready), a generated-at timestamp, and a Refresh button; generation streams into the modal as it runs
- **Dependencies / integrations:**
  - Plan items: blocked items via `depends_on` relations, stale items via `updated_at`, ready items via status-category queries
  - Dev sessions: inactive sessions identified
  - Chat history: synthesized for context
- **Maturity signal:** Mature. Two-stage synthesis approach is sophisticated; display UI is simple and functional (streaming render, cache, refresh).

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

### 104. Scheduled Loops (Recurring Background Prompts)
- **What it does:** Users define a freeform prompt that runs on a recurring interval in the background (app must be open), managed entirely from the Command+K palette. Each loop has an output mode that controls how results are delivered: `notify` (read-only; a finding becomes a notification, silent if nothing noteworthy), `report` (read-only; result is written to `outputs/loops/<name>.md` each run), or `maintain` (the agent's document/context-file edits from that run are written to disk immediately, bypassing the approval queue). A run history (up to 50 entries per loop) records outcome, summary, error, and artifact path for each tick, and a manual "Run now" is available regardless of the loop's enabled state.
- **Key code locations:**
  - Service: `src/main/services/repo/ScheduledLoopRunnerService.ts` (drives loops on the shared `PollScheduler`, one task per enabled loop; `executeNotify` / `executeReport` / `executeMaintain` per output mode)
  - Service: `src/main/services/core/ScheduledLoopService.ts` (CRUD + run-history access)
  - Repository: `src/main/db/repositories/impl/ScheduledLoopRepository.ts` (loop CRUD, `recordRunOutcome`), `ILoopRunRepository` (run history, `pruneOld`)
  - Context: `src/main/claude/contextBuilders.ts` (`createContextBuilder`) builds the same grounded project context used by chat
  - IPC handlers: `src/main/ipc/handlers/scheduledLoops.ts`; validation: `src/shared/ipc/scheduledLoopEndpoints.ts`
  - Component: `src/renderer/components/command-palette/LoopModal.tsx` (create/edit loop, run history list)
  - Store: `src/renderer/stores/scheduledLoopStore.ts`
  - Service (renderer): `src/renderer/services/scheduledLoopService.ts` (`subscribeToScheduledLoopRun` — refreshes history when a run this window kicked off finishes)
  - Command palette integration: `src/renderer/components/command-palette/CommandPalette.tsx` (`loops` category, "New loop…" command)
  - DB: `scheduled_loops` table (project_id, name, prompt, output_mode, interval_minutes, enabled, last_run_at, last_outcome), `loop_runs` table (loop_id, outcome, summary, error, artifact_path, started_at, finished_at) — migration `096_add_scheduled_loops`
- **Entry points / surfaces:**
  - Cmd+K → "New loop…" or select an existing loop to edit
  - Loop editor: name, prompt, output mode (notify/report/maintain), interval
  - Run history list in the loop modal (outcome badges, summaries, "No runs yet" empty state)
  - "Run now" button runs immediately regardless of enabled/schedule state
  - Notifications (for `notify` mode) and `outputs/loops/<name>.md` (for `report` mode) surface results outside the modal
- **Dependencies / integrations:**
  - `PollScheduler`: one registered task per enabled loop (`loop:<id>`), interval derived from `interval_minutes`
  - Claude Agent SDK: each tick is a single grounded agent turn with KPM MCP tools and the user's enabled external MCP servers/plugins; `autoApprove: true` since no UI is present to answer permission prompts on a background tick
  - Document/context-file tools: `maintain` mode subscribes to `subscribeToDocumentUpdate` / `subscribeToContextFileUpdate` (keyed by a synthetic `loop:<id>` session key) and writes accumulated file content directly via `resolveScopedPath`, rather than emitting approval-queue proposals
  - `UpdateEventBus`: emits a `loop_finding` event consumed by the notification system
- **Maturity signal:** Mature. `maintain` mode is a deliberate, scoped exception to the approval-queue convention — proposals never leave the main/board interactive flow, but a scheduled loop has no user present to approve them, so writes are auto-applied and scoped to the project folder via `resolveScopedPath`.

---

## Settings & Configuration

### 61. General Settings (Account, Workflow, App Preferences)
- **What it does:** Global app preferences. The Account tab shows API key/auth state and the chat approval-mode toggle (manual review vs. auto-apply, feature 10). The Workflow tab holds a Git sub-tab (branch naming template) plus sub-tabs that surface other settings features in project context: Tracker (feature 27), Slack (feature 80), Storybook. Theme selection and imported themes are covered separately in feature 96.
- **Key code locations:**
  - Service: `src/main/services/core/SettingsService.ts`
  - Store: `src/renderer/stores/generalSettingsStore.ts`
  - Component: `src/renderer/components/settings/GeneralSettings.tsx`, `src/renderer/components/settings/WorkflowSettings.tsx` (sub-tab shell for Tracker/Git/Slack/Storybook)
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
- **What it does:** Users can register custom MCP (Model Context Protocol) servers. System discovers and lists available servers, their resources, and tools. Persisted configuration allows servers to be used in prompts and agent sessions.
- **Key code locations:**
  - Service: `src/main/services/core/McpDiscoveryService.ts` (discovers server capabilities)
  - Component: `src/renderer/components/settings/McpServersSettings.tsx`
  - Store: `src/renderer/stores/mcpServersStore.ts`
  - IPC handlers: `src/main/ipc/handlers/mcpServers.ts`
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

### 64. Tool Permissions (Grant/Revoke + Runtime Prompting)
- **What it does:** When Claude uses a tool for the first time in a project, KPM checks whether the user has already granted permission; if not, a runtime modal prompts allow-once / allow-always / deny. Permissions persist to SQLite and cache in memory so repeat calls skip the prompt. Settings → Permissions lists everything granted for the current project, with a "Revoke" button per tool and an "Allow All Remaining" button to suppress future prompts.
- **Key code locations:**
  - Service: `src/main/services/core/PermissionService.ts` (load, persist, revoke on project open), `PermissionPromptService.ts` (`promptUser()` — runtime prompting logic)
  - Client manager: `src/main/claude/clientManager.ts` (caches and enforces permissions in memory)
  - Store: `src/renderer/stores/toolPermissionStore.ts`
  - Components: `src/renderer/components/settings/PermissionsSettings.tsx`, `src/renderer/components/permission/PermissionPrompt.tsx` (runtime modal)
  - DB: `tool_permissions` table (project_id, tool_name, cache_key, label)
  - IPC handlers: `src/main/ipc/handlers/permission.ts`
- **Entry points / surfaces:**
  - Runtime: modal pops up when a tool needs approval for the first time
  - Settings → Permissions tab: list of allowed tools per project, "Revoke" per tool, "Allow All Remaining"
- **Dependencies / integrations:**
  - Claude Agent SDK: permission check runs before every tool execution
  - Approval queue: a deferred permission request surfaces there while pending
- **Maturity signal:** Mature. Permission model is clean, user-friendly, and non-intrusive once tools are approved.

### 65. Custom Prompts (User-Defined Prompt Library)
- **What it does:** Users create global custom prompts that appear as commands in the command palette and can be executed independently. Each prompt has name, description, icon, keywords, content, a target type (`none` / `document` / `repo`), and a run mode (`artifact` / `chat`). Targeted prompts require the user to pick a document or repo before running. Built-in prompts are protected from deletion.
- **Key code locations:**
  - DB: `custom_prompts` table (name, description, icon, keywords, prompt_content, is_builtin, sort_order, target_type, run_mode) — migration 090
  - Service: `src/main/services/core/CustomPromptService.ts`
  - Service: `src/main/services/generation/CustomPromptGenerationService.ts` (execution for artifact mode)
  - Component: `src/renderer/components/settings/CustomPromptSettings.tsx` (editor — "Runs On" and "Output" selectors; picking a target auto-locks output to chat)
  - Component: `src/renderer/components/command-palette/CommandPalette.tsx` (execution + target picker page)
  - Store: `src/renderer/stores/customPromptStore.ts`
  - IPC handlers: `src/main/ipc/handlers/customPrompts.ts`
- **Entry points / surfaces:**
  - Settings → Custom Prompts tab
  - Create new: name, description, icon, prompt text, "Runs On" selector (none/document/repo), "Output" selector (artifact/chat)
  - Execute from command palette (Cmd+K); targeted prompts open a second page to pick the entity
  - Edit/delete existing
- **Dependencies / integrations:**
  - Command palette: prompts listed as executable commands; chat-mode targeted prompts attach selected entity as focused resource and send prompt via chat
  - Claude SDK: artifact-mode prompts executed as user message via generation service; chat-mode prompts navigate to chat view and send directly
  - Effort selection: users can choose effort level (low/medium/high/max) when executing artifact prompts
- **Maturity signal:** Mature. Custom prompt system functional and extensible.

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
- **What it does:** The default main view is chat-first — full-width chat until a file is opened, at which point the layout splits into a center editor with chat narrowed to the side; closing the editor returns to chat-only. Markdown files open in the dedicated Markdown editor (Monaco-backed edit pane plus preview/toolbar); other text/code files use Monaco directly for editing and read-only viewing. Multiple files can be open in tabs, with an unsaved-changes indicator per tab.
- **Key code locations:**
  - Component: `src/renderer/components/workspace/WorkspaceView.tsx` (layout), `FileEditor.tsx` (editor router), `useWorkspaceResize.ts` (resizable panels)
  - Store: `src/renderer/stores/workspaceStore.ts` (editing state, unsaved files)
  - Service: `src/main/services/files/RepoFileService.ts` (read/write files)
  - IPC handlers: `src/main/ipc/handlers/repoFiles.ts`
- **Entry points / surfaces:**
  - Workspace tab in main navigation (default view); click a file in the tree to open it and shift to split layout
  - Tab bar for multiple files; unsaved indicator (dot on tab title); Cmd+S to save
- **Dependencies / integrations:**
  - Markdown editor: toolbar, preview, markdown-specific editing flow; also the entry point for the Markdown Focus Reader (feature 106)
  - Monaco editor: syntax highlighting, read-only code viewing, basic language support for non-markdown files
  - Approval queue: file changes can be queued if from a Claude proposal
- **Maturity signal:** Mature. Layout adaptive and responsive. No advanced editor features (debugger, terminal integration).

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

## Onboarding & Initial Setup

### 76. Project Onboarding & Context Generation (AGENTS.md Generation)
- **What it does:** First launch (or any time no project is open) shows a welcome pane in the main content area: open a repository (creates a project instantly, named after the folder), start a blank project, open an existing one, and a Claude Code availability line. Creating a project via the modal is a single instant form (name, optional project folder, connect repositories) — no generation step blocks it. Once created, the workspace home screen offers a dismissible nudge to generate the project's AGENTS.md context file if one is missing or still the placeholder written at creation. Accepting the nudge (or invoking "Regenerate Context" once a real file exists) opens a modal that configures scope, runs Claude against the connected repos as a background task, and shows a diff-reviewed preview before saving. The generated file targets non-discoverable content (cross-repo relationships, verified commands, boundaries, doc pointers, ≤80 lines) rather than restating searchable architecture. If generation completes while the modal is closed, the result routes into the standard approval queue (or auto-applies, per the global setting) instead of requiring a badge-click back into the modal. Reads an existing AGENTS.md or CLAUDE.md if either is present in the repo.
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
- **What it does:** Two debug-only introspection surfaces. Tool call logging records every Claude tool call — name, category, input parameters, referenced file paths, turn index, timestamp — viewable in a debug panel to understand what Claude did and troubleshoot duplicate reads or noisy tool usage. Performance logging is opt-in (via env var) and records plan-card render counts by depth, chat streaming latency, and sync-operation timing to help identify bottlenecks.
- **Key code locations:**
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts` (logs to memory + NDJSON temp file), `src/renderer/components/tool-log/ToolLogPanel.tsx`, `src/renderer/stores/toolLogStore.ts`, `src/main/ipc/handlers/toollog.ts`
  - Perf logging: `src/renderer/utils/perfLogger.ts` (`isPerfLoggingEnabled()`), render tracking in `src/renderer/components/planning/PlanCard.tsx`
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

## Slack Integration

### 80. Slack Triage (Channel Links, Classification, Actions)
- **What it does:** Optional Slack integration: users link Slack channels to KPM projects (Settings → Connections → Slack). KPM monitors linked channels for new messages and classifies each with Claude (task, reply, document update, info-only, etc.), storing a suggested action for review in the Slack triage panel. Suggested actions map to one of: create a new plan item, update a project document, post a reply to the thread, or close as info-only. The user reviews each triaged item in the panel — edit, approve, dismiss, restore, or execute — before anything happens; execution creates the task, applies the document update, or posts the reply.
- **Key code locations:**
  - Service: `src/main/services/core/SlackTriageService.ts` (triage logic, channel-link management, action validation)
  - Adapter: `src/main/services/core/slackTriageAdapter.ts` (MCP integration wrapper)
  - Repository: `src/main/db/interfaces/slack.ts` (`ISlackChannelLinkRepository`) and triage-item repositories
  - Claude prompts: `src/main/chat/prompts/slackTriage.ts` (classification prompt)
  - Types: `SlackTriageCreateTaskAction`, `SlackTriageUpdateDocumentAction`, `SlackTriageReplyAction` (`shared/types`)
  - Component: `src/renderer/components/slack/` (triage panel), `src/renderer/components/settings/` (channel-link UI)
  - Store: `src/renderer/stores/useSlackTriageStore.ts`
  - IPC handlers: `src/main/ipc/handlers/slack.ts`
  - DB: `slack_channel_links`, `slack_triage_items` tables
- **Entry points / surfaces:**
  - Settings → Connections → Slack: "Link Channel" (enter channel name), list of linked channels with unlink
  - Slack triage panel in sidebar (if linked): triaged messages with suggested actions; item status flow (`pending` → `edited`/`approved`/`dismissed` → `executed`)
- **Dependencies / integrations:**
  - Slack MCP (optional): used for channel reading and resolving channel names to IDs when available
  - Claude: Sonnet for message classification
  - Plan items: new tasks created via action; documents: updates applied via action; Slack API: replies posted to threads
- **Maturity signal:** Mature. Triage service is comprehensive (bot/already-triaged filtering) and covers the full link → monitor → classify → review → execute lifecycle.

---

## Cross-Cutting Infrastructure & Patterns

### 83. Service Container & Dependency Injection
- **Architecture:** All services created via factory functions with dependencies injected. Single composition root in `appServices.ts`. Services returned via `getServices()` getter. Testable with `setServices()` / `resetServices()`.
- **Key code locations:**
  - Composition root: `src/main/services/appServices.ts`
  - Container: `src/main/services/container.ts`
  - Service interfaces: Each service has interface defining contract
  - Factories: Each service is a factory function (e.g., `createPlanService`)
- **Why it matters:** Services can be mocked for testing. Clean dependency graphs. No circular imports.

### 84. Approval Queue (Unified Pending Actions)
- **Architecture:** Single queue for plan actions, document updates, implementation proposals, context file edits, and review replies. Items processed one at a time. Approval UI shows diffs and context. User can approve/reject. Rejected items don't execute.
- **Key code locations:**
  - Store: `src/renderer/stores/approvalQueueStore.ts` (unified queue)
  - Component: `src/renderer/components/planning/PendingActionsPanel.tsx`, approval overlays
  - Discriminated union types: `PendingPlanActionsItem`, `PendingDocumentItem`, `PendingContextFileItem`, `PendingImplementationItem`, `PendingReviewReplyItem`
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

**Total distinct features cataloged:** 63, after a consolidation pass that folded narrowly-scoped entries into their higher-level parent feature (below) so the catalog tracks capabilities rather than every implementation detail. Feature IDs are stable and not reused — a retired number's content lives at the target number shown.

**Consolidation log (this pass):**

| Retired | Folded into | Retired | Folded into |
|---|---|---|---|
| 6, 7 | 5 (Plan Views) | 44, 45 | 43 (Artifact Generation) |
| 14 | 13 (System Prompts) | 54 | 53 (Confluence Integration) |
| 15, 16, 103 | 11 (Main Chat Interface) | 56 | 55 (Project Briefing) |
| 18, 20, 21, 108 | 19 (Plan-item Dev Sessions) | 58 | 57 (Board Agent Prompt Customization) |
| 107 | 17 (In-Process MCP Tools) | 60 | 23 (Review Loop & Automated Addressing) |
| 24 | 23 (Review Loop & Automated Addressing) | 63, 66 | removed — redundant pointers to 27/61 and 13 |
| 26 | 25 (GitHub PR Integration) | 67 | 64 (Tool Permissions) |
| 28, 29, 30 | 27 (Tracker Connections & Configuration) | 70 | 69 (Workspace View & File Editor) |
| 32 | 31 (Jira & Linear Query Tools) | 71 | 68 (File Explorer) |
| 34, 36, 37 | 33 (Sync Pipeline) | 72 | 11 (Main Chat Interface, image viewer) |
| 39 | 38 (Project Documents & Context File) | 75 | removed — dead feature, no longer tracked |
| 41, 42 | 40 (Document & Context-File Editing Tools) | 78 | 77 (Debug & Performance Logging) |
| | | 81, 82 | 80 (Slack Triage) |

The standalone "Permissions & Security" group was folded into Settings & Configuration (feature 64). A second, verbatim-duplicate copy of the Cross-Cutting Infrastructure section (features 83–95) was also removed — it existed only as a condensed restatement and had already drifted from the primary copy.

Earlier history: Feature 57 was reworked from "Agent Team Prompts" into "Board Agent Prompts"; Feature 105 was reworked from "Workflow Mode" into "Execution Playbooks"; Features 98 and 100 were removed; Feature 102 "Plan References" was added.

**Feature density by area:**
- Planning & Plan Management (8)
- Chat & Claude Integration (4)
- Agentic Task Execution (Board) (4)
- Tracker Integration (4)
- Documents & Context (3)
- Artifacts & Generation (2)
- Global Search & Navigation (3)
- Confluence Integration (1)
- Briefing & Project Overview (1)
- Agent Sessions & Orchestration (3)
- Settings & Configuration (4)
- File & Workspace Management (3)
- Notifications & Updates (1)
- Onboarding & Initial Setup (1)
- Debugging & Monitoring (2)
- Slack Integration (1)
- Cross-Cutting Infrastructure (13)
- Recently Audited Additions (5)

---

## UI Surface → Feature Map

### layout/ Components
- `Layout.tsx`: Overall app shell; hosts sidebar, main view, chat panel
  - Features: 52 (Sidebar Navigation), 74 (Toast Notifications)
- `TopBar.tsx`: Header bar with project name, view switcher, search
  - Features: 52 (Sidebar Navigation), 50 (Global Search)
- `Resize` hooks: Resizable panels
  - Features: 69 (Workspace View & File Editor)

### planning/ Components
- `Canvas.tsx`: Free-form 2D canvas for plan items
  - Features: 5 (Canvas View), 8 (Visual Groups), 9 (Bulk Actions)
- `PlanCard.tsx`: Individual card rendering with hierarchy awareness
  - Features: 1 (Plan Item Hierarchy), 4 (Plan Item Status), 5 (Canvas View), 2 (Spec Fields)
- `CreateItemModal.tsx`: Dialog to create new plan item
  - Features: 1 (Plan Item Hierarchy), 2 (Spec Fields)
- `CanvasContextMenu.tsx`: Right-click menu on canvas
  - Features: 1, 5, 8, 9 (Plan operations)
- `../ui/StatusSelector.tsx`: Dropdown for status changes
  - Features: 4 (Plan Item Status Tracking)
- `PendingActionsPanel.tsx`: Approval queue display for plan actions
  - Features: 10 (Plan Item Approval Flow), 40 (Document & Context-File Editing Tools)
- `PlanCardMenu.tsx`: Card context menu
  - Features: 1, 4, 5, 9 (Plan item operations)
- `PlanCardSections.tsx`: Card metadata display
  - Features: 1, 2, 3 (Hierarchy, specs, relations)

### board-view/ Components
- `BoardView.tsx`: Kanban board layout by status
  - Features: 5 (Plan Views), 23 (Review Loop & Automated Addressing), 25 (GitHub PR Integration), 99 (Merge Queue)
- `BoardColumn.tsx`: Single status column
  - Features: 5 (Plan Views)
- `BoardCard.tsx`: Card in board column, with phase indicator badge
  - Features: 5 (Plan Views), 19 (Plan-item Dev Sessions — phase indicators)
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
- `AgentStartModal.tsx`: Start Implementation modal, including the playbook picker and resolved-plan preview
  - Features: 19 (Plan-item Dev Sessions), 105 (Execution Playbooks)

### tree-view/ Components
- `TreeView.tsx`: Hierarchical tree outline
  - Features: 5 (Plan Views), 1 (Plan Item Hierarchy)

### chat/ Components
- `MessageList.tsx`: Rendered chat history with streaming
  - Features: 11 (Main Chat Interface)
- `ChatInput.tsx`: Text + image input
  - Features: 11 (Main Chat Interface), 12 (Focused Resources)
- `ChatHeader.tsx`: Session id + history dropdown
  - Features: 11 (Main Chat Interface), 13 (System Prompts)
- `SessionList.tsx`: List of chat sessions
  - Features: 11 (Main Chat Interface)
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
- `CustomPromptSettings.tsx`: Custom prompt editor
  - Features: 65 (Custom Prompts)
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
  - Features: 51 (Command Palette), 65 (Custom Prompts)
- `LoopModal.tsx`: Create/edit scheduled loops, view run history
  - Features: 104 (Scheduled Loops)

### confluence/ Components
- `LinkToConfluenceModal.tsx`: Dialog to link document to Confluence page
  - Features: 53 (Confluence Integration)
- `ConfluenceSyncPreviewModal.tsx`: Preview before syncing
  - Features: 53 (Confluence Integration)

### briefing/ Components
- `BriefingModal.tsx`: Display and export project briefing
  - Features: 55 (Project Briefing)

### permission/ Components
- `PermissionPrompt.tsx`: Runtime permission prompt
  - Features: 64 (Tool Permissions)

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
- `Modal.tsx`, `StatusSelector.tsx`, `DiffViewer.tsx`, `DropdownMenu.tsx`: Reusable UI elements
  - Used across: 10, 33, 40, etc. (all approval/diff workflows)

---

## Organizational Patterns

### By Maturity
- **Mature (production-ready):** Nearly every cataloged feature, across every group, except the items called out below.
- **Mature with roadmap items:** Board execution (19, 23, 105), Briefing (55), Agent orchestration (57, 59).
- **Early/Partial:** Some artifact types remain lighter-weight than the core planning/dev-session workflows.
- **Experimental/Optional:** Slack triage (80), custom prompts (65, lightweight), scheduled loops (104, new and lightly used relative to chat/board).

### By Complexity (Internal)
- **High complexity:** Sync Pipeline (33), board execution state machine (23, 105), streaming session architecture (87), context building (94).
- **Medium:** Plan action approval (10), dev sessions (19), tracker integration (27, 31, 33, 35), search (50), scheduled loops (104).
- **Low:** Visual groups (8), notifications (74).

### By User Touchpoints
- **High-frequency:** Main chat (11), plan views (5), workspace view & file editor (69).
- **Medium-frequency:** Settings (61, 62, 64, 65), briefing (55), Markdown focus reader (106).
- **Low-frequency:** Onboarding (76), Confluence integration (53), Slack triage (80), scheduled loops (104).

### By Dependency Complexity
- **Core foundation:** Service container (83), store events (85), IPC pattern (86), repositories (88).
- **Integrations:** Tracker (27, 31, 33, 35), GitHub (25), Confluence (53), Slack (80).
- **Claude SDK:** Streaming (87), tools (91), prompts (92), context (94), agent sessions (59), scheduled loops (104).

---

## Gaps & Orphaned Features

- **Orphaned:** The Tree view (one of the three Plan Views, feature 5) is well-implemented but rarely used (canvas and board are preferred).
- **Dead/unreachable:** The artifacts-manager backend (`ArtifactService` list/read/delete/import, the `artifacts.*` IPC endpoints, and the `window.api.artifacts` preload surface) is fully wired but has no renderer caller — no component lists, opens, or deletes `outputs/` files through it (see feature 46).
- **Optional:** Confluence integration (53) depends on Jira/Atlassian credentials and linked pages, so it is mature in code but not always visible in day-to-day project work.
- **Half-finished:** Slack triage (80) is functional but not heavily marketed; limited user adoption signals.
- **Experimental:** Custom prompts (65) are lightweight; prompt editor UI is basic.
- **Known limitations:**
  - Canvas view (one of the three Plan Views, feature 5) has no auto-layout; manual positioning only.
  - Image editing not supported; inline image paste in chat only.
  - Markdown documents use a dedicated markdown editor (Monaco-backed edit pane plus preview/toolbar) rather than raw Monaco.
  - No advanced IDE features (IntelliSense, debugging, git integration in editor).
  - No real-time collaboration (single-user tool by design).
  - Prompt customization (13) is text-based only; no UI builder.
