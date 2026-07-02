# Services Layer

Business logic layer with dependency injection. Services accept dependencies via factory functions, return `ServiceResult<T>` for explicit error handling, and delegate to repositories for data access.

## Key Patterns

**Factory Pattern with DI:** Services are created via factory functions that accept dependencies. See `PlanService.ts` for the canonical example.

**ServiceResult Pattern:** All service methods return `ServiceResult<T>` (`{ ok: true; data: T } | { ok: false; error: string }`). Use `success()` / `failure()` from `result.ts`. In IPC handlers, use `unwrapOrThrow()` for data-returning handlers or `toIpcResponse()` for void/action handlers.

**Async:** Use `AsyncResult<T>` and `wrapAsync()` from `result.ts` for async operations.

## Service Categories

### Core Services (`services/core/`)

Plan items, projects, attachments, tracker connections, and groups—the domain model.

- `PlanService` — Modify plan items, manage relations
- `AttachmentService` — Upload files, track metadata
- `SearchService` — Global search across plan items and documents
- `PromptOverrideService` — Manage prompt overrides for board implementation/review prompts (the previous "agent-team" subsystem was removed; this is the surviving customization path)
- `PollScheduler` — Single shared interval timer driving background polling. Services register tasks (`register({ id, intervalMs, handler })`) instead of holding their own `setInterval`. Used by `ReviewPollService` (PR review polling), `StreamingSessionService` (chat session cleanup ticks, wired through `ChatRuntimeService`), and `ScheduledLoopRunnerService` (drives each enabled scheduled loop on its own interval); `AppLifecycleService` holds it only to call `stopAll()` on shutdown. (`RepoWatcherService`/`ProjectWatcherService` use fs/file watching, and `SearchService` uses its own `setInterval` — they do not register with the scheduler.) Lives in `appServices.ts` wiring.
- `ScheduledLoopService` — CRUD + run-history access for scheduled loops (freeform prompts on an interval, managed from the Command+K palette). Pure business logic over the repositories; the live scheduler hooks are injected by `ScheduledLoopRunnerService` so CRUD mutations take effect immediately without depending on the runner's execution machinery.
- `ChatService` / `ChatRuntimeService` — Chat session CRUD, message persistence, and per-session Claude Agent SDK runtime wiring (MCP server, permissions, plan-action callbacks) for main project chat.
- `ProjectService` — Project CRUD, phase transitions, folder resolution
- `SettingsService` — App-level settings (Anthropic auth key presence, misc app_settings reads/writes)
- `PermissionService` — Loads persisted tool permissions into the in-memory client cache on project open
- `PermissionPromptService` — Bridges a pending tool-permission request to the renderer and back (prompt/resolve/timeout)
- `ClaudeUsageService` — Centralized recording of Claude SDK token/cost usage across every call site (chat, board agents, briefing, PR description, commit message, review assessment, custom prompt generation, onboarding, Slack triage) into `claude_usage_events` and the rolled-up `projects.session_*_tokens` columns
- `ArtifactService` — List/read files written by Claude to a project's `outputs/` folder
- `CustomPromptService` / `CustomPromptGenerationService` — Command+K custom prompt CRUD and execution (Claude Opus with extended thinking and access to KPM MCP tools; output saved to `outputs/`)
- `TaskPromptTemplateService` — CRUD for reusable task prompt templates
- `SlashCommandService` — Discovers user slash commands (`~/.claude/commands/**/*.md`) and skills (`~/.claude/skills/*/SKILL.md`) for the chat typeahead before a session exists; once a session is live the SDK's own command list takes over
- `McpDiscoveryService` — Discovers installed Claude Code plugins with MCP server configs and reads `app_settings` for which servers are enabled for KPM. Does not manage MCP server processes — the SDK does
- `CustomThemeService` — Import/manage custom editor themes (VS Code `.vsix` or marketplace theme JSON)
- `ExportFacadeService` — Export queue access over `ExportService`/`TypeMappingService` for pushing plan items to trackers
- `OnboardingFacadeService` — Thin wrapper starting `OnboardingService` generation and persisting results onto the project
- `AppLifecycleService` — App startup/shutdown coordination
- `NotificationService` — System notifications via Electron
- `UpdateEventBus` — Cross-service update broadcast helper
- `BriefingService` — Two-stage project briefing pipeline: Stage 1 gathers SQL context and synthesizes chat history with `fastModel`; Stage 2 produces the final briefing with `deepModel` (both default to sonnet; configured via `getConfig().generation`)
- `TrackerService` — Tracker credential management, connection/scope/association CRUD, Jira API queries (issue search, labels, components, statuses, custom fields), import preview generation, and sync coordination. Wraps `TrackerClientService` + domain `ImportService`/`SyncService`.
- `GroupService` — Group CRUD (create, update, delete, position, size) and item assignment. Delegates to `GroupAssignmentService` for assignment rule enforcement.
- `ContextFileService` — Read/write project context files (AGENTS.md/CLAUDE.md) and `buildContextPrefix(projectId, contextPaths)` — wraps attached context files in `<context-file>` blocks for prepending to agent prompts (injected into `DevSessionService.buildAgentContext` via `appServices.ts` wiring).
- `slackTriageAdapter.ts` — Pure composition helper (no state). Owns Slack MCP block/JSON parsing, the Claude SDK adapter session, and plan-item mutation callbacks. `appServices.ts` calls `createSlackTriageAdapter()` and passes the returned deps straight into `createSlackTriageService()` — keeps `appServices.ts` focused on wiring.

### Repo Services (`services/repo/`)

Git repositories, worktrees, development sessions, environment capture.

- `RepoService` — Add/remove repos, watch for changes
- `WorktreeService` — Manage git worktrees
- `DevSessionService` — Board/dev session lifecycle (create, start, resume, destroy). Owns `buildAgentContext(input: AgentContextInput)` (exported for tests; input carries `item`, `project`, `children`, `parent`) which renders the implementation prompt with `## Intent`, `## Acceptance Criteria`, and `## Context`/`## Description` sections; falls back gracefully when spec fields are absent. Worktree scaffolding is extracted into `_scaffoldWorktree` so the board entrypoint has consistent error semantics (`checkedOutInMainRepo` / `checkedOutElsewhere` / `createFailed`).
- `RepoWatcherService` — Watch git branch changes (fs.watch on .git/HEAD)
- `EnvironmentService` — Capture environment from direnv/Nix for dev sessions
- `GitHubService` — PR description generation, PR creation, PR template enforcement, diff/commit log helpers
- `ReviewService` — GitHub PR review thread CRUD (fetch threads, post replies, resolve)
- `ReviewAssessmentService` — SDK-backed multi-turn assessment agent that classifies PR review threads and drafts replies (uses the standalone MCP server in `claude/tools/review-assessment.ts`)
- `ReviewPollService` — Polls linked PRs (registered with `PollScheduler`), triggers assessments, broadcasts `review-poll:actionable` events that drive the board orange-dot indicator
- `ScheduledLoopRunnerService` — Drives each enabled scheduled loop on the shared `PollScheduler`, one registration per loop

### Agent Services (`services/agents/`)

Board agent session execution (implementation + opposing review). See [`services/agents/CLAUDE.md`](agents/CLAUDE.md) for the board workflow this drives.

- `AgentSessionManager` — Tracks live agent sessions, dispatches to the right session type
- `BoardAgentOrchestrator` — Runs implementation → opposing review → auto-fix → `In Review` transition
- `ClaudeSdkSession` / `CodexSdkAgentSession` / `CliAgentSession` — Agent-specific session implementations over `BaseAgentSession`

### File Services (`services/files/`)

Project file system operations, repo file access.

- `FileExplorerService` — List, create, delete files (with path traversal protection)
- `RepoFileService` — Read/write files in connected repositories (markdown/text editable, code read-only)
- `TempImageService` — Handle temporary images
- `FileWatchService` — File change watching
- `ProjectWatcherService` — Watch project directory for changes

### Streaming Services (`services/streaming/`)

Terminal/PTY and Claude session management.

- `TerminalService` — Create/manage pseudo-terminals (singleton)
- `StreamingSessionService` — Main chat session lifecycle

### Generation Services (`services/generation/`)

- `CustomPromptGenerationService` — Custom prompt generation
- `OnboardingService` — AGENTS.md context generation (repo scan + Claude synthesis)

### Confluence Services (`services/confluence/`)

Confluence wiki integration.

- `ConfluenceSyncService` — Bidirectional sync between KPM documents and Confluence pages

### Tool Log Services (`services/toollog/`)

Tool call logging and analysis.

- `ToolCallLogger` — Log and track Claude tool calls
- `extractFilePaths` — Extract file paths from tool call data

### Performance (`services/PerfLogger.ts`)

- `PerfLogger` — Optional performance logging (enabled via `KPM_PERF=1`)

## Wiring

- **Composition Root:** `appServices.ts` wires all services with dependencies
- **Service Container:** `container.ts` provides global access via `getServices()`. In tests, use `setServices()` / `resetServices()` to inject mocks.
- **Testing:** Mock repositories via DI. See existing test files for patterns.

## When to Use Services vs Direct Repository Calls

### Use a Service when:
- Logic involves multiple entities
- Business rules must be enforced
- Result needs explicit error handling
- Code is called from multiple IPC handlers

### Use a Repository directly when:
- Inside a service (services delegate to repos)
- In domain services for multi-table transactions

**Rule:** If IPC handlers call it, make it a service.

## Anti-Patterns to Avoid

**Don't:**
- Import repositories directly in IPC handlers
- Throw exceptions from services (use `ServiceResult`)
- Use global service instances (use factory + DI)
- Duplicate business logic across services

**Do:**
- Pass dependencies explicitly
- Return `ServiceResult<T>` from all service methods
- Test services with mocks
- Let services coordinate multiple repositories
