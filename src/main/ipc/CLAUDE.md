# IPC

Bridges the renderer and the main process. Every invoke call is declared once in an **endpoint registry** (`src/shared/ipc/{domain}Endpoints.ts`); the main-process handler, the preload bridge, and the `IPC_CHANNELS` constants are all derived from it, so the channel string, payload schema, and response type cannot drift apart. Push events (main to renderer) use a parallel **event registry** (`src/shared/ipc/{domain}Events.ts`).

Handlers validate, then delegate: to a service when there is real behaviour, or straight to a repository (`services.container.<repo>`) for a plain read or single-entity write. Do not add a service method that only forwards to a repository. See `src/main/services/CLAUDE.md`.

## How a call flows

Traced through `activity:snapshot`, the smallest domain:

1. `src/shared/ipc/activityEndpoints.ts` declares `snapshot: { channel: 'activity:snapshot', params: null, result: resultOf<ActivitySnapshot>() }`.
2. `src/main/ipc/handlers/activity.ts` builds a typed handler map (`{ [K in ActivityEndpointName]: HandlerFor<typeof activityEndpoints, K> }`) and passes it to `bindRegistryHandlers`, which calls `ipcMain.handle` once per entry and parses the payload with the entry's `params` before the handler runs.
3. `src/main/ipc/register/platform.ts` calls `registerActivityHandlers(services.activityService)`. `src/main/ipc/index.ts` (`registerAllIpcHandlers`) runs the three register groups: `workspace.ts`, `development.ts`, `platform.ts`.
4. `src/preload/api.ts` runs `deriveDomainApi(activityEndpoints, invoke)` and exposes the result under `api.activity`. `src/preload/preload.ts` publishes `api` as `window.api`; `src/renderer/types/global.d.ts` types it as `typeof api`.
5. `src/renderer/services/activityService.ts` wraps `window.api.activity.snapshot()`. Only files under `src/renderer/services/` may touch `window.api` (ESLint `no-restricted-properties`), so every endpoint needs a service function even when it is a one-line forward.
6. `src/shared/ipcChannels.ts` derives `IPC_CHANNELS.activity` with `toNestedChannels(activityEndpoints)`, which is how `registration.test.ts` sees the channel.

Every invoke domain is on a registry. The only hand-registered channel is `window:close` (`ipcMain.on` in `register/platform.ts`).

## Key files

| File | Owns |
|---|---|
| `src/shared/ipc/endpoints.ts` | `EndpointDefinition`, `resultOf`, `EndpointPayload`, `EndpointClientPayload`, `HandlerFor`, `UnwrappedHandlerFor`, `toNestedChannels`, `deriveDomainApi` |
| `src/shared/ipc/appEvents.ts` | Event side: `payloadOf`, `emitAppEvent`, `broadcastAppEvent`, `deriveEventSubscriptions`, `toNestedEventChannels` |
| `src/shared/ipc/allAppEvents.ts` | Aggregate of every event registry, read by `registration.test.ts` |
| `src/main/ipc/validation/utils.ts` | `bindRegistryHandlers`, `createRegistryIpcHandlers`, `ValidationError` |
| `src/main/ipc/validation/shared.ts` | Reusable Zod pieces (uuid, paths, model ids) |
| `src/main/ipc/response.ts` | `IpcResponse<T>` (`{success, data}` / `{success, error}`), `ipcSuccess`, `ipcError`, `toIpcResponse` |
| `src/main/services/result.ts` | `ServiceResult<T>`, `unwrapOrThrow` |
| `src/main/ipc/senderValidation.ts` | Rejects IPC from untrusted renderer URLs; installed on `ipcMain.handle` before any handler registers |

## Choosing a binder

- **`bindRegistryHandlers(registry, handlers, overrides?)`**: no envelope. The handler's return value is the wire response, so declare `result` as exactly what it returns (raw data, `toIpcResponse(...)`, `ipcSuccess(...)`). Type handlers with `HandlerFor`. A thrown error or a failed Zod parse reaches the renderer as a rejected promise. Use this for new domains.
- **`createRegistryIpcHandlers(registry, handlers, fallbackError, overrides?)`**: wraps every handler as `{ success: true, ...returned }` or `{ success: false, error }`, catching throws and validation failures. The handler returns bare data (or nothing) and throws on failure (`if (!result.ok) throw new Error(result.error)`). Declare `result` as `RegistryResponse<T>` and type handlers with `UnwrappedHandlerFor`. `RegistryResponse` is a local type redeclared in each registry file that uses it; copy it from a neighbour such as `customThemeEndpoints.ts`.

Stay with whichever binder a domain already uses. A few older handlers (`fileExplorer`, `repoFiles`, `search`, `mcpServers`, `usage`, `tempImages`) hand-roll the same loop as `bindRegistryHandlers`; they behave identically. `handlers/testing.ts` registers its channels one by one, and only when `NODE_ENV=test`.

## Recipe: add an endpoint to an existing domain

1. Add an entry to `src/shared/ipc/{domain}Endpoints.ts`: `{ channel, params, result }`. Use `params: null` for no payload. Channels follow `domain:action-name`.
2. Add the matching key to the handler map in `src/main/ipc/handlers/{domain}.ts`. A missing key, or a return type that disagrees with `result`, is a compile error.
3. Expose it in `src/preload/api.ts`. Some domains expose the derived object directly; others list methods by hand (e.g. `customThemes`, where `delete: (themeId) => customThemeInvoke.delete({ themeId })`). If the domain lists methods, add yours, or it silently stays unreachable.
4. Add a function to `src/renderer/services/{domain}Service.ts` and call that from stores and components.
5. Run `npx tsc --noEmit` and `npm test -- src/main/ipc`.

`IPC_CHANNELS` updates by itself because it is derived from the registry.

## Recipe: add a new domain

Keep the heading name; the root `CLAUDE.md` links here.

1. Create `src/shared/ipc/{domain}Endpoints.ts`. Export the registry with `satisfies Record<string, EndpointDefinition>`, plus `{Domain}EndpointName = keyof typeof {domain}Endpoints`. Keys are the dotted method path used on `window.api.{domain}` (`'credentials.get'` nests as `tracker.credentials.get`).
2. Create `src/main/ipc/handlers/{domain}.ts` with a `build{Domain}Handlers(deps)` function returning the typed map and a `register{Domain}Handlers(deps)` that passes it to a binder. Export the builder so tests can call handlers directly.
3. Call `register{Domain}Handlers` from the right group in `src/main/ipc/register/`. Never register from `index.ts` directly. Dependencies come from `IpcRegistrationContext` (`services`, `chatRuntime`, `getMainWindow`).
4. Add `{domain}: toNestedChannels({domain}Endpoints)` to `IPC_CHANNELS` in `src/shared/ipcChannels.ts`. Without it, `registration.test.ts` cannot catch a forgotten step 3.
5. Add the preload block in `src/preload/api.ts` (`deriveDomainApi(...)`) and include it in the exported `api` object.
6. Add `src/renderer/services/{domain}Service.ts`.
7. Verify with `npx tsc --noEmit` and `npm test -- src/main/ipc`.

## Recipe: add a push event (main to renderer)

1. Add an entry to `src/shared/ipc/{domain}Events.ts`, or create the file: `{ name: { channel: 'domain:event-name', payload: payloadOf<T>() } } satisfies Record<string, EventDefinition>`. Own the payload type there, or reuse an existing shared type.
2. For a new events file, add it to `domainRegistries` in `src/shared/ipc/allAppEvents.ts`.
3. Emit from main with `emitAppEvent(mainWindow?.webContents, {domain}Events.name, payload)`. A null sender is a no-op. To reach every window, use `broadcastAppEvent`, or the injected `broadcastToWindows(channel, payload)` dependency that `appServices.ts` gives some services (see how `ReviewPollService.ts` wraps it in a typed local `broadcast`).
4. In `src/preload/api.ts`, `deriveEventSubscriptions({domain}Events, ipcRenderer)` gives one `(callback) => unsubscribe` function per entry; expose it on the domain object as `onName`.
5. Subscribe through the renderer service and call the returned unsubscribe on cleanup.

Event channels are not invoke endpoints and stay out of `IPC_CHANNELS`. The one exception is terminal output (`toNestedEventChannels(terminalEvents)`, spread under `IPC_CHANNELS.terminal`).

## Gotchas

- **Write registry entries as plain object literals.** Building them through a generic factory like `endpoint(channel, params)` widens `params` to the shared bound, and `EndpointPayload` silently becomes `undefined` for every entry.
- **Registry files are bundled into the renderer**, because preload and renderer services import them for types. They must not import Node built-ins (`fs`, `path`, `os`) or main-process code, or the renderer build breaks. For a check that needs Node, keep a format-only schema in the registry and layer the real check in `src/main/ipc/validation/{domain}.ts` via `.extend({...})`, then pass it as the binder's `overrides` argument. Examples: `validation/project.ts` (directory exists) used by `handlers/repos.ts` and `handlers/attachments.ts`; `validation/artifacts.ts` and `validation/chat.ts` (path inside the temp-images dir). For pure string checks, reuse `src/shared/ipc/relativePath.ts`.
- **Validate on the main side only.** Request params are parsed by Zod. `result` and event payloads are compile-time markers with no runtime check, because main produces them.
- **The client payload is the schema's input type** (`EndpointClientPayload`), so fields with `.default()` stay optional in the renderer but are filled in for the handler.
- **Don't delete an event just because one side looks missing.** A few entries are emitted with no subscriber, or subscribed with no emitter. Check the whole call graph before removing one.

## Testing

- `src/main/ipc/registration.test.ts` boots every registrar against the mocked `ipcMain` and fails if an `IPC_CHANNELS` channel has neither a handler nor an event-registry entry.
- `src/main/ipc/validation.test.ts` covers schemas by parsing `{domain}Endpoints[key].params` directly, plus the refine overrides.
- For handler logic, call the exported `build{Domain}Handlers(fakeDeps)` and invoke a key with `(params, {} as never)`. See `handlers/playbooks.test.ts`. `tests/setup.ts` mocks `electron` globally.
