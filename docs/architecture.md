# Architecture

## Process Boundaries

| Process | Restart |
|---------|---------|
| Electron App | Quit and reopen |

## Directory Structure

```
src/
├── main/                    # Electron main process
│   ├── db/
│   │   ├── connection.ts    # Schema definition
│   │   ├── migrations.ts    # Database migrations
│   │   ├── interfaces/      # Repository interfaces
│   │   ├── repositories/    # CRUD operations
│   │   └── domain/          # Domain services (Sync, Export, Import)
│   ├── ipc/                 # IPC handlers
│   │   ├── handlers/        # Handler implementations by domain
│   │   └── validation/      # Zod schemas by domain
│   ├── claude/              # Claude SDK integration
│   │   ├── tools/           # In-process MCP tools
│   │   ├── prompts/         # System prompt modules
│   │   └── streaming/       # Streaming session classes
│   ├── services/            # Application services (DI pattern)
│   │   ├── agents/          # AgentSessionManager, Claude/Codex/Gemini sessions, hooks, auto-review
│   │   └── PerfLogger.ts    # Performance metrics
│   ├── trackers/            # Tracker-specific logic
├── renderer/                # React frontend
│   ├── components/
│   │   ├── ui/              # Shared primitives (Modal, Button, StatusBadge)
│   │   ├── layout/          # App shell (Layout, TopBar) + hooks
│   │   ├── planning/        # Plan views (Canvas, TreeView, BoardView, PlanCard)
│   │   ├── chat/            # Chat interface
│   │   ├── tracker/         # Jira integration
│   │   ├── development/     # Shared PR/review components used by the board
│   │   ├── workspace/       # Workspace view (chat-first with file browser)
│   │   ├── sidebar/         # Left sidebar components
│   │   ├── settings/        # Settings dialogs
│   │   ├── command-palette/ # Command palette
│   │   ├── onboarding/      # Project onboarding wizard
│   │   ├── slack/           # Slack triage UI
│   ├── stores/              # Zustand state management
│   │   ├── project/         # Sliced project store
│   │   └── tracker/         # Tracker-related stores
│   └── constants/
├── preload/                 # IPC bridge (security boundary)
```

## Project Folder Structure


```
{project_folder}/
├── outputs/                 # Generated artifacts (weekly updates, test plans)
```

## Domain Model

**Hierarchy:** project → feature → task

**Status categories:** `not_started` | `in_progress` | `in_review` | `done` | `blocked` | `canceled`

**Tracker linking:** Connection → Scope → Association (JQL filter)

## Database Tables

| Table | Purpose |
|-------|---------|
| `attachments` | Uploaded files |
| `plan_items` | Plan hierarchy + external tracker fields + `completed_at` |
| `plan_relations` | Dependencies (depends_on, blocks, relates_to) |
| `tracker_connections` | Site-level connections (credentials in OS keychain) |
| `tracker_project_scopes` | Tracker project authorization (Jira/Linear) |
| `tracker_type_mappings` | Label → tracker issue type |
| `sync_snapshots` | Last-synced state for three-way conflict detection |
| `app_settings` | Global key-value application preferences |
| `tool_permissions` | Persisted per-project tool permission grants |
| `project_briefings` | Cached generated project briefings |
| `review_ownership` | Review-thread ownership decisions |
| `review_sync_state` | PR review polling cursors and sync state |
| `agent_review_runs` | Opposing-agent review run metadata |
| `agent_review_findings` | Structured findings from opposing-agent reviews |
| `slack_channel_links` | Slack channel links for project triage |
| `slack_triage_items` | Triaged Slack messages and suggested actions |

**Key fields for features:**
- `plan_items.completed_at` - When item marked done (for weekly updates)
- `chat_sessions.claude_session_id` - Claude SDK session ID for resuming conversations
- `dev_sessions.worktree_path` - Path to isolated git worktree
- `dev_sessions.merge_order` - Optional user override for merge queue ordering
- `repos.active_worktree_path` - Active checkout used for repo context and branch watching
- `agent_review_runs.status` - Latest opposing-agent review freshness (`complete` or `stale`)

## Repository Architecture

**Dependency Injection Container** (`src/main/db/container.ts`):
- Singleton pattern with lazy initialization
- Testable via mock injection

**Repository Interfaces** (`src/main/db/interfaces/`):
- Type definitions separated by domain (plan, project, tracker, etc.)
- Clean separation between interface and implementation
- Enables mocking for unit tests

| Repository | Purpose |
|------------|---------|
| `ProjectRepository` | Project CRUD |
| `PlanItemRepository` | Plan items with hierarchy (cached statements) |
| `PlanRelationRepository` | Item dependencies |
| `TrackerRepository` | Three-level tracker config |
| `SyncRepository` | Conflict detection snapshots |
| `SyncQueueRepository` | Export queue management |
| `ExternalPlanItemRepository` | Tracker-linked items |
| `DevSessionRepository` | Implementation sessions |
| `ChatMessageRepository` | Unified chat history |
| `CustomThemeRepository` | Imported theme persistence |
| `ToolPermissionRepository` | Persisted tool permission grants |
| `ReviewTaskRepository` | GitHub review tasks |
| `ReviewOwnershipRepository` | Review ownership/routing state |
| `ReviewSyncStateRepository` | Review polling and reconciliation cursors |
| `AgentReviewRepository` | Opposing-agent review runs and findings |
| `SlackChannelLinkRepository` | Slack channel links |
| `SlackTriageItemRepository` | Slack triage items and action suggestions |

## Service Architecture

**Two-Layer Service Pattern:**

1. **Domain Services** (`src/main/db/domain/`):
   - Tightly coupled to database
   - Handle multi-table transactions

2. **Application Services** (`src/main/services/`):
   - Testable with dependency injection
   - Return `ServiceResult<T>` for explicit error handling
   - Organized by domain:
     - `PerfLogger.ts` - PerfLogger

**Composition Root** (`src/main/services/appServices.ts`):
- Wires all services with their dependencies
- Single point of service instantiation

## Frontend Architecture

**Zustand Store Organization** (`src/renderer/stores/`):

**Sliced Project Store** - Main state management:
- `project/projectSlice.ts` - Project CRUD
- `project/planSlice.ts` - Plan items, actions, relations
- `project/uiSlice.ts` - UI state (editing, focused resources)
- `project/resourceSlice.ts` - Repos, attachments, worktrees

- `devSessions/` - Plan-item dev sessions, PR context, review inbox, merge order
- `workspaceStore.ts` - Workspace file tree, editor state
- `trackerStore.ts` - Tracker associations
- `tracker/useSyncStore.ts` - Sync preview & conflicts
- `tracker/useExportStore.ts` - Export queue
- `tracker/useCredentialStore.ts` - Tracker credentials
- `artifactsStore.ts` - Generated artifacts
- `permissionStore.ts` - Permission requests
- `fileTreeStore.ts` - File explorer state
- `contextRegenerationStore.ts` - Context regeneration modal state
- `useSlackTriageStore.ts` - Slack triage panel and execution state

Focused resources live in the sliced project UI state (`project/uiSlice.ts`) and are accessed through `useProjectUiDomainStore`.

**Cross-Store Events** (`storeEvents.ts`):
- `status-changed` - Plan item status updated
- `navigate-to-view` - Navigate between planning/workspace views
- `file-explorer-changed` - Project file watcher reported create/update/delete/rename
- `chat-file-updated` - Chat/document flow updated a project file

| Component | Purpose |
|-----------|---------|
| `layout/` | Three-panel design (sidebar, main, chat) with resize hooks |
| `planning/` | Card/Tree/Board views for plan items |
| `chat/` | Claude chat interface with streaming |
| `development/` | Shared PR/review components (CreatePrModal, ReviewTab, etc.) used by the board |
| `workspace/` | Chat-first view with file browser and editor (default view) |
| `sidebar/` | Project list, sources, context editor |
| `command-palette/` | Cmd+K command interface |
| `ui/` | Shared UI primitives (Modal, Button, StatusBadge) |
| `slack/` | Slack triage panel, badge, channel settings |
| `onboarding/` | Project onboarding and context regeneration |

## IPC Pattern

```
Renderer → ipcRenderer.invoke (Zod validated) → Handler → Service → Repository → SQLite
```

**Validation Organization** (`src/main/ipc/validation/`):
- Schemas organized by domain (plan, project, chat, tracker, etc.)
- Shared validators in `shared.ts` (uuid, paths, etc.)
- `createIpcHandler()` utility for consistent patterns

## Cross-Store Communication

Use `stores/storeEvents.ts` to avoid circular deps:
```typescript
emit({
  type: 'status-changed',
  payload: { projectId, itemId, statusCategory, externalKey, associationId },
});
```

## RepoWatcherService

Tracks git branch changes for connected repositories in real-time.

**Files:**
- `services/repo/RepoWatcherService.ts` - Service implementation
- `ipc/handlers/repos.ts` - IPC handlers for watch/unwatch
- `stores/project/resourceSlice.ts` - Branch state (`repoBranches`)
- `components/sidebar-tree/RepoListSection.tsx`, `components/sidebar-tree/RepoItem.tsx` - Branch badge UI

**How it works:**
1. When repo connected → `watchRepo()` starts `fs.watch` on `.git/HEAD`
2. Branch change detected → debounced (100ms) → `repo:branch-changed` IPC event
3. Renderer updates `repoBranches` store → UI shows new branch

**Lifecycle:**
- `init()` called on app startup with window getter (avoids timing issues)
- Watchers created per-repo when repos are loaded/connected
- `unwatchRepo()` called when repo removed or project switched
- `unwatchAll()` called on app quit

**Gotchas:**
- macOS fires `rename` events (not `change`) when git rewrites HEAD—handle both
- Window getter pattern avoids null reference when IPC registers before window exists
- Must clean up watchers on project switch to prevent memory leaks
- Debouncing prevents rapid-fire events from some file systems

## Claude Integration Architecture


```
┌─────────────────────────────────────────────────────────────────┐
│  Main Chat (Streaming Session)                                  │
│  ├─ StreamingSessionService (Claude lifecycle)                  │
│  │   └─ StreamingSession (Claude SDK wrapper)                   │
│  │       └─ AsyncMessageQueue (push-to-pull adapter)            │
│  ├─ Claude SDK query() with streaming input                     │
│  ├─ In-process SDK MCP Server                                   │
│  │   └─ Tools as direct function calls                          │
│  │       ├─ Plan tools (get hierarchy, filter, modify)          │
│  │       ├─ Jira tools (search, get issues, compare)            │
│  │       ├─ Relations tools (dependencies, blockers)            │
│  │       └─ Storybook tools (list/search components)            │
│  └─ Database (single connection)                                │
└─────────────────────────────────────────────────────────────────┘
│  Plan-item Dev Sessions (board-driven, isolated worktrees)       │
```

**Key files:**
- `src/main/claude/tools/createKpmServer.ts` - MCP server factory
- `src/main/claude/tools/plan-items.ts` - Plan query tools
- `src/main/claude/tools/plan-changes.ts` - Plan modification tool
- `src/main/claude/tools/relations.ts` - Dependency/relation tools
- `src/main/claude/tools/jira.ts` - Jira integration
- `src/main/claude/tools/storybook.ts` - Component discovery
- `src/main/claude/streaming/` - Streaming session classes
- `src/main/claude/prompts/` - System prompt modules
- `src/main/services/streaming/StreamingSessionService.ts` - Main chat session management
- `src/main/services/repo/DevSessionService.ts` - Plan-item dev session management
- `src/main/services/agents/AgentSessionManager.ts` - Multi-agent lifecycle management
- `src/main/services/agents/autoReview.ts` - Opposing-agent review pipeline

**System Prompt Organization** (`src/main/claude/prompts/`):
- `toolDocs.ts` - Tool usage guidance
- `planFormatting.ts` - Plan display formatting
- `focusedResources.ts` - Focused resource handling

**Streaming Sessions:**
- Connects on project open (zero-latency first message)
- Auto-reconnects after 30min idle timeout
- Full conversation history via SDK resume

**Plan-item Dev Sessions:**
- Launched from the board view by selecting a plan item and starting agent execution
- Multiple isolated implementation/review agent subprocesses
- Each runs in a separate git worktree
- User approval required before starting
- Automatic opposing-agent review can run after implementation completion and feed findings back into the implementation session before the plan item moves to `in_review`

