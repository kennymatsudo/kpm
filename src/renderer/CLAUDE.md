



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

## CSS Conventions

- Use Tailwind utilities
- CSS custom properties defined in `index.css` for theme tokens
- Existing `.btn`, `.btn-primary`, `.dropdown-item` classes for consistent styling
