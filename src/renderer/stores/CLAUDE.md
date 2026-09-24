# Zustand Stores

One store per feature domain, a sliced project store for plan and project data, and typed events for side effects that cross stores. Everything public is re-exported from `index.ts`; browse the directory for the current set.

## Shapes you will find

- **Project store** (`projectStore.ts` + `project/`): one `create()` combining `projectSlice`, `planSlice`, `resourceSlice`, `uiSlice`. `createProjectStore(deps)` takes `ProjectStoreDependencies` (`api`, `emit`) so tests can inject mocks. Components should use the domain views in `projectDomains.ts` (`useProjectDomainStore`, `usePlanDomainStore`, `useResourceDomainStore`, `useProjectUiDomainStore`); they are typed windows onto the same store, not copies. Derived reads live in `project/selectors.ts`.
- **Other sliced stores**: `chat/` (sessions keyed by id in a `sessions` Map, `viewedSessionId` for the focused tab, open tabs persisted per project and restored by `hydrateOpenSessions`) and `devSessions/`.
- **Standalone stores**: plain `create()` that call `services/*` for IPC. `linearDocumentsStore.ts` is a typical project-scoped example; `searchStore.ts` is a minimal UI-only one.
- **Infrastructure**: `storeEvents.ts` (typed event bus), `useStoreSubscriptions.ts` (cross-domain listeners, mounted once in `App.tsx`), `projectScopedStores.ts` (reset on project switch).

## Rules with reasons

**Selectors must return stable values.** zustand v5 passes the selector straight to React's `useSyncExternalStore`, so a selector that builds a new object or array on every call reads as a changed snapshot every render and React aborts with "Maximum update depth exceeded". This is a correctness rule.

- Safe: a primitive, or a reference the store already holds (`map.get(id)`, `array.find(...)`).
- For several values, wrap in `useShallow` from `zustand/react/shallow`. It compares one level deep, so each field must itself be a primitive or stored reference. A field built inline (`.map`, `.filter`, `?? []`, a helper returning a fresh object) loops just as hard. Select a primitive key and rebuild in `useMemo` (`components/board-view/BoardCard.tsx`), or move the derivation into its own `useShallow` hook (`components/board-view/useReviewRuntime.ts`).

```typescript
const projectId = useProjectDomainStore((s) => s.currentProjectId);
const { projects, currentProjectId } = useProjectDomainStore(
  useShallow((s) => ({ projects: s.projects, currentProjectId: s.currentProjectId }))
);
```

**IPC goes through `services/`.** Stores import service functions; `window.api` is lint-restricted to `src/renderer/services/`. The project store is the one exception: it receives `api` through its deps.

**Side effects across stores use events; reads may import directly.** A store may read another store's state directly (`proposedChangeDisposal.ts` reads `generalSettingsStore` and `usePlanDomainStore`). When store A needs store B to do something, emit an event, which avoids import cycles.

**Per-session maps in `devSessions/` must declare their keying.** Every collection keyed by session id is listed once in `PER_SESSION_STATE` (`devSessions/helpers.ts`) with which ids may key it (`impl` for the user's session, `runtime` for its review twin and playbook subagents). `retainPerSessionState` and `dropPerSessionState` are the only places entries are removed. A new map will not compile until it is declared.

**Proposed Changes have one owner.** `proposedChangeDisposal.ts` owns review versus auto-apply (P8) through `propose`, `approve`, `retry`, `dismiss`, `resetProject`, with a per-kind adapter registry. Add a new change kind as an adapter there; don't write a parallel approval path.

## Recipes

**Add a store.**
1. Small domain: `stores/myStore.ts` with `create<MyState>()`. Large domain: a directory with `types.ts`, `baseState.ts`, slice files, and an `index.ts` that composes them (copy `devSessions/` or `chat/`).
2. Call IPC through a `services/*Service.ts` function; set an `error` field on failure rather than throwing into components.
3. Re-export from `stores/index.ts`.
4. Decide whether it is project-scoped (below).

**Decide if a store is project-scoped.** If it holds data belonging to the open project, it must be cleared on switch or the next project shows stale data.
1. Add a `resetProjectState()` action that clears project data but keeps global preferences (the chat store keeps the model choice; the terminal store keeps panel geometry).
2. Register it in `PROJECT_SCOPED_STORES` in `projectScopedStores.ts`. The list is typed, so a missing method is a compile error. `useProjectLoader` calls `resetAllProjectScopedStores()`.
3. Update the expected list in `projectScopedStores.test.ts`.

Leave global stores out (settings, model catalog, toasts). `permissionStore` and `activityStore` must stay out: they describe work still running in the project you just left, and resetting them on switch recreates the bug they were added to fix.

**Add a cross-store event.**
1. Add an event interface to `storeEvents.ts` and include it in the `StoreEvent` union. That file is the authoritative list.
2. Emit it: `emit({ type: 'my-event', payload })` (the project store uses `deps.emit`).
3. Listen in `useStoreSubscriptions.ts` when the reaction spans domains, or with a module-level `subscribe('my-event', ...)` at the bottom of the consuming store's file when the reaction belongs to that store (`tracker/useSyncStore.ts`, `tracker/useExportStore.ts`).

## Testing

- Project store: build it with injected deps.

  ```typescript
  const api = createMockApi(); // tests/mocks/electron-api.ts
  const emit = vi.fn();
  const store = createProjectStore({ api: api as unknown as API, emit });
  ```

- Standalone stores: mock the service module, e.g. `vi.mock('../services/permissionService', ...)` (see `permissionStore.test.ts`, `workspaceStore.test.ts`).
- Tests are co-located as `*.test.ts`; a few live under the repo-root `tests/stores/`.
