# Zustand Stores

UI state management with slice pattern, typed events for cross-store communication, and dependency injection for testing.

## Store Organization

- **`projectStore.ts`** — Main store factory (sliced into `project/` subdirectory: projectSlice, planSlice, resourceSlice, uiSlice)
- **`chat/`** — Sliced store for unified chat state shared between Plan & Workspace views: `historySlice`, `messageSlice`, `streamingSlice`, `sessionManagementSlice`, `settingsSlice` plus shared `baseState.ts`, `types.ts`, `persistence.ts`. Exported as `useChatStore` from `stores/chat` (or via `stores/index.ts`).
- **`devSessions/`** — Sliced store for board agent sessions. `index.ts` composes `lifecycleSlice` (load/delete/dismiss/rename sessions, diff loading), `prSlice` (PR context, creation, linking, and status polling), `reviewSlice` (review inbox: load/assign/assess, draft and send replies, resolve/ignore threads) plus shared `helpers.ts` and `requestState.ts`. Live agent state (`agentStateBySessionId`, `activitiesBySessionId`, `commitStateBySessionId`, etc.) lives on the root store object. Import as `useDevSessionsStore` from `stores/devSessions` (or via `stores/index.ts`).
- **`approvalQueueStore.ts`** — Unified queue/executor for Claude-proposed changes (plan actions, context-file edits, document updates, implementation proposals, review replies). Owns both the **process methods** (called by `useChatIpcBridge` when Claude emits events — they enqueue for review or auto-apply based on the global setting) and the **execute methods** (called by `ApprovalOverlays` when the user approves, or by process methods in auto-apply mode — they call the backing services). Project-scoped.
- **`trackerStore.ts`** — Association and scope management (top-level file, not under `tracker/`).
- **`tracker/`** — Other tracker-related sub-stores:
  - `useSyncStore` — Sync preview state, conflict resolutions, and `syncAvailability` (keyed by associationId). `checkForUpdates()` is called by `useTrackerTopBarIntegration` on a 2-minute polling interval; badge UI reads from `syncAvailability`.
  - `useExportStore` — Export queue state. `addToQueueWithStatus()` stages items and tracks `recentlyImportedIds` for visual feedback.
  - `useCredentialStore` — Tracker credential loading/display.
  - `useTrackerConfigStore` — Custom fields, status mapping, and issue browse/search for an association.
  - `useTrackerMetadataStore` — Cached tracker project/issue-type/status metadata, keyed by `trackerType:projectKey`.
  - `useSyncReviewStore` — Sync review state (project-scoped).
- **Specialized stores** — One per feature domain (workspace, artifacts, groups, search, background tasks, Claude availability, etc.). Includes `backgroundTaskStore.ts`, `customPromptTaskStore.ts`, and `claudeAvailabilityStore.ts` in addition to the domain stores listed above.
- **Infrastructure** — `storeEvents.ts` (typed event emitter), `projectScopedStores.ts` (lifecycle management — reset list includes `approvalQueue`, `syncReview`, and `devSessions`), `useStoreSubscriptions.ts` (event wiring)

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

Multiple concurrent sessions per project, each shared between Plan and Workspace views. Per-session state lives in a `sessions: Map<string, PerSessionState>` keyed by a `crypto.randomUUID()` session id; `viewedSessionId` tracks the focused tab and `activeSessionIds` the sessions with a running subprocess. Which tabs were open (and which was focused) is persisted per project to localStorage (see `chat/persistence.ts`) and restored via `hydrateOpenSessions`. Chat history carries over when switching views. `currentView` parameter passed to prompts for context-aware AI suggestions.

## Cross-Store Communication

Stores use **typed events** for side effects, to avoid circular dependencies:
1. Define event types in `storeEvents.ts`
2. Emit from store actions: `deps.emit({ type: 'status-changed', payload })`
3. Listen in `useStoreSubscriptions.ts` for cross-domain reactions (e.g. status change → auto-queue export), or via a module-level `subscribe(...)` call at the bottom of the consuming store's own file when the reaction belongs entirely to that store's domain (see `useSyncStore.ts`, `useExportStore.ts`)

Direct cross-store imports are fine for simple reads (e.g. `approvalQueueStore` reads `generalSettingsStore`/`fileTreeStore`/`toastStore`) — reserve events for side effects that should stay decoupled.

## Key Patterns

- **Dependency Injection:** Stores receive `ProjectStoreDependencies` (api, emit) via factory functions for testability
- **Optimistic Updates:** Update UI immediately, revert on error. See `planSlice.ts` for examples.
- **Project-Scoped Lifecycle:** `projectScopedStores.ts` clears relevant stores on project switch

## Selectors (Prevent Re-renders)

```typescript
import { useShallow } from 'zustand/react/shallow';
import {
  useProjectDomainStore,
  usePlanDomainStore,
  useProjectUiDomainStore,
} from '../stores';

// Good - scoped by domain and selected fields
const { projects, currentProjectId } = useProjectDomainStore(
  useShallow((state) => ({ projects: state.projects, currentProjectId: state.currentProjectId }))
);

// Better - select only what you need
const projectId = useProjectDomainStore((state) => state.currentProjectId);
const planItems = usePlanDomainStore((state) => state.planItems);
const focusedResources = useProjectUiDomainStore((state) => state.focusedResources);
```

`useProjectStore` remains the internal aggregate store. New component code should prefer domain stores.

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
3. Listen in `useStoreSubscriptions.ts`, or via a module-level `subscribe(...)` in Store B's own file — see "Cross-Store Communication" above

## Best Practices

- **Use slices for large stores** — Split by concern, not by line count
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
