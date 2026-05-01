

## Purpose of this Document

This catalog is a working reference for three jobs:

1. **Keep-or-kill decisions** — for each feature, the code locations, maturity signal, and dependency list give enough information to assess cost of upkeep vs. value delivered. See "Organizational Patterns" and "Gaps & Orphaned Features" at the end for a first pass.
2. **Feature showcase** — the feature descriptions and entry points can be lifted into demo scripts, onboarding docs, release notes, or a marketing site. Each entry is written so a non-author can understand what the feature is without reading the code.
3. **UI-to-feature mapping** — the "UI Surface Map" section pairs each component directory (`planning/`, `board-view/`, `workspace/`, etc.) with the features it surfaces. Use it when planning redesigns, extracting component ownership, or identifying dead UI that no longer ties to a live feature.


## Feature Evaluation Criteria

When deciding whether to keep, invest in, or sunset a feature, cross-check against the four criteria from `core-principles.md`:

1. **Does it maintain context continuity?** (Discovery → planning → execution → artifacts)
2. **Does it keep planning out of the repo?** (Data lives in SQLite, not `.md` files in the code tree)
3. **Does it serve the individual developer?** (Not team collaboration — that belongs in Jira)
4. **Does it help communicate outward?** (Artifacts for stakeholders, not live sharing)

A feature that scores low on all four is a candidate for removal even if it is technically sound.

## Table of Contents

**Feature Groups**
7. [Global Search & Navigation](#global-search--navigation) (50–52)

**Reference Sections**
- [Organizational Patterns](#organizational-patterns) — by maturity, complexity, user touchpoints, dependency scope
- [Gaps & Orphaned Features](#gaps--orphaned-features) — candidates for investment or removal

---

## Planning & Plan Management

### 1. Plan Item Hierarchy (Project → Feature → Task)
- **What it does:** Organizes work into a three-level hierarchy (project/feature/task labels). Users create, edit, reorder, reparent, and delete items; items carry status, description, intent, acceptance criteria, external tracker links, release tags, and completion timestamps.
- **Key code locations:**
  - Services: `src/main/services/core/PlanService.ts`, `src/main/db/domain/PlanActionService.ts`, `src/main/db/domain/PlanItemService.ts`, `src/main/db/repositories/impl/PlanItemRepository.ts`
  - Claude tools: `src/main/claude/tools/plan-items.ts`, `src/main/claude/tools/plan-changes.ts`
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
  - File system: item-level completion timestamps feed into weekly updates and artifact generation
  - Claude SDK: in-process tools for querying, creating, updating plan items (with user approval gate)
- **Maturity signal:** Mature. Core to app. Full CRUD, multi-view rendering, performance optimized with perf logging.

### 2. Plan Item Spec Fields (Intent, Acceptance Criteria, Source Document)
- **What it does:** Rich specification for implementation tasks. Intent (one-sentence commitment), acceptance_criteria (checklist), source_document_id (breadcrumb to discovery context). Visible in plan card modal (not on canvas per convention). Sent to implementation agents as the execution contract.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/PlanItemRepository.ts` (rowToPlanItem mapping)
  - Types: `src/shared/base-types.ts` (PlanItem interface)
  - Claude tool: `src/main/claude/tools/plan-changes.ts` (CreateItemAction schema)
  - IPC validation: `src/main/ipc/validation/plan.ts`
- **Entry points / surfaces:**
  - Plan card modal (full details tab)
  - Agent context builder (`DevSessionService.buildAgentContext`): specs shape the agent's task definition
- **Dependencies / integrations:**
  - Artifact generation uses acceptance criteria for weekly updates
  - Dev sessions: intent + criteria feed into agent system prompt
- **Maturity signal:** Mature. Roadmap documents phase 4a/4c for additional spec fields (e.g. type_of_change, deployment_risk).

### 3. Plan Item Relations (Dependencies, Blockers, Related)
- **What it does:** Link plan items via three relation types: depends_on (blocking dependencies), blocks (what this item blocks), relates_to (loose associations). Users query and modify relations; system prevents circular dependencies.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/PlanRelationRepository.ts`
  - Claude tools: `src/main/claude/tools/relations.ts` (read), `src/main/claude/tools/plan-changes.ts` (modify: AddDependencyAction, RemoveDependencyAction)
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
  - IPC handlers: `src/main/ipc/handlers/plan.ts` (updateItemStatus)
  - Stores: `src/renderer/stores/project/planSlice.ts` (statusChanged event)
  - Events: `src/renderer/stores/storeEvents.ts` (status-changed event)
- **Entry points / surfaces:**
  - Status selector dropdown on plan cards
  - Context menu on cards: "Mark Done", "Mark In Progress"
  - Canvas filtering by status category
  - Board view: columns organized by status category
- **Dependencies / integrations:**
  - Tracker sync: `queueTrackerUpdateIfNeeded` called on status change
  - Briefing: filters by status to surface "in progress" and "blocked" items
  - Weekly updates: queries `completed_at` timestamp when status transitions to done
- **Maturity signal:** Mature. Core feature, well-tested status flow.

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

### 8. Visual Groups (Figma-Style Frame Containers)
- **What it does:** Users can create rectangular group containers and assign plan items to them for visual organization (non-hierarchical). Groups have position, size, name, color. Purely visual—no effect on hierarchy or execution.
- **Key code locations:**
  - DB: `src/main/db/repositories/impl/GroupRepository.ts`
  - Service: `src/main/services/core/GroupService.ts`
  - Claude tools: `src/main/claude/tools/groups.ts` (read and modify with PlanActions)
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

- **Key code locations:**
  - Service: `src/main/db/domain/PlanActionService.ts` (action execution after approval)
  - Component: `src/renderer/components/planning/PendingActionsPanel.tsx`
  - Component: `src/renderer/components/layout/ApprovalOverlays.tsx` (modal for reviewing)
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts` (tracks tool calls)
- **Entry points / surfaces:**
  - Item-by-item review with "Approve" / "Reject" buttons
  - Diff view for document updates
- **Dependencies / integrations:**
  - SQLite: audit trail via chat_messages and tool call logs
  - Three-way conflict detection: sync service checks for conflicts before approval

---

## Chat & Claude Integration

- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/chat.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**
  - Session resumption: SDK automatically resumes conversation history on reconnect

### 12. Focused Resources (Context Files for Chat)
- **What it does:** Users pin files/folders to "focused resources" to feed them into Claude's context. Rendered in system prompt as file tree. Users can add via drag-drop from file tree, button click, or Claude suggestions. Persisted per project and chat session.
- **Key code locations:**
  - Store: `src/renderer/stores/project/uiSlice.ts` and `src/renderer/stores/projectDomains.ts` (focused resources list)
  - Service: `src/main/services/core/ChatRuntimeService.ts` (builds context from focused resources)
  - Component: `src/renderer/components/sidebar-tree/ReposAndFilesSection.tsx`, `src/renderer/components/sidebar-tree/RepoContextMenu.tsx`, `src/renderer/components/sidebar-tree/FileContextMenu.tsx`
  - Prompt building: `src/main/claude/prompts/focusedResources.ts`
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

- **Key code locations:**
  - Module: `src/main/claude/prompts/` directory
  - Tool docs: `src/main/claude/prompts/toolDocs.ts`
  - Plan formatting: `src/main/claude/prompts/planFormatting.ts`
  - Prompt registry: `src/main/claude/prompts/promptRegistry.ts` (all prompt keys and defaults)
- **Entry points / surfaces:**
- **Dependencies / integrations:**

### 17. In-Process MCP Tools (Claude Tool Integration)
- **Key code locations:**
  - Tool logging: `src/main/services/toollog/ToolCallLogger.ts` (logs all tool calls)
  - Permission prompting: `src/main/claude/permissions.ts` (permission model via SDK)
- **Entry points / surfaces:**
  - Tool call log available in debug panel (shows tool name, input, output)
  - Permissions UI prompts user first time a tool is used
- **Dependencies / integrations:**
  - Approval queue: plan modification tools emit actions that queue for approval
  - Permissions: tool permissions cached and persisted per project
  - Token usage: tool I/O counts toward token budget

---

## Agentic Task Execution (Board)

- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/review.ts`
  - Store: `src/renderer/stores/devSessions/index.ts` (review state)
- **Entry points / surfaces:**
- **Dependencies / integrations:**
  - Approval queue: replies queued for approval before posting

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**



- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/tracker.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**

- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/tracker.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

### 35. Import (Load Issues from Tracker)
- **Key code locations:**
  - Service: `src/main/db/domain/ImportService.ts` (generateImportPreview, importIssues)
  - Service: `src/main/services/core/TrackerService.ts` (wrapper)
  - IPC handlers: `src/main/ipc/handlers/tracker.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**
  - Association JQL/filter: controls which issues are fetched
  - Type mapping: determines parent-child relationships on import

---

## Documents & Context

- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/files.ts`
- **Entry points / surfaces:**
  - Markdown editor modal with preview
- **Dependencies / integrations:**
  - Global search: documents indexed for FTS queries
  - Confluence sync: documents can be synced to Confluence pages

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

---

## Artifacts & Generation

- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/artifacts.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**

### 46. Artifacts Manager (File List + Open)
- **What it does:** Lists generated artifacts (weekly updates, test plans, etc.) with timestamps and file sizes. Users can open, delete, or re-generate artifacts.
- **Key code locations:**
  - Service: `src/main/services/core/ArtifactService.ts` (list, delete, open)
  - Store: `src/renderer/stores/artifactsStore.ts`
  - Component: Artifact listing in board detail pane
  - IPC handlers: `src/main/ipc/handlers/artifacts.ts`
- **Entry points / surfaces:**
  - Board detail "Artifacts" tab: lists .md files in outputs/ folder
  - Click to open in editor or system app
  - Right-click: delete or regenerate
- **Dependencies / integrations:**
  - File system: lists outputs/ folder
  - App settings: can configure outputs folder location
- **Maturity signal:** Mature. Straightforward artifact management.

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
  - FTS5: substring matching, phrase search with quotes, ranking by relevance
- **Maturity signal:** Mature. Search engine robust with incremental indexing.

### 51. Command Palette (Cmd+K)
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
- **Dependencies / integrations:**
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

- **Key code locations:**
  - DB: `confluence_page_links` table (document_path, site_url, space_key, page_id, page_title, last_synced_at)
  - Repository: `src/main/db/repositories/impl/ConfluenceLinkRepository.ts`
  - IPC handlers: `src/main/ipc/handlers/confluence.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**

---

## Briefing & Project Overview

- **Key code locations:**
  - Service: `src/main/services/core/BriefingService.ts` (two-stage pipeline: Sonnet synthesis + Opus final)
  - IPC handlers: `src/main/ipc/handlers/briefing.ts`
  - Store: `src/renderer/stores/briefingStore.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**
  - Plan items: blocked_by relations, completed_at, status queries
  - Dev sessions: inactive sessions identified
  - Chat history: synthesized for context
  - Confluence links: referenced in briefing if available

---

## Agent Sessions & Orchestration

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

- **Key code locations:**
  - IPC handlers: `src/main/ipc/handlers/agentSessions.ts`

---

## Settings & Configuration

### 61. General Settings (Account, Workflow, App Preferences)
- **Key code locations:**
  - Service: `src/main/services/core/SettingsService.ts`
  - Store: `src/renderer/stores/generalSettingsStore.ts`
  - DB: `app_settings` table (key-value store)
  - IPC handlers: `src/main/ipc/handlers/settings.ts`
- **Entry points / surfaces:**
  - Save button to persist
- **Dependencies / integrations:**
  - App lifecycle: theme applies to all windows
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

- **Key code locations:**
  - Store: `src/renderer/stores/toolPermissionStore.ts`
  - DB: `tool_permissions` table (project_id, tool_name, cache_key, label)
  - IPC handlers: `src/main/ipc/handlers/permission.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**

### 65. Custom Prompts (User-Defined Prompt Library)
- **Key code locations:**
  - Service: `src/main/services/core/CustomPromptService.ts`
  - Store: `src/renderer/stores/customPromptStore.ts`
  - IPC handlers: `src/main/ipc/handlers/customPrompts.ts`
- **Entry points / surfaces:**
  - Settings → Custom Prompts tab
  - Edit/delete existing
- **Dependencies / integrations:**
- **Maturity signal:** Mature. Custom prompt system functional and extensible.

---

## File & Workspace Management

### 68. File Explorer (Browse Project Folder)
- **Key code locations:**
- **Entry points / surfaces:**
  - Drag file to add to focused resources
- **Dependencies / integrations:**
  - Focused resources: drag-drop integration

- **Key code locations:**
  - Store: `src/renderer/stores/workspaceStore.ts` (editing state, unsaved files)
  - Service: `src/main/services/files/RepoFileService.ts` (read/write files)
  - IPC handlers: `src/main/ipc/handlers/repoFiles.ts`
- **Entry points / surfaces:**
- **Dependencies / integrations:**
  - Monaco editor: syntax highlighting, read-only code viewing, basic language support for non-markdown files

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

- **Key code locations:**
  - Service: `src/main/services/core/OnboardingFacadeService.ts` (orchestrates)
  - Service: `src/main/services/generation/OnboardingService.ts` (generation)
  - Component: `src/renderer/components/onboarding/` (wizard UI)
  - IPC handlers: `src/main/ipc/handlers/onboarding.ts`
  - DB: stores selected directories in `projects.context_directories`
- **Entry points / surfaces:**
  - Create new project modal → triggers wizard
  - Step 1: select repo directories to analyze
  - Step 2: confirm selection
  - Step 3: generation progress
  - Finish to complete project setup
- **Dependencies / integrations:**
  - File system: scans directories
- **Maturity signal:** Mature. Onboarding flow comprehensive.

---

## Debugging & Monitoring

- **Key code locations:**
- **Entry points / surfaces:**
- **Dependencies / integrations:**

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

- **Key code locations:**
  - Adapter: `src/main/services/core/slackTriageAdapter.ts` (MCP integration wrapper)
  - Claude prompts: `src/main/claude/prompts/slackTriage.ts` (classification prompt)
  - IPC handlers: `src/main/ipc/handlers/slack.ts`
  - DB: `slack_channel_links`, `slack_triage_items` tables
- **Entry points / surfaces:**
- **Dependencies / integrations:**
  - Claude: Sonnet for message classification

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
  - Discriminated union types: `PendingPlanActionsItem`, `PendingDocumentItem`, `PendingClaudeMdItem`, `PendingImplementationItem`, `PendingReviewReplyItem`
- **Why it matters:** Prevents Claude from making changes unilaterally. Single approval model for all change types. Reduces user confusion.

### 85. Store Events (Cross-Store Communication)
- **Architecture:** Zustand stores avoid circular imports by emitting typed events via `storeEvents.ts`. Other stores subscribe to events (e.g., `status-changed` event). Decoupled communication without shared context.
- **Key code locations:**
  - Module: `src/renderer/stores/storeEvents.ts` (event definitions and emitter)
  - Listeners: stores subscribe via `subscribe()` or `on()` helpers
- **Why it matters:** Avoids circular dependencies between stores. Clean event-driven architecture.

### 86. IPC Handler Pattern (Validation + Service Delegation)
- **Architecture:** Each IPC handler validates input with Zod schema, then delegates to service layer. Services return `ServiceResult<T>` (success/failure). IPC handlers forward result to renderer.
- **Key code locations:**
  - Validation schemas: `src/main/ipc/validation/` (organized by domain)
  - Handler pattern: `src/main/ipc/handlers/*.ts` (each handler follows same pattern)
  - Utility: `createIpcHandler()` helper for consistent wrapping
- **Why it matters:** Clear separation of concerns. Type-safe IPC. Easy to test services independently of IPC.

### 87. Streaming Session Architecture (Push-to-Pull Adapter)
- **Key code locations:**

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
  - Tool factory: `src/main/claude/tools/index.ts` (tool() helper)
  - Schemas: Each tool file (plan-items, plan-changes, etc.) defines its own schemas
  - Creation: `createKpmServer.ts` assembles all tools into MCP server
- **Why it matters:** Type-safe tool definitions. SDK validates inputs. Errors caught early.

### 92. Prompt Registry (Centralized Prompt Definitions)
- **Architecture:** All Claude system prompts registered in `src/main/claude/prompts/promptRegistry.ts`. Each prompt has: key, name, description, category, default content, variables. System prompt built by assembling registry modules. User can override any prompt.
- **Key code locations:**
  - Registry: `src/main/claude/prompts/promptRegistry.ts`
  - Modules: `src/main/claude/prompts/*.ts` (modes, tools, workspace, etc.)
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
- **Key code locations:**
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
- **Key code locations:**
  - Service: `src/main/services/core/CustomThemeService.ts`
  - Repository: `src/main/db/repositories/impl/CustomThemeRepository.ts`
  - IPC handlers: `src/main/ipc/handlers/customThemes.ts`
  - Types: `src/shared/customThemes.ts`
  - Context: `src/renderer/contexts/ThemeContext.tsx`
  - Components: `src/renderer/components/settings/ThemesSettings.tsx`, `src/renderer/components/settings/ThemeSelector.tsx`
  - Theme runtime: `src/renderer/themes/index.ts`
  - DB: `custom_themes`
- **Entry points / surfaces:**
  - Settings → Themes tab
  - Theme grid with preview swatches
  - Import field for VS Code Themes URLs
  - Delete button for custom themes
- **Dependencies / integrations:**
  - Marketplace VSIX download from Visual Studio Marketplace
  - Monaco theme data generation
  - Local storage for current theme preference
- **Maturity signal:** Mature. URL validation, package size limits, zip parsing, persistence, delete flow, and unit tests exist.

- **Key code locations:**
  - Service: `src/main/services/repo/RepoService.ts`
  - Service: `src/main/services/repo/EnvironmentService.ts`
  - Repository: `src/main/db/repositories/impl/RepoRepository.ts`
  - Stores: `src/renderer/stores/project/resourceSlice.ts`
- **Entry points / surfaces:**
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
  - Claude tool: `src/main/claude/tools/storybook.ts`
  - Prompt docs: `src/main/claude/prompts/toolDocs.ts`
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
  - Claude tool: `src/main/claude/tools/plan-refs.ts` (`extract_plan_items_from_doc`)
  - Validation: `src/main/db/domain/PlanActionService.ts` (rejects unresolved refs)
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

---

## Summary


**Feature density by area:**
- Global Search & Navigation (3)
- Notifications & Updates (1)
- Onboarding & Initial Setup (1)
- Cross-Cutting Infrastructure (13)

---

## UI Surface → Feature Map

### layout/ Components
- `Layout.tsx`: Overall app shell; hosts sidebar, main view, chat panel
- `TopBar.tsx`: Header bar with project name, view switcher, search
- `Resize` hooks: Resizable panels

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
- `PlanCardMenu.tsx`: Card context menu
  - Features: 1, 4, 5, 9 (Plan item operations)
- `PlanCardSections.tsx`: Card metadata display
  - Features: 1, 2, 3 (Hierarchy, specs, relations)

### board-view/ Components
- `BoardView.tsx`: Kanban board layout by status
- `BoardColumn.tsx`: Single status column
- `DetailPane.tsx`: Right-side detail panel (activity, changes, artifacts, agent)
- `MergeQueuePanel.tsx`: Open-PR ordering with dependency-derived blockers
  - Features: 99 (Merge Queue)

### tree-view/ Components
- `TreeView.tsx`: Hierarchical tree outline

### chat/ Components
- `MessageList.tsx`: Rendered chat history with streaming
- `ChatInput.tsx`: Text + image input
- `ChatHeader.tsx`: Session id + history dropdown
- `SessionList.tsx`: List of chat sessions
- `ModelSelector.tsx`: Choose Claude model
- `SessionHistory.tsx`: Past messages in session
- `ProcessTimeline.tsx`: Consolidated thinking + tool activity

### development/ Components
- `ReviewTab.tsx`: Review thread list rendered in the board detail pane
- `ReviewReplyApprovalPanel.tsx`: Reply composition for review threads
- `LinkPrDialog.tsx`: Link session to GitHub PR
- `LinkPrToItemDialog.tsx`: Link an existing PR to a plan item
- `CreatePrModal.tsx`: Create PR from branch
- `GeneratePrContentModal.tsx`: View/copy AI-generated PR title and description

### workspace/ Components
- `WorkspaceView.tsx`: Chat-first layout with file editor
- `WorkspaceHome.tsx`: Default workspace landing page

### tracker/ Components
- `TrackerSection.tsx`: Tracker integration controls in sidebar
- `config/TrackerLinkProjectDialog.tsx`: Association/project link editor

### sidebar/ Components
- `RepoListSection.tsx`: Repository sources with branch info
- File/repo context menu focus actions: pinned files, folders, and repos for chat context
  - Features: 12 (Focused Resources)
- Project list: Switch between projects

### sidebar-tree/ Components
- `ReposAndFilesSection.tsx`, `ProjectFilesTreeSection.tsx`: Hierarchical repo/file tree

### settings/ Components
- `SettingsModal.tsx`: Settings hub with tabs
- `McpServersSettings.tsx`: MCP server registration
  - Features: 62 (MCP Server Configuration)
- `PermissionsSettings.tsx`: Tool permissions management
  - Features: 64 (Tool Permissions)
- `CustomPromptSettings.tsx`: Custom prompt editor
  - Features: 65 (Custom Prompts)
- `PromptsSettings.tsx`: System prompt overrides
- `ThemesSettings.tsx`, `ThemeSelector.tsx`: Built-in and imported themes
  - Features: 96 (Custom Themes)
- `TaskPromptSettings.tsx`: Implementation agent instructions
- `StorybookSettings.tsx`: Storybook URL and connection test
  - Features: 101 (Storybook Component Discovery)

### command-palette/ Components
- `CommandPalette.tsx`: Cmd+K interface with fuzzy search
  - Features: 51 (Command Palette), 65 (Custom Prompts)

### confluence/ Components
- `LinkToConfluenceModal.tsx`: Dialog to link document to Confluence page
- `ConfluenceSyncPreviewModal.tsx`: Preview before syncing

### briefing/ Components
- `BriefingModal.tsx`: Display and export project briefing

### permission/ Components
- `PermissionPrompt.tsx`: Runtime permission prompt

### global-search/ Components
- `GlobalSearch.tsx`: Search UI and results
  - Features: 50 (Global Search)
- `SearchResultItem.tsx`: Single result rendering
  - Features: 50 (Global Search)

### image-viewer-modal/ Components
- `index.tsx`: Full-size image viewer with zoom/pan

### markdown-document-modal/ Components
- `index.tsx`: Markdown editor for documents and context files

### tool-log/ Components
- Tool log panel for inspecting tool calls

### onboarding/ Components
- Wizard for initial project setup
  - Features: 76 (Project Onboarding Wizard)

### ui/ Components (Shared primitives)

---

## Organizational Patterns

### By Maturity
- **Early/Partial:** Some artifact types remain lighter-weight than the core planning/dev-session workflows.

### By Complexity (Internal)
- **Low:** Visual groups (8), notifications (74).

### By User Touchpoints

### By Dependency Complexity
- **Core foundation:** Service container (83), store events (85), IPC pattern (86), repositories (88).

---

## Gaps & Orphaned Features

- **Experimental:** Custom prompts (65) are lightweight; prompt editor UI is basic.
- **Known limitations:**
  - Image editing not supported; inline image paste in chat only.
  - Markdown documents use a dedicated markdown editor (Monaco-backed edit pane plus preview/toolbar) rather than raw Monaco.
  - No advanced IDE features (IntelliSense, debugging, git integration in editor).
  - No real-time collaboration (single-user tool by design).
