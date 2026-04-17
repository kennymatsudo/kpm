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
- `TrackerService` — Tracker credential management, connection/scope/association CRUD, Jira API queries (issue search, labels, components, statuses, custom fields), import preview generation, and sync coordination. Wraps `TrackerClientService` + domain `ImportService`/`SyncService`.
- `GroupService` — Group CRUD (create, update, delete, position, size) and item assignment. Delegates to `GroupAssignmentService` for assignment rule enforcement.
- `slackTriageAdapter.ts` — Pure composition helper (no state). Owns Slack MCP block/JSON parsing, the Claude SDK adapter session, and plan-item mutation callbacks. `appServices.ts` calls `createSlackTriageAdapter()` and passes the returned deps straight into `createSlackTriageService()` — keeps `appServices.ts` focused on wiring.

### Repo Services (`services/repo/`)

Git repositories, worktrees, development sessions, environment capture.

- `RepoService` — Add/remove repos, watch for changes
- `WorktreeService` — Manage git worktrees
- `RepoWatcherService` — Watch git branch changes (fs.watch on .git/HEAD)
- `EnvironmentService` — Capture environment from direnv/Nix for dev sessions

### File Services (`services/files/`)

Project file system operations, repo file access.

- `FileExplorerService` — List, create, delete files (with path traversal protection)
- `RepoFileService` — Read/write files in connected repositories (markdown/text editable, code read-only)
- `TempImageService` — Handle temporary images
- `FileWatchService` — File change watching
- `ProjectWatcherService` — Watch project directory for changes

### Streaming Services (`services/streaming/`)

Terminal/PTY and Claude session management.

- `StreamingSessionService` — Main chat session lifecycle

### Generation Services (`services/generation/`)

- `CustomPromptGenerationService` — Custom prompt generation

### Confluence Services (`services/confluence/`)

Confluence wiki integration.


### Tool Log Services (`services/toollog/`)

Tool call logging and analysis.

- `ToolCallLogger` — Log and track Claude tool calls
- `extractFilePaths` — Extract file paths from tool call data

### Performance (`services/PerfLogger.ts`)


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
