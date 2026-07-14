# Architecture

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
│   ├── bootstrap/            # App menu, dock icon, window manager
│   ├── ipc/                 # IPC handlers
│   │   ├── handlers/        # Handler implementations by domain
│   │   ├── register/        # Handler registration by domain (workspace, development, platform)
│   │   └── validation/      # Shared validators, handler wiring utils, registry-schema refines
│   ├── claude/              # Claude SDK integration
│   │   ├── tools/           # In-process MCP tools
│   │   ├── prompts/         # System prompt modules
│   │   └── streaming/       # Streaming session classes
│   ├── codex/               # Codex auth, binary, and error helpers
│   ├── config/              # Runtime configuration and defaults
│   ├── documents/           # Plan-ref resolver + markdown codecs (used at every export boundary)
│   │   └── codecs/          # Per-format markdown codecs
│   ├── project-context/     # Project context file compatibility helpers
│   ├── security/            # URL and app-navigation safety helpers
│   ├── services/            # Application services (DI pattern)
│   │   ├── core/            # Plan, Project, Chat, Briefing, Tracker, Onboarding, settings
│   │   ├── repo/            # Repo, DevSession, GitHub, Environment, Review, ScheduledLoopRunner
│   │   ├── files/           # FileExplorer, FileSummary, TempImage, RepoFile, watchers, scoped FS
│   │   ├── streaming/       # Terminal and Claude StreamingSession
│   │   ├── generation/      # CustomPrompt, Onboarding
│   │   ├── agents/          # AgentSessionManager, Claude/Codex/Gemini sessions, hooks, auto-review
│   │   ├── confluence/      # ConfluenceSyncService
│   │   ├── composition/     # Service composition helpers
│   │   ├── toollog/         # Tool call logging
│   │   └── PerfLogger.ts    # Performance metrics
│   ├── trackers/            # Tracker-specific logic
│   ├── tracker-clients/     # Jira/Linear API clients
│   └── wiki-clients/        # Confluence API client
├── renderer/                # React frontend
│   ├── components/          # Feature-organized UI — see src/renderer/CLAUDE.md and the UI Surface Map in docs/features.md
│   ├── stores/              # Zustand state management
│   │   ├── project/         # Sliced project store
│   │   ├── chat/            # Chat store slices
│   │   ├── devSessions/     # Dev-session store slices
│   │   └── tracker/         # Tracker-related stores
│   ├── contexts/            # Stable providers (currently theme)
│   ├── hooks/               # Cross-feature renderer hooks
│   ├── lib/                 # Renderer library integrations
│   ├── services/            # Renderer-side API wrappers
│   ├── themes/              # Theme loading and normalization
│   ├── types/               # Renderer/global type declarations
│   ├── utils/               # Renderer utilities
│   └── constants/
├── preload/                 # IPC bridge (security boundary)
└── shared/                  # Shared types and process-neutral contracts
```

## Project Folder Structure

A KPM project has a KPM-owned project folder. That folder may be a git repository if the user chooses, but it is not assumed to be one of the connected code repos. Plans live in SQLite; project files are local working documents and generated artifacts.

```
{project_folder}/
├── attachments/             # Uploaded attachment copies
├── outputs/                 # Generated artifacts (markdown outputs from custom prompts)
├── AGENTS.md                # Preferred project context file, when present
└── CLAUDE.md                # Backward-compatible project context file
```

Do not create `.kpm/` folders or store plan hierarchy data inside connected repos. Connected repos are linked through the `repos` table and read/write rules, not by embedding KPM metadata in their working trees.

## Domain Model

**Hierarchy:** project → feature → task

**Status categories:** `not_started` | `in_progress` | `in_review` | `done` | `blocked` | `canceled`

**Tracker linking:** Connection → Scope → Association (JQL filter)

## Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | KPM projects (name, folder, phase, session state, token usage) |
| `repos` | Connected repositories plus environment mode and active worktree override |
| `attachments` | Uploaded files |
| `plan_items` | Plan hierarchy + external tracker fields + `completed_at` |
| `plan_relations` | Dependencies (depends_on, blocks, relates_to) |
| `tracker_connections` | Site-level connections (credentials in OS keychain) |
| `tracker_project_scopes` | Tracker project authorization (Jira/Linear) |
| `kpm_tracker_associations` | Tracker sync filters (JQL for Jira) + status/custom field mappings |
| `tracker_type_mappings` | Label → tracker issue type |
| `sync_queue` | Items staged for export (with custom field overrides) |
| `sync_snapshots` | Last-synced state for three-way conflict detection |
| `chat_messages` | Persistent message history |
| `dev_sessions` | Plan-item-tied dev sessions for board agentic execution (pending/active/inactive status); `base_sha` records the immutable fork-point SHA used for commit-range attribution; `review_policy` (auto/skip) selects whether opposing review runs, added in migration 093 (which also added the now-unused `execution_mode` column); `worktree_path` records the session's isolated git worktree |
| `app_settings` | Global key-value application preferences |
| `custom_themes` | Imported VS Code/KPM theme definitions |
| `confluence_page_links` | Document ↔ Confluence page links |
| `chat_sessions` | Chat session metadata; `scope` (main/focus_document) and `focus_document_*` columns added in migration 091 for focus-mode threads |
| `groups` | Visual group containers |
| `custom_prompts` | Custom prompts; `target_type` (none/document/repo) and `run_mode` (artifact/chat) columns added in migration 090 |
| `task_prompt_templates` | Task prompt templates |
| `tool_permissions` | Persisted per-project tool permission grants |
| `project_briefings` | Cached generated project briefings |
| `review_tasks` | GitHub review threads normalized into KPM review tasks |
| `review_ownership` | Review-thread ownership decisions |
| `review_sync_state` | PR review polling cursors and sync state |
| `agent_review_runs` | Opposing-agent review run metadata |
| `agent_review_findings` | Structured findings from opposing-agent reviews |
| `slack_channel_links` | Slack channel links for project triage |
| `slack_triage_items` | Triaged Slack messages and suggested actions |
| `global_search_index` | Full-text search metadata |
| `global_search_fts` | Virtual FTS5 table for full-text search |
| `claude_usage_events` | Claude usage/cost accounting events |
| `project_file_metadata` | Cached summaries and indexing metadata for project files |
| `scheduled_loops` | Cmd+K-managed recurring agent prompts (notify/report/maintain output mode, interval, enabled, last outcome) |
| `loop_runs` | Run history for scheduled loops (outcome, summary, error, artifact path) |

**Key fields for features:**
- `plan_items.completed_at` - Stamped on transition to done, cleared on transition away; no feature currently reads it
- `chat_sessions.claude_session_id` - Claude SDK session ID for resuming conversations
- `dev_sessions.worktree_path` - Path to isolated git worktree
- `dev_sessions.status` - Session lifecycle state (pending, active, inactive)
- `dev_sessions.automation_phase` - Board automation state (`idle`, `reviewing`, `addressing_review`, `fixing_commit_hooks`, `fixing_commit_hooks_after_review`, `ready_for_review`, `needs_attention`)
- `dev_sessions.base_sha` - Immutable fork-point SHA captured when worktree is created; used to compute commit range for Changes tab (falls back to merge-base for legacy rows)
- `dev_sessions.merge_order` - Optional user override for merge queue ordering
- `repos.active_worktree_path` - Active checkout used for repo context and branch watching
- `chat_messages.chat_session_id` - Session boundary tracking for history browsing
- `agent_review_runs.status` - Latest opposing-agent review freshness (`complete` or `stale`)

## Repository Architecture

**Dependency Injection Container** (`src/main/db/container.ts`):
- Factory function creates all repositories with database instance
- Singleton pattern with lazy initialization
- Testable via mock injection

**Repository Interfaces** (`src/main/db/interfaces/`):
- Type definitions separated by domain (plan, project, tracker, etc.)
- Clean separation between interface and implementation
- Enables mocking for unit tests

Repositories live in `src/main/db/repositories/impl/` — read the directory for the full list (see [`src/main/db/CLAUDE.md`](../src/main/db/CLAUDE.md)).

## Service Architecture

**Two-Layer Service Pattern:**

1. **Domain Services** (`src/main/db/domain/`):
   - Tightly coupled to database
   - Handle multi-table transactions
   - Services: `SyncService`, `ExportService`, `ImportService`, `PlanActionService`, `PlanItemService`, `SyncQueuePolicy`, `TypeMappingService`, `GroupAssignmentService`

2. **Application Services** (`src/main/services/`):
   - Testable with dependency injection
   - Return `ServiceResult<T>` for explicit error handling
   - Organized by domain under `src/main/services/` — see [`src/main/services/CLAUDE.md`](../src/main/services/CLAUDE.md) for the annotated catalog

**Shared polling** (`PollScheduler`): a single timer drives interval-based polling. `ReviewPollService`, `StreamingSessionService` (chat session cleanup ticks), and `ScheduledLoopRunnerService` register tasks instead of holding their own `setInterval`. Repo and project file watching use fs watchers, and `SearchService` runs its own interval — they do not register.

**Composition Root** (`src/main/services/appServices.ts`):
- Wires all services with their dependencies
- Single point of service instantiation

**Service Container** (`src/main/services/container.ts`):
- Global access to services via `getServices()`
- Test injection via `setServices()` / `resetServices()`

## Frontend Architecture

**Zustand Store Organization** (`src/renderer/stores/`): a sliced project store (`project/` — projectSlice, planSlice, uiSlice, resourceSlice) plus one specialized store per feature domain. See [`src/renderer/stores/CLAUDE.md`](../src/renderer/stores/CLAUDE.md) for the full organization and patterns. Focused resources live in the project UI slice (`project/uiSlice.ts`), accessed through `useProjectUiDomainStore`.

**Cross-Store Events** (`storeEvents.ts`): stores communicate side effects via typed events to avoid circular imports. `storeEvents.ts` is the authoritative event list — don't duplicate it in docs.

**Project-Scoped Store Management** (`projectScopedStores.ts`): manages store lifecycle tied to project switching; clears relevant stores when the project changes.

## IPC Pattern

```
Renderer → ipcRenderer.invoke (Zod validated) → Handler → Service → Repository → SQLite
```

**Validation Organization**:
- Each domain's Zod payload schemas live in `src/shared/ipc/{domain}Endpoints.ts` — the endpoint registry is their single owner
- `src/main/ipc/validation/` holds only what the registry can't express itself: shared validators (`shared.ts`: uuid, paths, etc.), handler wiring utilities (`createIpcHandler()`, `createRegistryIpcHandlers()`, `bindRegistryHandlers()` in `utils.ts`), and stronger refines layered on top of specific registry schemas (path-existence / temp-dir scoping checks needing Node builtins unavailable in registry files bundled into the renderer)

## Claude Integration Architecture

KPM runs chat/dev sessions on one of three provider backends behind a provider-neutral `IChatSession` — the Claude Agent SDK (Claude), the Codex SDK (Codex), and pi.dev (pi) — plus in-process MCP tools (`src/main/kpmTools/`) shared across all three for KPM-aware tool calls:

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
│  │       ├─ Document tools (create, edit, context updates)      │
│  │       ├─ Confluence tools (URL lookup)                       │
│  │       ├─ GitHub tools (PR description generation)            │
│  │       ├─ Briefing tools (project briefing generation)        │
│  │       ├─ File tools (move/delete project files)              │
│  │       ├─ Git tools (read-only git against connected repos)   │
│  │       └─ Storybook tools (list/search components)            │
│  └─ Database (single connection)                                │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Plan-item Dev Sessions (board-driven, isolated worktrees)       │
│  ↑ Triggered from the Board UI via IPC                           │
│    (agent-session:create-and-start) — not a chat tool call       │
│  ├─ DevSessionService (session + worktree management)            │
│  ├─ AgentSessionManager (Claude/Codex/Gemini backends)           │
│  ├─ BoardAgentOrchestrator (implement → review → address → ready)│
│  └─ Multiple concurrent sessions:                                │
│      ├─ Session 1: Git worktree + implementation agent           │
│      ├─ Session 2: Git worktree + review agent                   │
│      └─ Session N: Git worktree + agent subprocess               │
└──────────────────────────────────────────────────────────────────┘
```

For the tool-by-tool and file-by-file map, see the File Organization table in [`src/main/claude/CLAUDE.md`](../src/main/claude/CLAUDE.md).

**Chat Provider Abstraction**: the main chat runs on one provider per session — Claude (`ClaudeSdkSession`, streaming-input), Codex (`CodexChatSession`), or pi (`src/main/pi/PiChatSession.ts`). All implement `IChatSession` (`src/main/services/streaming/IChatSession.ts`); Codex and pi share `BaseTurnQueueChatSession`, while Claude steers mid-turn on its own base. Per-provider feature support is declared in `src/shared/providerCapabilities.ts` (`PROVIDER_CAPABILITIES`) and readiness is resolved via `src/shared/providerResolution.ts`. `ChatProvider = 'claude' | 'codex' | 'pi'` is defined in `src/shared/types.ts`. `StreamingSessionService.createSession` dispatches to the backend.

**System Prompt Organization**: prompt modules live in `src/main/chat/prompts/` with `buildSystemPrompt()` / `buildFocusSystemPrompt()` as entry points — see [`src/main/claude/CLAUDE.md`](../src/main/claude/CLAUDE.md).

**Shared Prompt Defaults** (`src/shared/taskPromptDefaults.ts`):
- Default task prompt template used by both prompt construction and persistence fallbacks

**Streaming Sessions:**
- Session key is `chat:{projectId}:{chatSessionId}` — multiple concurrent chat sessions per project, up to `session.maxConcurrentSessionsPerProject` from `getConfig()`. See `src/main/claude/CLAUDE.md` for session-type/scope details.
- Connects on project open (zero-latency first message)
- Auto-reconnects after 30min idle timeout
- Full conversation history via SDK resume
- Tool proposal events (`plan-actions`, `pending-implementation`) are scoped by origin `projectId` + `chatSessionId` before renderer delivery to avoid cross-session duplication

**Plan-item Dev Sessions:**
- Launched from the board view by selecting a plan item and starting agent execution
- Multiple isolated implementation/review agent subprocesses
- Each runs in a separate git worktree
- User approval required before starting
- Automatic opposing-agent review can run after implementation completion and feed findings back into the implementation session before the plan item moves to `in_review`

## Plan References (`@plan/<uuid>`)

Markdown surfaces (descriptions, intents, acceptance criteria, chat, documents) can carry `@plan/<uuid>` tokens that resolve to a `PlanItem`.

**Token shape:** `@plan/<uuid>` — pure structural primitive parsed in `src/shared/planRefs.ts`.

**Layers:**
- **Authoring:** Monaco editor (`planRefMonaco.tsx`) folds UUIDs to readable titles and surfaces unresolved-ref diagnostics. Markdown render path (`src/renderer/utils/markdown.tsx`) swaps refs for `PlanRefChip` (`src/renderer/components/plan-ref/PlanRefChip.tsx`).
- **Agent context:** `formatPlanRefSection` (`src/main/claude/contextRefs.ts`) expands refs into agent prompts so agents see resolved title/status/etc. without a tool call. `DevSessionService.buildPlanRefSection` prepends a `<plan-refs>` block to board agent launch prompts.
- **Tools:** `plan-refs.ts` exposes `extract_plan_items_from_doc` so Claude can lift refs out of a project file by path.
- **Validation:** `PlanActionService` rejects `create_item` / `update_item` actions whose text contains unresolved refs.
- **Export boundary:** `toExternalMarkdown` (`src/main/documents/exportBoundary.ts`) rewrites refs to native syntax at every external export — Jira/Linear (`ExportService`, before the codec converts markdown), Confluence (`ConfluenceSyncService`), GitHub (`GitHubService`). Its branded `ExternalMarkdown` return type is what tracker write payloads require, so an unresolved description is a compile error. Refs never leak to external trackers.

See `src/renderer/CLAUDE.md` for z-index hierarchy and renderer conventions.
