# IPC Handlers

Bridges Electron's main process and renderer. Pattern: validate with Zod → delegate → return response. The delegate is a service when there's real behaviour (business rules, multi-entity coordination); otherwise it's a repository directly (`services.container.<repo>`), reached via `AppServices` — see `src/main/services/CLAUDE.md`. Do not add a service method that only forwards to a repository call.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Renderer Process (React)                     │
│         window.api.<domain>.<method>(params) (src/preload)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ IPC Channel Bridge
┌──────────────────────────▼──────────────────────────────────────┐
│                    Main Process (Electron)                       │
│  Handler (Zod validation) → Service or Repository → Response    │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/main/ipc/
├── index.ts              # Handler registration (composition root)
├── channels.ts           # Re-export of shared channel constants
├── response.ts           # IpcResponse type and helpers
├── validation.ts         # Re-export from validation/
├── validation/           # Shared validators, handler wiring utils, registry-schema refines
│   ├── index.ts
│   ├── shared.ts         # Reusable Zod pieces (uuid, paths, etc.)
│   ├── utils.ts          # createIpcHandler, createRegistryIpcHandlers, bindRegistryHandlers helpers
│   └── [domain].ts       # Only for domains needing a stronger refine on top of a registry schema
│                         #   (validationOverrides pattern) — most domains have no file here at all;
│                         #   the registry (`src/shared/ipc/{domain}Endpoints.ts`) is their only schema owner
├── handlers/             # IPC handler implementations (one per domain)
└── register/             # Handler registration groups (three files, called from index.ts)
    ├── workspace.ts      # Project/repo/attachment, plan/group, chat, files/export, tracker, settings, themes, permissions, artifacts, task prompt templates, custom prompts, scheduled loops, onboarding, slack
    ├── development.ts    # GitHub, review, dev sessions, file explorer, repo files, agent sessions
    └── platform.ts       # Shell, terminal, temp images, perf, confluence, debug, testing, tool log, prompt overrides, search, briefing, MCP servers, usage handlers

src/shared/ipc/
├── endpoints.ts           # Generic registry helpers (EndpointDefinition, EndpointPayload, toNestedChannels, deriveDomainApi)
├── relativePath.ts        # Shared pure-string relative-path safety check (normalizePosixPath + relativePath schema) reused by fileExplorer, repoFiles, github, confluence
├── {domain}Endpoints.ts   # One per domain (tracker, fileExplorer, repoFiles, attachment, tempImage, artifact, context, search, chat, terminal, settings, permission, promptOverrides, toolLog, storybook, mcpServers, briefing, usage, devSession, agentSession, review, github, plan, group, export, confluence, scheduledLoop, slack, project, repo, customPrompt, taskPromptTemplate, customTheme, theme, onboarding, perf, debug, testing, shell) — every invoke domain is on the registry; see "Endpoint Registries" below
├── appEvents.ts           # Generic event-registry helpers (EventDefinition, EventPayload, payloadOf, emitAppEvent, deriveEventSubscriptions, toNestedEventChannels)
├── allAppEvents.ts        # Flattened aggregate of every domain's event registry, walked by registration.test.ts
└── {domain}Events.ts      # One per domain with push events (chat, review, devSession, agentSession, usage, permission, terminal, briefing, menu, notification, plan, repo, fileExplorer, tracker, customPrompt, onboarding, scheduledLoop, toolLog) — see "Main→Renderer Event Registry" below
```

## Channel Registry

All channels are defined in `src/shared/ipcChannels.ts` and re-exported from `channels.ts` for main-process handlers:

```typescript
export const IPC_CHANNELS = {
  project: { create: 'project:create', get: 'project:get', list: 'project:list' },
  plan: { updateItem: 'plan:update-item', listItems: 'plan:list-items' },
} as const;
```

## Handler Pattern: Validate → Delegate → Return

### Pattern 1: Registry-Bound Handlers (most domains)

```typescript
import { toIpcResponse } from '../response';
import { success } from '../../services/result';
import { bindRegistryHandlers } from '../validation/utils';
import { groupEndpoints, type GroupEndpointName } from '../../../shared/ipc/groupEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';

type GroupHandlers = { [K in GroupEndpointName]: HandlerFor<typeof groupEndpoints, K> };

function buildGroupHandlers(groupService: GroupService, groups: IGroupRepository): GroupHandlers {
  return {
    list: ({ projectId }) => groups.getByProjectId(projectId),
    delete: ({ id }) => {
      const notFound = groupNotFoundResponse(groups, id);
      if (notFound) return notFound;
      groups.delete(id);
      return toIpcResponse(success(undefined));
    },
    // ...one entry per registry key; a missing one is a compile error
  };
}

export function registerGroupHandlers(groupService: GroupService, groups: IGroupRepository): void {
  bindRegistryHandlers(groupEndpoints, buildGroupHandlers(groupService, groups));
}
```

Each registry key's `params` schema is parsed once by `bindRegistryHandlers` before the matching handler runs — no `.parse()` calls inside handler bodies. See `handlers/groups.ts` for the full file, and "Endpoint Registries" below for the `createRegistryIpcHandlers` vs `bindRegistryHandlers` choice.

### Pattern 2: createRegistryIpcHandlers Wrapper (uniform `{success, ...}` envelope)

```typescript
createRegistryIpcHandlers(
  artifactEndpoints,
  {
    list: ({ projectId }) => {
      const result = artifactService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    // ...one entry per registry key
  },
  'Failed to list artifacts'
);
```

See `handlers/settings.ts` or `handlers/customPrompts.ts` for full files using this pattern.

`createIpcHandler`/`createSimpleIpcHandler` (`validation/utils.ts`) are the pre-registry hand-rolled wrapper this pattern superseded — no handler calls them anymore, but they're kept for the same `{success, ...}` envelope shape if a future non-registry endpoint needs it standalone.

## Validation Schemas

Every domain's Zod payload schema lives in `src/shared/ipc/{domain}Endpoints.ts` — the registry is the single owner. `src/main/ipc/validation/` holds only shared validator pieces (`shared.ts`), the handler-wiring utilities (`utils.ts`), and per-domain refines layered on top of a registry schema where the registry itself can't express the check (see `validation/project.ts`, `validation/chat.ts`, `validation/artifacts.ts` for examples of the `validationOverrides` pattern, and "Adding a New Domain Registry" below for when this applies).

## Response Patterns

| Handler Type | Use | Example |
|--------------|-----|---------|
| Returns data | `unwrapOrThrow()` | `list`, `get`, `create` |
| Returns void/action result | `toIpcResponse()` | `delete`, `update`, `remove` |

## Adding a New IPC Handler

Every invoke domain is on the endpoint registry — see the `{domain}Endpoints.ts` line in Directory Structure above for the full list. Follow the registry recipe below. The old 4-file recipe (hand-declared channel + `validation/{domain}.ts` schema + `handlers/{domain}.ts` + register call) no longer applies to any domain — new endpoints are added to an existing `{domain}Endpoints.ts` registry, or a new one following "Adding a New Domain Registry" below.

Every domain's registration loop binds off the same criterion: a uniform `{success, ...}` envelope across every entry goes through `createRegistryIpcHandlers`; a heterogeneous mix of response shapes (raw values, `toIpcResponse`, `unwrapOrThrow`, `ipcSuccess`/`ipcError`) goes through `bindRegistryHandlers` instead, which wires the same per-key params schema and dispatch without imposing an envelope. Both live next to each other in `validation/utils.ts`. `groups`, `slack`, `confluence`, `tracker`, and `attachments` use `bindRegistryHandlers` for this reason; `handlers/debug.ts` also uses it since its response shape is a bare `{ enabled }`. `handlers/testing.ts` (test-only, env-gated, mixed response shapes; channels still come from `testingEndpoints`) hand-declares each `ipcMain.handle` call individually rather than looping — it doesn't fit either helper since some of its handlers need per-call setup beyond a channel + params + handler triple. `handlers/customPrompts.ts` execution progress (`custom-prompt:progress`/`complete`/`error`) and `handlers/onboarding.ts` generation progress (`onboarding:progress`/`thinking`/`complete`/`error`) are main-to-renderer events — see "Main→Renderer Event Registry" below for how those (and every other domain's streaming callbacks) are wired.

## Main→Renderer Event Registry

The invoke path (above) has a typed registry; the push-event path (`webContents.send` in main, `ipcRenderer.on` in preload) mirrors it with the same phantom-marker approach, in `src/shared/ipc/appEvents.ts` and one `{domain}Events.ts` file per domain (`chatEvents.ts`, `reviewEvents.ts`, `agentSessionEvents.ts`, `devSessionEvents.ts`, `usageEvents.ts`, `permissionEvents.ts`, `terminalEvents.ts`, `briefingEvents.ts`, `menuEvents.ts`, `notificationEvents.ts`, `planEvents.ts`, `repoEvents.ts`, `fileExplorerEvents.ts`, `trackerEvents.ts`, `customPromptEvents.ts`, `onboardingEvents.ts`, `scheduledLoopEvents.ts`, `toolLogEvents.ts`).

Shape (mirrors `endpoints.ts`'s registry, see `chatEvents.ts` for the largest example):

```typescript
// src/shared/ipc/{domain}Events.ts
export const {domain}Events = {
  chunk: { channel: 'chat:chunk', payload: payloadOf<ChunkEventData>() },
  // ...one entry per event, keyed by a short name (not the dotted invoke-style path)
} satisfies Record<string, EventDefinition>;
```

- `payloadOf<T>()` (`appEvents.ts`) is the event-side counterpart to `resultOf<T>()` — a compile-time-only phantom marker. Event payloads are never runtime-validated (main produces them; they're trusted), unlike invoke request params.
- **Main side**: `emitAppEvent(sender, event, payload)` replaces a bare `webContents.send(channel, payload)` call — `sender` may be `null`/`undefined` (mirrors the common `mainWindow?.webContents.send(...)` call site) and is a no-op in that case. For fan-out-to-all-windows broadcasts (`broadcastToWindows`-style helpers already used by `NotificationService`, `ReviewPollService`, `ScheduledLoopRunnerService`), keep the generic `(channel, payload) => void` signature at the fan-out sink but add a small local `broadcast<E extends EventDefinition>(event: E, payload: EventPayload<E>)` wrapper in the calling service that forwards `event.channel` — see `ReviewPollService.ts` for the pattern.
- **Preload side**: `deriveEventSubscriptions({domain}Events, ipcRenderer)` produces `{ chunk: (callback) => unsubscribe, ... }` for every registry entry, collapsing the old hand-written 4-line `ipcRenderer.on` + `removeListener` block. Wrap the result into the domain's existing nested public shape (e.g. `chat.onChunk: chatSubscriptions.chunk`) — the renderer-facing method names and nesting don't change.
- **Payload types**: own them in the `{domain}Events.ts` file (or reuse an existing shared type like `PermissionRequest`/`UsageLiveEvent`/`AgentSessionStatePayload` already declared in `shared/types.ts`/`shared/agent-types.ts`/`shared/usage-types.ts`). If a renderer service file previously declared its own copy (e.g. `ChunkEventData` in `chatService.ts`), re-export it from there instead of leaving a duplicate declaration.
- **`shared/ipcChannels.ts`**: event channels are deliberately NOT part of `IPC_CHANNELS` (that registry is invoke-only) — the exception is `terminal.data`/`terminal.exit`/`briefing.chunk`, which existing readers already expect nested under `IPC_CHANNELS.terminal`/`IPC_CHANNELS.briefing`; those are derived via `toNestedEventChannels` (the event-registry counterpart to `toNestedChannels`) rather than hand-declared.
- **`registration.test.ts`**: the completeness guard sources its "known preload event channels" set from `shared/ipc/allAppEvents.ts` (`allAppEventChannels`, a flattened aggregate of every domain's event registry) instead of regex-scraping `preload/api.ts` source.
- **Dead events**: some channels are emitted with no preload subscriber (`chat:truncated`, `chat:context-file-update`, `review-poll:completed`/`needs-attention`/`fix-started`/`error`/`tick-complete`), and one has a subscriber with no emitter (`review:sync-updated`). All are kept wired in their registries rather than silently deleted — don't assume an entry is safe to remove just because you can't find its counterpart; check the whole call graph first.

## Endpoint Registries (Migrated Domains)

Adding one IPC endpoint by hand touches up to six files: the channel string (`shared/ipcChannels.ts`), the Zod schema (`validation/{domain}.ts`), the handler (`handlers/{domain}.ts`), the register call, a preload invoke wrapper (`src/preload/api.ts`), and a renderer service wrapper (`src/renderer/services/{domain}Service.ts`). An **endpoint registry** collapses the first five into one declaration per endpoint; only the renderer service wrapper (required by the `no-restricted-properties` lint rule — `window.api` may only be touched inside `src/renderer/services/`) and the handler body stay separate.

`src/shared/ipc/trackerEndpoints.ts` is the reference implementation. Shape:

```typescript
// src/shared/ipc/trackerEndpoints.ts
export const trackerEndpoints = {
  'credentials.get': {
    channel: 'tracker:credentials:get',
    params: null,
    result: resultOf<{ success: boolean; jira?: JiraCredentialInfo; linear?: LinearCredentialInfo }>(),
  },
  'credentials.saveJira': {
    channel: 'tracker:credentials:save:jira',
    params: z.object({ siteUrl: jiraSiteUrl, email, apiToken }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  // ...one entry per endpoint, keyed by the dotted method path used on window.api.<domain>
} satisfies Record<string, EndpointDefinition>;
```

Write registry entries as **plain object literals**, not via a generic factory function (e.g. `endpoint(channel, params)`) — routing construction through a generic helper widens each entry's `params` to the shared `EndpointDefinition` bound and breaks per-endpoint payload inference (`EndpointPayload<...>` silently resolves to `undefined` for every entry). This is a real TypeScript pitfall, not a style preference — verify with `tsc --noEmit` if you touch this pattern.

`shared/ipc/endpoints.ts` provides the generic helpers:
- `EndpointDefinition<TParams, TResult>` / `EndpointRegistry` — the entry and registry shapes; `result: resultOf<T>()` declares the response type as a compile-time-only phantom (no response Zod schema — responses aren't runtime-validated like requests are)
- `EndpointPayload<E>` — extracts an entry's payload type from its Zod schema (or `undefined` for `params: null`)
- `EndpointResult<E>` — extracts an entry's declared response type from its `result` marker
- `HandlerFor<R, K>` / `UnwrappedHandlerFor<R, K>` — handler signatures enforcing the declared result type; a handler returning the wrong shape is a compile error. Use `UnwrappedHandlerFor` for domains bound via `createRegistryIpcHandlers`, which adds the `{success, ...}` envelope itself (declare those results as `RegistryResponse<T>`)
- `toNestedChannels(registry)` — rebuilds a nested `{ a: { b: 'x:a:b' } }` object from the flat registry, for call sites that still read `IPC_CHANNELS.<domain>.*` (e.g. `shared/ipcChannels.ts` derives `IPC_CHANNELS.tracker` this way, and `registration.test.ts`'s channel-drift guard walks the result the same as any hand-declared block)
- `deriveDomainApi(registry, invoke)` — builds `{ method: (payload) => invoke(channel, payload) }` for the preload bridge, each method typed `(payload: EndpointClientPayload<E>) => Promise<EndpointResult<E>>`; a closed set, nothing beyond the registry's own channels

The declared `result` must match what the handler actually returns — the handler is the source of truth, and `HandlerFor` makes a mismatch a compile error. For domains bound via `bindRegistryHandlers` (no envelope imposed), a handler that throws surfaces as a rejected promise in the renderer, so don't declare an error branch the handler never returns.

**Main side** (`handlers/{domain}.ts`): bind one handler function per registry key via a typed map — `{ [K in keyof typeof {domain}Endpoints]: HandlerFor<K> }` (mirrors `ACTION_EXECUTORS` in `shared/planActionSchema.ts` — a registry entry without a matching handler key is a compile error). Handler bodies keep the same validate-nothing-else-than-that shape as before (they already come in validated); the loop that registers them with `ipcMain.handle` parses each payload with the entry's own `params` schema before calling the handler. See `handlers/tracker.ts`.

**Preload side** (`src/preload/api.ts`): call `deriveDomainApi({domain}Endpoints, (channel, payload) => ipcRenderer.invoke(channel, payload))`, then wrap the result in the domain's existing nested object shape (e.g. `tracker.credentials.get`). No response casts — each derived method's response type flows from the registry's `result` marker. Event-subscription methods (`onProgress`, etc., using `ipcRenderer.on`) are not invoke endpoints — leave them hand-written alongside the derived block.

**Renderer side** (`src/renderer/services/{domain}Service.ts`): each exported function stays a thin forward to `window.api.{domain}.*`, but takes the endpoint's payload object directly instead of reshaping positional arguments into one — the payload type IS the Zod schema's inferred type (`EndpointPayload<(typeof {domain}Endpoints)[K]>`). The file is not deleted even though every function is a 1:1 forward: renderer code outside `services/` may not import `window.api` directly.

## Adding a New Domain Registry

Checklist for standing up a new domain's registry (the tracker registry is the reference implementation):

1. Create `src/shared/ipc/{domain}Endpoints.ts`: one entry per endpoint (`{ channel, params, result }`), written as plain object literals (see the factory-function pitfall above). The domain's Zod schemas simply live here from the start — the registry is their single owner. Declare each `result` from the handler's actual return shape.
2. Derive `IPC_CHANNELS.{domain}` in `shared/ipcChannels.ts` from the registry via `toNestedChannels`, instead of hand-declaring the block. Grep for other readers of `IPC_CHANNELS.{domain}.*` first — keep the nested shape identical so they don't need changes. **Event channels are not invoke endpoints** — channels only ever used with `ipcRenderer.on`/`webContents.send` (progress events, etc.) stay hand-declared and out of the registry.
3. Delete `validation/{domain}.ts` if it only re-declared schemas the registry now owns — repoint every importer at `{domain}Endpoints['x.y'].params` (schemas) and `EndpointPayload<(typeof {domain}Endpoints)['x.y']>` (payload types) directly. Only keep a `validation/{domain}.ts` file if the domain needs a stronger refine layered on top of a registry schema (see the escape-hatch bullets below) — in that case the file holds just the refine, not a full alias table.
4. Rewrite `handlers/{domain}.ts`: bind one handler per registry key via the typed-map pattern; keep each handler body's actual logic untouched, just change how it receives its channel + validated params.
5. In `src/preload/api.ts`, add the domain via `deriveDomainApi({domain}Endpoints, ...)`, wrapped in the domain's nested shape — no response casts; the types flow from the registry. **This defines the wire-facing client signature**: the derived methods take a payload object directly, not positional arguments. Leave `ipcRenderer.on(...)` event-subscription functions hand-written.
6. In `src/renderer/services/{domain}Service.ts`, update each function whose preload method's signature changed (step 5) to accept and forward the payload object instead of positional args — do **not** delete the file or bypass it with direct `window.api` access from stores/components, even for pure 1:1 forwards (`no-restricted-properties` in `eslint.config.ts` restricts `window.api` to `services/`).
7. Update every call site of the changed service functions (stores, components) to pass a payload object instead of positional arguments — `tsc --noEmit` will point at every one. Update any test asserting `toHaveBeenCalledWith(...)` on the old positional shape.
8. If the domain has functions that are not 1:1 forwards (real logic beyond reshaping), leave them as-is; only the reshaping wrappers change shape.
9. Verify: `tsc --noEmit` (zero new errors), the domain's `validation`/`registration` tests, and any test importing the renderer service file.

**`src/shared/ipc/{domain}Endpoints.ts` files get bundled into the renderer** (the preload bridge and renderer services both import them for their payload types), so their `params` schemas cannot import Node builtins (`fs`, `path`, `os`) even though `.parse()` only ever actually runs in the main process — the static `import` alone breaks the Vite renderer build. Two escape hatches, both used by the `fileExplorer`/`repoFiles`/`context` and `attachment`/`tempImage` registries respectively:
- Pure-string reimplementations of the Node logic (e.g. a hand-rolled `path.posix.normalize` for relative-path safety checks) when the check has no environment dependency.
- When the check is genuinely environment-dependent (e.g. scoping a path to `os.tmpdir()`), narrow the registry's `params` to a format-only check (e.g. "is absolute") and layer the stronger `.refine()` back on in `validation/{domain}.ts` via `registryEndpoint.params.extend({...})`; then in `handlers/{domain}.ts` parse the affected keys through that stronger schema instead of the registry's own `params` (see `validation/project.ts` + `handlers/repos.ts`/`handlers/attachments.ts`, and `validation/artifacts.ts` + `handlers/tempImages.ts`'s `validationOverrides` map for the pattern).

## Best Practices

1. **Always validate** — Use Zod schemas; never trust renderer input
2. **Delegate, don't implement** — Handlers validate + delegate; no business logic. Delegate to a service when there's real behaviour, or straight to a repository (`services.container`) for a plain read or single-entity write — don't create a pass-through service method just to have something to call
3. **Use result types** — `ServiceResult<T>` makes errors explicit
4. **Organize by domain** — One handler file per feature
5. **Return objects** — IPC serializes easily; return `{ data: T }`

## PlanAction Schema Registry

`planActionSchema` (`shared/planActionSchema.ts`) is the single source of truth for `PlanAction`: each action type is declared once as a Zod object in `PLAN_ACTION_REGISTRY`, keyed by its `type` literal. `PlanAction` (`shared/types.ts`) is `z.infer<typeof planActionSchema>`, and `shared/ipc/planEndpoints.ts`'s `executeActions` entry imports the same schema for IPC validation — neither hand-declares the union.

When adding a new action type:
1. Add an entry to `PLAN_ACTION_REGISTRY` in `shared/planActionSchema.ts`
2. Add a matching executor to `ACTION_EXECUTORS` in `db/domain/PlanActionService.ts` (and to `collectItemIdsForPrefetch`'s switch, if the action touches existing items)

`PlanAction` and `planActionSchema` update automatically — no separate type to hand-keep in sync. `ACTION_EXECUTORS` is typed `{ [T in PlanAction['type']]: ActionExecutor<T> }`, so a missing entry is a compile error, not a runtime "No matching discriminator" failure.

Spec sub-fields inside `create_item` / `update_item.updates` (`intent`, `acceptance_criteria`, `source_document_id`) come from `PLAN_ITEM_FIELDS` (`shared/planItemFields.ts`) via `editableVia: ['ipc', 'planAction']` — see `src/main/services/CLAUDE.md` or the root `CLAUDE.md`'s "Add a plan item field" recipe. The DB column is added via migration (see `src/main/db/CLAUDE.md`) — schema updates without a migration will silently drop the values.
