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
