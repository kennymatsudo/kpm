# Renderer

React 19 + TypeScript + Tailwind v4 + Zustand. Extract hooks not components. Use Zustand over Context for fine-grained subscriptions.

## Component Organization

Components organized by feature in `components/`. Key directories: `app/` (app-shell providers/boundaries), `layout/`, `planning/`, `board-view/`, `tree-view/`, `chat/`, `workspace/`, `welcome/` (no-project landing pane), `development/` (shared PR/review components used by the board), `tracker/`, `plan-ref/`, `keyboard-shortcuts/`, `sidebar/`, `command-palette/`, `ui/` (shared primitives). Browse the directory for the full list.

## Design Principles

### Extract Hooks, Not Components

When logic is complex, extract to a custom hook rather than a wrapper component.

```tsx
// GOOD: Extract logic to hook
function Layout() {
  const { sidebarWidth, handleResizeStart } = usePanelResize();
  // ...
}

// AVOID: Creating wrapper components for state
function SidebarResizeProvider({ children }) {
  // Adds render cycle, context overhead
}
```

### Zustand Over Context

React Context re-renders all consumers on any change. Zustand has fine-grained subscriptions.

```tsx
// AVOID: Context for frequently-changing state like panel widths
// GOOD: Keep using Zustand for app state
// GOOD: Use local state + hooks for component-specific concerns
```

### Colocation Over Organization

Keep related code together. Don't split files just to meet arbitrary LOC limits.

```tsx
// AVOID: Splitting every concern into 5+ files
// GOOD: Split only when there's genuine independence
```

### Three Uses Rule

Don't create abstractions until you have 3+ actual uses of a pattern. Wait until the pattern is proven.

## Key Conventions

- **Layout hooks** in `components/layout/hooks/` — `usePanelResize`, `useLayoutShortcuts`, `usePersistedViewState`, `useTrackerTopBarIntegration`
- **Planning hooks** in `components/planning/hooks/` — the logic behind `PlanView` (`components/planning/index.tsx`) lives in hooks exported from `components/planning/hooks/index.ts`: `usePlanItemSelection`, `usePlanContextMenu`, `usePlanTaskEdit`, `useCreateItemModal`, `useBulkActions`. Extract new plan-view concerns into hooks here rather than growing `index.tsx`.
- **Chat** — `Chat` component receives `currentView?: 'plan' | 'workspace'` prop. Chat history shared across views via `useChatStore` (`stores/chat/`).
- **Layout constants** in `constants/layout.ts` — `MAX_DEPTH` for plan nesting, and the resizable-panel size configs
- **Stores** — See `stores/CLAUDE.md` for patterns. Use `useShallow` for multi-value selectors. Stores communicate via typed events.
- **Default views** — Main view defaults to `'workspace'`; planning view mode defaults to `'board'`, with `'tree'` the only alternative. Both are persisted via `usePersistedViewState`.
- **Open documents are a list, not a field.** `workspaceStore` holds `openDocuments` + `activeDocumentId`; `DocumentTabStrip` renders them and `FileEditor` is keyed by document id, because the markdown editor keeps a live Monaco model and reusing one instance bleeds a file's undo history into the next tab. Autosave lives in `useDocumentAutosave`, mounted above the editor — put it back inside the editor and background tabs silently stop saving. Subscribe to the active *id* or *path*, never the document object, or typing re-renders the tree and the chat panel.
- **WorkspaceHome** — `components/workspace/WorkspaceHome.tsx` is the landing screen shown inside the workspace view when no chat is active. Displays project context and quick-start prompts, plus a dismissible nudge (persisted per-project in localStorage) offering to generate the project's AGENTS.md context file via `RegenerateContextModal` when one is missing or still the placeholder.

## CSS Conventions

- Use Tailwind utilities
- **Theme color tokens are projected in JS, not declared in CSS.** `src/shared/theme.ts` is the single source of palettes + `generateThemeVariables`; `themeBoot.ts` writes the CSS custom properties onto `document.documentElement` synchronously before React mounts, and `ThemeContext` re-applies them on change. `index.css` holds only theme-independent tokens (`--titlebar-height`, `--doc-measure`, `--chat-note-max`, etc.), a crash-safety background, and the `@theme` utility aliases — no hardcoded theme hex values. To change a theme color, edit `src/shared/theme.ts` (see the root CLAUDE.md "Change a theme token" recipe).
- Existing `.btn`, `.btn-primary`, `.dropdown-item` classes for consistent styling

## Work Brief and Repository Scope in UI

`WorkBriefEditor` owns the controlled Intent, Description, and Acceptance Criteria controls. `RepositoryScopeEditor` owns the controlled primary/affected connected-repo controls. The full create modal, task edit modal, and applicable approval details reuse these editors; title stays with each modal so quick create remains title-only.

**Card faces are editor-free; only the primary repo shows.** `components/board-view/BoardCard.tsx` renders one repo chip in its metadata row: the worktree's repo when a dev session has one, otherwise the item's `primary_repo_id` resolved through `connectedRepoName`. Affected repos, Intent, Description, and Acceptance Criteria stay off the card face — users open the modal to view or edit them.

**`source_document_id` is unwired in the renderer** — the field is on `PlanItem` and is populated by the `modify_plan` Claude tool (`src/main/kpmTools/tools/plan-changes.ts`) as an iteration-doc breadcrumb, but no UI here reads or displays it. Do not surface it without a clear use case; see `src/main/claude/CLAUDE.md` for the write side.

**Conventions:**
- **Editable sections are always rendered in expanded create and edit modals.** This lets legacy items adopt a complete Work Brief and Repository Scope.
- **Sanitize on save, not on edit.** Keep in-progress empty criterion rows while typing; trim, drop empties, and cap at the limits owned by `PLAN_ITEM_FIELDS` in `src/shared/planItemFields.ts` when building the save payload.
- **Work Brief edits are revision guarded.** `usePlanTaskEdit` sends one atomic action batch through `executePlanActions`: `revise_work_brief` for semantic Work Brief changes, `set_repo_targets` for scope changes, and `update_item` for generic operational fields.
- **`status_category` is not edited from `TaskEditModal`.** Column placement is handled by the board and tracker sync. Drag on the board to move a card.
- **Work Brief reconciliation is automatic.** Start and detail surfaces do not ask users to compare revisions. Reused sessions keep their worktree while the main process refreshes execution context to the latest approved Work Brief.

## Plan Views

Two renderers over the same `plan_items`, switched by `components/planning/ViewSwitcher.tsx` and dispatched in `components/planning/index.tsx`:

- **Board** (`components/board-view/`) — kanban columns fixed to the status categories, drag between columns to change status, and the detail pane for a card's dev session. Cards size themselves to the column; there is no layout math to keep in sync.
- **Tree** (`components/tree-view/`) — the outline. Rows expose `role="treeitem"` with the item title as their accessible name, and hold the only click-to-set status control in the app (`ui/StatusSelector`).

Both read `TreeNode` / `buildHierarchyTree` from `utils/planHierarchy.ts`, which does tree building only — no geometry.

## Z-Index Layers

Use the `Z_INDEX` scale in `constants/zIndex.ts`, not raw Tailwind arbitrary values — most components already do. Low to high: `resizeHandle` → `panel` → `dropdown` → `taskIndicator` → `palette` → `modal` → `toast`. Within a layer, offset in small increments (e.g. `Z_INDEX.dropdown + 10` for submenus).
