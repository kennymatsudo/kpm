# Renderer

React 19 + TypeScript + Tailwind v4 + Zustand. Extract hooks not components. Use Zustand over Context for fine-grained subscriptions.

## Component Organization

Components organized by feature in `components/`. Key directories: `app/` (app-shell providers/boundaries), `layout/`, `planning/`, `board-view/`, `chat/`, `workspace/`, `development/` (shared PR/review components used by the board), `tracker/`, `plan-ref/`, `keyboard-shortcuts/`, `sidebar/`, `command-palette/`, `ui/` (shared primitives). Browse the directory for the full list.

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

- **Canvas constants** in `constants/layout.ts` — card widths, grid spacing, zoom limits
- **Stores** — See `stores/CLAUDE.md` for patterns. Use `useShallow` for multi-value selectors. Stores communicate via typed events.

## CSS Conventions

- Use Tailwind utilities
- CSS custom properties defined in `index.css` for theme tokens
- Existing `.btn`, `.btn-primary`, `.dropdown-item` classes for consistent styling

## Plan Card Layout & Height Sync

**When changing PlanCard layout, you MUST update height calculations in `utils/planHierarchy.ts`.**

The canvas uses masonry layout to position cards absolutely. Each card's Y position = previous card bottom + `VERTICAL_GAP`. Card heights are **calculated, not measured** — if the calculation doesn't match the rendered CSS, gaps will be uneven (overestimate = extra gap, underestimate = overlap).

Three files must stay in sync:

| File | What it controls |
|------|-----------------|
| `components/planning/PlanCard.tsx` | Card DOM structure, Tailwind classes, spacing between rows |
| `utils/planHierarchy.ts` | `calculateCardHeight` + `buildHeightMapFromTree` — pixel height estimates used by masonry layout |
| `constants/planCardStyles.ts` | Depth-based padding (`p-2`, `p-2`, `p-1.5`), title size, bg |

**How to calculate heights from Tailwind classes:**

Tailwind v4 text utilities set `font-size` only (not `line-height`). Line-height is inherited from `body { line-height: 1.5 }`.

```
text-xs  = 12px font × 1.5 = 18px line-height
text-[10px] = 10px × 1.5 = 15px line-height
```

For spacing utilities: `mt-1` = 4px, `mt-1.5` = 6px, `mt-2` = 8px, `gap-1.5` = 6px, `space-y-2` = 8px.

For padding utilities: `p-2` = 8px each side (16px total), `p-1.5` = 6px (12px total).


```
```

**Gap between cards in groups:** `GROUP_LAYOUT.VERTICAL_GAP` in `constants/layout.ts` (currently 16px). This is added on top of the calculated height. If the calculated height is wrong, the visual gap = `VERTICAL_GAP + (calculated - actual)`.
