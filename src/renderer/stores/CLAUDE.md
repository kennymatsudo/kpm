# Zustand Stores

UI state management with slice pattern, typed events for cross-store communication, and dependency injection for testing.

## Store Organization

- **`projectStore.ts`** — Main store factory (sliced into `project/` subdirectory: projectSlice, planSlice, resourceSlice, uiSlice)

All stores exported from `index.ts`. See the directory for the full list.

## Slice Pattern (Large Stores)

Slices are factory functions returning partial state + actions:

```typescript
// types.ts
export interface MySlice {
  myValue: string;
  myAction: (newValue: string) => void;
}

export type SliceCreator<TSlice> = (deps: ProjectStoreDependencies) =>
  StateCreator<ProjectState, [], [], TSlice>;

// mySlice.ts
export const createMySlice: SliceCreator<MySlice> = (deps) => (set, get) => ({
  myValue: 'initial',
  myAction: (newValue) => set({ myValue: newValue }),
});

// projectStore.ts - Combine slices
export const createProjectStore = (deps?: ProjectStoreDependencies) => {
  return create<ProjectState>((set, get, store) => ({
    ...createBaseState(),
    ...createMySlice(deps)(set, get, store),
  }));
};
```

## Standalone Stores

Simpler domains use `create()` directly. See `briefingStore.ts` or `searchStore.ts` for a typical example.

## Chat Store (Unified Sessions)


## Cross-Store Communication

1. Define event types in `storeEvents.ts`
2. Emit from store actions: `deps.emit({ type: 'status-changed', payload })`
3. Listen in `useStoreSubscriptions.ts`

## Key Patterns

- **Dependency Injection:** Stores receive `ProjectStoreDependencies` (api, emit) via factory functions for testability
- **Optimistic Updates:** Update UI immediately, revert on error. See `planSlice.ts` for examples.
- **Project-Scoped Lifecycle:** `projectScopedStores.ts` clears relevant stores on project switch

## Selectors (Prevent Re-renders)

```typescript
import { useShallow } from 'zustand/react/shallow';
  useShallow((state) => ({ projects: state.projects, currentProjectId: state.currentProjectId }))
);

// Better - select only what you need
```

## Adding a New Store

### Large domain (with slices):
```
stores/myFeature/
├── types.ts      # Define interfaces
├── baseState.ts  # Initial state
├── mySlice.ts    # Slice factory
```

### Standalone:
```typescript
// stores/myStore.ts
export const useMyStore = create<MyState>((set) => ({ /* ... */ }));
```

### Export from `stores/index.ts`

## Adding Cross-Store Events

1. Define event in `storeEvents.ts`
2. Emit from Store A: `deps.emit({ type: 'my-event', payload })`
3. Listen in `useStoreSubscriptions.ts`

## Best Practices

- **Dependency injection** — Pass `deps` to allow mocking
- **Error handling** — Always set `error` state on failures
- **Selectors** — Use `useShallow` to avoid re-renders
- **Events instead of imports** — No circular dependencies
- **Optimistic updates** — Update UI immediately, revert on error

## Testing

```typescript
const mockApi = { /* mock methods */ };
const mockEmit = vi.fn();
const store = createProjectStore({ api: mockApi, emit: mockEmit });

store.getState().myAction();
expect(mockApi.myEndpoint).toHaveBeenCalled();
```
