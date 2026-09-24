# Renderer

React 19 + TypeScript + Tailwind v4 + Zustand. State patterns live in [`stores/CLAUDE.md`](stores/CLAUDE.md).

## How it is organized

- `components/<feature>/` — one directory per feature area (`board-view/`, `chat/`, `workspace/`, `settings/`, `tracker/`, ...). Feature-local hooks sit beside the components (`layout/hooks/`, `planning/hooks/`, `sidebar-tree/hooks/`, `board-view/use*.ts`). `components/ui/` holds shared primitives (`Modal`, `Popover`, `Select`, `DropdownMenu`, `Tooltip`, `Toast`, lazy Monaco and Mermaid wrappers). Browse the tree; don't trust a list here.
- `hooks/` — app-wide hooks: IPC bridges and sync hooks (`useChatIpcBridge`, `usePermissionIpcBridge`, `useDevSessionsSync`, ...), `useProjectLoader`, `useChat`.
- `services/` — the only place that may touch `window.api` (enforced by the `no-restricted-properties` lint rule). Each file is a thin typed forward to the preload bridge.
- `stores/` — Zustand stores and cross-store events.
- `constants/` — `zIndex.ts`, `layout.ts` (resizable panel sizes), `statusConfig.ts`.
- `utils/markdown.tsx` — shared markdown-to-jsx options.
- `themeBoot.ts`, `themes/`, `contexts/ThemeContext.tsx` — theme application.

The main view is `'workspace'` or `'planning'`, persisted per project by `components/layout/hooks/usePersistedViewState.ts` (default `'workspace'`). The planning view has one renderer, the board (`components/board-view/`), mounted by `components/planning/index.tsx`, which owns the shared modals, context menu, and selection. There is no view switcher to extend.

## Recipes

**Add a component to a feature area.** Put it in that feature's directory. When logic grows, extract a hook next to it rather than a wrapper or provider component; `components/planning/index.tsx` keeps its logic in `planning/hooks/` for this reason. Split files only when the pieces are genuinely independent, and wait for three real uses before abstracting.

**Call a new IPC endpoint.** Add the endpoint to `src/shared/ipc/{domain}Endpoints.ts` and the handler in main (see `src/main/ipc/CLAUDE.md`), expose it in `src/preload/api.ts` via `deriveDomainApi`, then add a function to `services/{domain}Service.ts` that forwards the payload object to `window.api.{domain}.*`. Stores and components import the service function, never `window.api`.

**Subscribe to a main-to-renderer event.** Register the listener in a hook mounted by `Layout.tsx` or `App.tsx` (see the existing `*IpcBridge` and `*Sync` hooks), not inside the feature component. A listener inside a component that unmounts when the user switches views silently drops events; that is the bug `useChatIpcBridge` was created to fix.

**Add a setting.**
1. Add a typed definition to `SETTINGS` in `src/shared/settingsRegistry.ts` (key, default, codec).
2. Read and write it with `getSetting` / `setSetting` from `services/settingsService.ts`. No per-key IPC endpoint is needed.
3. Hold it in a store (general settings live in `stores/generalSettingsStore.ts`) and render the control in the matching `components/settings/*Settings.tsx`, usually inside a `SettingsSection`.
4. A new Settings tab needs a `SettingsTab` member in `stores/settingsUIStore.ts` and an entry in `SETTINGS_TABS` in `components/settings/settingsTabs.tsx`, which is the single owner of tab order, nav, and padding.

**Add an icon.** Create `components/icons/<Name>Icon.tsx` following the existing shape (`className = 'w-4 h-4'` default, `stroke="currentColor"`, `aria-hidden="true"`, 24x24 viewBox) and export it from `components/icons/index.ts`.

**Use theme colors.** Use the semantic Tailwind utilities (`bg-surface-1`, `text-text-secondary`, `border-border-subtle`, `text-danger`, `bg-depth-2`, ...). Never hardcode a hex value. `src/shared/theme.ts` owns every palette and `generateThemeVariables`; `themeBoot.ts` writes the CSS variables onto `document.documentElement` before React mounts and `ThemeContext` re-applies them on change. To change a color, edit `theme.ts` (root `CLAUDE.md`, "Change a theme token"). A brand-new token also needs an alias in the `@theme` block of `index.css` so Tailwind can generate its utility. `index.css` otherwise holds only theme-independent tokens (type scale, radii, `--titlebar-height`, `--doc-measure`) and shared classes (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.dropdown-item`).

**Render markdown.** Use markdown-to-jsx with an options object from `utils/markdown.tsx` (`markdownOptions`, `growingBlockMarkdownOptions`, `githubMarkdownOptions`, the focus and search-highlight builders). Don't build options inline. They all set `forceBlock: true`, because without it a single paragraph renders as a bare text node with no `<p>` and no prose spacing (streamed chat looked unformatted until its last block arrived). They also set `disableParsingRawHTML: true`, so JSX in a code sample is not turned into a real element; only the GitHub options turn it back on. The still-streaming block uses `growingBlockMarkdownOptions`, which keeps an unfinished mermaid fence as plain code.

## Invariants and gotchas

- **No emojis in the UI.** Use SVG icons from `components/icons/`.
- **No self-referential UI text.** Labels say what a control does, not how it works or what it contains.
- **Zustand for app state, not React Context.** Context re-renders every consumer. The few contexts that exist are narrow and rarely change (`ThemeContext`, `ModalLayerContext`, the tooltip provider).
- **Selectors must return stable values** or the screen crashes with "Maximum update depth exceeded". See [`stores/CLAUDE.md`](stores/CLAUDE.md).
- **Z-index comes from `Z_INDEX` in `constants/zIndex.ts`**, low to high: `resizeHandle` (10), `panel` (100), `dropdown` (200), `taskIndicator` (300), `palette` (400), `modal` (500), `toast` (600). Offset by small steps within a layer. `Modal` publishes its z-index through `ModalLayerContext`; `Popover` and `Select` read `useModalLayer() + 10`, so anything floating inside a modal should do the same rather than use `Z_INDEX.dropdown`, which renders behind the modal.
- **Open documents are a list.** `workspaceStore` holds `openDocuments` + `activeDocumentId`. `WorkspaceView` renders `FileEditor` with `key={activeDocumentId}` because the markdown editor keeps a live Monaco model and reusing it leaks undo history between tabs. `useDocumentAutosave` is mounted in `WorkspaceView`, above the editor; moving it into the editor makes background tabs stop saving. Subscribe to the active id or path, never the document object, or every keystroke re-renders the tree and the chat panel.
- **Plan item edits go through plan actions.** `usePlanTaskEdit` builds one atomic batch (`buildPlanTaskEditActions` in `planning/planItemFormActions.ts`: `revise_work_brief`, `set_repo_targets`, `update_item`) and sends it through `executePlanActions`. Trim and cap criteria at save time using the limits in `src/shared/planItemFields.ts`, not while the user types. `WorkBriefEditor` and `RepositoryScopeEditor` are the shared editors for create, edit, and approval details.
- **Status is set by dragging on the board.** `TaskEditModal` does not edit `status_category`, and the board cannot reparent; hierarchy changes come from chat tools. `BoardView` nests a child under its parent only when both share a column.
- **Card faces stay editor-free.** `BoardCard` shows one repo chip (the dev session's worktree repo, else `primary_repo_id`); Work Brief fields and affected repos stay in the modal.
- **`source_document_id` has no UI on purpose.** It is a breadcrumb written by the `modify_plan` tool. Don't surface it without a use case.

## Testing

- Vitest runs in a **node** environment (`vitest.config.mts`); there is no jsdom and no Testing Library. Test pure logic by extracting it into a `.ts` module beside the component (`chat/turnRenderPlan.ts`, `board-view/panelStatus.ts`). Test markup with `renderToStaticMarkup` from `react-dom/server` (see `chat/MessageList.test.tsx`).
- Tests are co-located (`*.test.ts(x)`). The repo-root `tests/` tree holds shared mocks such as `tests/mocks/electron-api.ts` (`createMockApi`) and a few store tests.
- Mock at the service boundary: `vi.mock('../services/<domain>Service', ...)`.
- E2E: Playwright specs in `e2e/`, run with `make test:e2e` (packages the app first) or `make test:e2e:dev` against an existing package.
