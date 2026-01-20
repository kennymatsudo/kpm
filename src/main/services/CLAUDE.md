# Services Layer

Business logic layer with dependency injection. Services accept dependencies via factory functions, return `ServiceResult<T>` for explicit error handling, and delegate to repositories for data access.





## Service Categories

### Core Services (`services/core/`)

Plan items, projects, attachments, tracker connections, and groups—the domain model.

- `PlanService` — Modify plan items, manage relations
- `AttachmentService` — Upload files, track metadata
- `SearchService` — Global search across plan items and documents

### Repo Services (`services/repo/`)


- `RepoService` — Add/remove repos, watch for changes
- `WorktreeService` — Manage git worktrees
- `RepoWatcherService` — Watch git branch changes (fs.watch on .git/HEAD)

### File Services (`services/files/`)

Project file system operations, repo file access.

- `FileExplorerService` — List, create, delete files (with path traversal protection)
- `RepoFileService` — Read/write files in connected repositories (markdown/text editable, code read-only)
- `TempImageService` — Handle temporary images
- `FileWatchService` — File change watching

### Streaming Services (`services/streaming/`)

Terminal/PTY and Claude session management.

- `StreamingSessionService` — Main chat session lifecycle

### Generation Services (`services/generation/`)









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
