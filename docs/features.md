7. [Global Search & Navigation](#global-search--navigation) (50–52)
  - Services: `src/main/services/core/PlanService.ts`, `src/main/db/domain/PlanActionService.ts`, `src/main/db/domain/PlanItemService.ts`, `src/main/db/repositories/impl/PlanItemRepository.ts`
  - DB: `src/main/db/repositories/impl/PlanItemRepository.ts` (rowToPlanItem mapping)
  - DB: `src/main/db/repositories/impl/PlanRelationRepository.ts`
### 4. Plan Item Status Tracking (Status Categories: not_started, in_progress, in_review, done, blocked, canceled)
- **What it does:** Each plan item has a status within one of six categories. Canvas/tree/board views filter and organize by status. Status transitions trigger tracker sync queuing and event notifications to listeners.
  - DB: `src/main/db/repositories/impl/GroupRepository.ts`
  - Component: `src/renderer/components/layout/ApprovalOverlays.tsx` (modal for reviewing)
  - Store: `src/renderer/stores/project/uiSlice.ts` and `src/renderer/stores/projectDomains.ts` (focused resources list)
  - Component: `src/renderer/components/sidebar-tree/ReposAndFilesSection.tsx`, `src/renderer/components/sidebar-tree/RepoContextMenu.tsx`, `src/renderer/components/sidebar-tree/FileContextMenu.tsx`
## Agentic Task Execution (Board)
  - Store: `src/renderer/stores/devSessions/index.ts` (review state)
- **What it does:** Search across plan items, documents, and external tracker issues. Uses SQLite FTS5 virtual table for fast substring and phrase matching. Results ranked by relevance and entity type.
  - Database access: `SearchService` queries `global_search_index` and `global_search_fts` directly
  - Filters available: entity type (plan item, document), status, label
  - Store: `src/renderer/stores/project/uiSlice.ts` (focused resources)
  - Component: `src/renderer/components/sidebar-tree/RepoListSection.tsx` (branch info)
  - Repository: `src/main/db/repositories/impl/ConfluenceLinkRepository.ts`
### 61. General Settings (Account, Workflow, App Preferences)
  - Settings → Connections → MCP Servers
- **What it does:** Users can upload files (documents, images, etc.) and link them to plan items. Attachments stored in project folder or app cache.
  - Repository: `src/main/db/repositories/impl/AttachmentRepository.ts`
### 79. Shell Open/Reveal Operations
- **What it does:** Provides safe Electron shell operations for revealing files in Finder/Explorer, opening local paths with the default application, and opening validated external URLs in the browser.
  - URL safety: `src/main/security/externalUrl.ts`
  - File/repo context menus
  - Artifact/document open actions
  - PR and external-link buttons
  - Electron `shell`
  - External URL allow-list validation
- **Maturity signal:** Mature. Small, security-scoped platform integration.
- **Architecture:** Single queue for plan actions, document updates, implementation proposals, context file edits, and review replies. Items processed one at a time. Approval UI shows diffs and context. User can approve/reject. Rejected items don't execute.
  - Store: `src/renderer/stores/project/resourceSlice.ts` (repoBranches state)
  - UI: Branch badge in `src/renderer/components/sidebar-tree/RepoItem.tsx`
  - Storage: in-memory recent entries per chat session plus temp NDJSON log file
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

---

- `../ui/StatusSelector.tsx`: Dropdown for status changes
- `MergeQueuePanel.tsx`: Open-PR ordering with dependency-derived blockers
  - Features: 99 (Merge Queue)
- `ReviewTab.tsx`: Review thread list rendered in the board detail pane
- `ReviewReplyApprovalPanel.tsx`: Reply composition for review threads
- `LinkPrToItemDialog.tsx`: Link an existing PR to a plan item
- `GeneratePrContentModal.tsx`: View/copy AI-generated PR title and description
- `config/TrackerLinkProjectDialog.tsx`: Association/project link editor
- `RepoListSection.tsx`: Repository sources with branch info
- File/repo context menu focus actions: pinned files, folders, and repos for chat context
- `ReposAndFilesSection.tsx`, `ProjectFilesTreeSection.tsx`: Hierarchical repo/file tree
- `ThemesSettings.tsx`, `ThemeSelector.tsx`: Built-in and imported themes
  - Features: 96 (Custom Themes)
- `StorybookSettings.tsx`: Storybook URL and connection test
  - Features: 101 (Storybook Component Discovery)
- `PermissionPrompt.tsx`: Runtime permission prompt
- `index.tsx`: Full-size image viewer with zoom/pan
- `index.tsx`: Markdown editor for documents and context files
- **Early/Partial:** Some artifact types remain lighter-weight than the core planning/dev-session workflows.
- **Low:** Visual groups (8), notifications (74).
