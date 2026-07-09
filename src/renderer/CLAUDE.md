# Renderer

React 19 + TypeScript + Tailwind v4 + Zustand. Extract hooks not components. Use Zustand over Context for fine-grained subscriptions.

## Component Organization

Components organized by feature in `components/`. Key directories: `app/` (app-shell providers/boundaries), `layout/`, `planning/`, `board-view/`, `chat/`, `workspace/`, `welcome/` (no-project landing pane), `development/` (shared PR/review components used by the board), `tracker/`, `plan-ref/`, `keyboard-shortcuts/`, `sidebar/`, `command-palette/`, `ui/` (shared primitives). Browse the directory for the full list.

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
- **Planning hooks** in `components/planning/hooks/` — the logic behind `Canvas.tsx` lives in hooks exported from `components/planning/hooks/index.ts`. Key ones: `useCanvasViewport` (pan/zoom), `useCanvasWheel` (scroll handling), `useCanvasHierarchy` (tree + height + group layout derivation), `useCanvasAutoLayoutTrigger` (runs auto-layout once when new items lack positions), `useCanvasDragHandlers` (drag-start/over/end logic), `useVisibleCanvasItems` (viewport culling). Extract new canvas concerns into hooks here rather than growing `Canvas.tsx`.
- **Chat** — `Chat` component receives `currentView?: 'plan' | 'workspace'` prop. Chat history shared across views via `useChatStore` (`stores/chat/`).
- **Canvas constants** in `constants/layout.ts` — card widths, grid spacing, zoom limits
- **Stores** — See `stores/CLAUDE.md` for patterns. Use `useShallow` for multi-value selectors. Stores communicate via typed events.
- **Default views** — Main view defaults to `'workspace'`; planning view mode defaults to `'board'` (Board view). Both are persisted via `usePersistedViewState`.
- **WorkspaceHome** — `components/workspace/WorkspaceHome.tsx` is the landing screen shown inside the workspace view when no chat is active. Displays project context and quick-start prompts, plus a dismissible nudge (persisted per-project in localStorage) offering to generate the project's AGENTS.md context file via `RegenerateContextModal` when one is missing or still the placeholder.

## CSS Conventions

- Use Tailwind utilities
- **Theme color tokens are projected in JS, not declared in CSS.** `src/shared/theme.ts` is the single source of palettes + `generateThemeVariables`; `themeBoot.ts` writes the CSS custom properties onto `document.documentElement` synchronously before React mounts, and `ThemeContext` re-applies them on change. `index.css` holds only theme-independent tokens (`--titlebar-height`, `--chat-measure`, etc.), a crash-safety background, and the `@theme` utility aliases — no hardcoded theme hex values. To change a theme color, edit `src/shared/theme.ts` (see the root CLAUDE.md "Change a theme token" recipe).
- Existing `.btn`, `.btn-primary`, `.dropdown-item` classes for consistent styling

## Plan Item Spec Fields in UI

Spec fields (`intent`, `acceptance_criteria`) surface in one place today:

| Site | Mode | What it shows |
|------|------|---------------|
| `components/planning/TaskEditModal.tsx` | **Editable** | "Spec" section between Description and Type/Status: `intent` textarea + `acceptance_criteria` editable checklist with Add/Remove affordances. Always rendered so legacy items can adopt specs. |

**Board `components/board-view/BoardCard.tsx` and canvas `components/planning/PlanCard.tsx` are intentionally NOT wired.** Card faces stay clean; users open the modal to view or edit specs. Surfacing spec fields on canvas cards would also require extending the card box model in `constants/planCardStyles.ts` — see the next section.

**`source_document_id` is unwired in the renderer** — the field is on `PlanItem` and is populated by the `modify_plan` Claude tool (`src/main/kpmTools/tools/plan-changes.ts`) as an iteration-doc breadcrumb, but no UI here reads or displays it. Do not surface it without a clear use case; see `src/main/claude/CLAUDE.md` for the write side.

**Conventions:**
- **Editable section is always rendered in the modal.** The Spec block is how users discover and author specs — hiding it would bury the affordance.
- **Sanitize on save, not on edit.** Keep the user's in-progress empty rows while typing; trim + drop empties + cap at the Zod limits (`MAX_CRITERIA = 50`, `CRITERION_MAX_CHARS = 1000`, `INTENT_MAX_CHARS = 500`) only when building the save payload. The caps are owned by `PLAN_ITEM_FIELDS` in `src/shared/planItemFields.ts`; `TaskEditModal` mirrors them as local consts.
- **Save via `onSave` widening, not a side-channel.** `TaskEditModal.onSave` accepts optional `intent` and `acceptance_criteria`; `usePlanTaskEdit.handleSaveTask` passes them through to the existing `updatePlanItem` IPC path. The backing `planItemUpdates` Zod schema already accepts these fields — no service-layer changes needed when extending this pattern.
- **`status_category` is not edited from `TaskEditModal`.** Column placement is handled by the board (drag-between-columns) and tracker sync — surfacing a Status select in the modal would let users override the tracker silently, which conflicts with treating the tracker as source of truth. Drag on the board if you need to move a card.
- **New spec fields go through the modal first.** If a new spec-like field is added, wire it into the `TaskEditModal` Spec section before deciding whether it earns card-face surfacing.

## Plan Card Layout & Height Sync

Card heights are **calculated, not measured**: the canvas positions cards with masonry layout, where each card's Y = previous card bottom + `VERTICAL_GAP`. `constants/planCardStyles.ts` owns the box model (`CARD_BOX_MODEL`, `depthStyles`, `paddingPxForDepth`, `titleLineHeightPxForDepth`) as the single source of truth for both the rendered DOM and the height math.

- `components/planning/PlanCard.tsx` and `PlanCardSections.tsx` read spacing classes off `CARD_BOX_MODEL` (e.g. `CARD_BOX_MODEL.description.marginTop.className`) rather than hardcoding Tailwind classes.
- `utils/planHierarchy.ts` (`calculateCardHeight`, `buildHeightMapFromTree`) reads the same spec's `px` values through one shared per-card formula.

Because both sides read the same object, there's nothing left to hand-sync — change a value in `planCardStyles.ts` and both the DOM and the height estimate move together. `constants/planCardStyles.test.ts` asserts the spec's `px` fields match the Tailwind scale for the classes in use.

**Gap between cards in groups:** `GROUP_LAYOUT.VERTICAL_GAP` in `constants/layout.ts` (currently 16px), added on top of the calculated height.

## Z-Index Layers

Use the `Z_INDEX` scale in `constants/zIndex.ts`, not raw Tailwind arbitrary values — most components already do. Low to high: `canvas` → `panel` → `dropdown` → `taskIndicator` → `palette` → `modal` → `toast`. Within a layer, offset in small increments (e.g. `Z_INDEX.dropdown + 10` for submenus).
