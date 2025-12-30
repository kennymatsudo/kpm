# Services Layer






## Service Categories

### Core Services (`services/core/`)

Plan items, projects, attachments, tracker connections, and groups—the domain model.

- `PlanService` — Modify plan items, manage relations
- `AttachmentService` — Upload files, track metadata
- `SearchService` — Global search across plan items and documents

### Repo Services (`services/repo/`)


- `RepoService` — Add/remove repos, watch for changes
- `WorktreeService` — Manage git worktrees

### File Services (`services/files/`)


- `FileExplorerService` — List, create, delete files (with path traversal protection)

### Streaming Services (`services/streaming/`)



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
