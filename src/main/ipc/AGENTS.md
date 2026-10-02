# IPC

Every invoke call is declared once in an endpoint registry (`src/shared/ipc/{domain}Endpoints.ts`); the handler, the preload bridge, and the `IPC_CHANNELS` constants are all derived from it. Push events (main to renderer) use a parallel event registry (`src/shared/ipc/{domain}Events.ts`).

Handlers validate, then delegate to a service or straight to a repository (`services.container.<repo>`). When to use which, and the ban on pass-through services, is in [`../services/AGENTS.md`](../services/AGENTS.md).

## Gotchas on the call path

`bindRegistryHandlers` parses the payload with the entry's `params` before the handler runs. Only files under `src/renderer/services/` may touch `window.api` (ESLint `no-restricted-properties`), so every endpoint needs a service function even when it is a one-line forward. `registration.test.ts` reads channels from `IPC_CHANNELS` (derived by `toNestedChannels`) and from `src/shared/ipc/allAppEvents.ts`. The only hand-registered invoke channel is `window:close` (`ipcMain.on` in `register/platform.ts`). `senderValidation.ts` rejects IPC from untrusted renderer URLs and is installed before any handler registers.

## Choosing a binder

- **`bindRegistryHandlers(registry, handlers, overrides?)`**: no envelope. The handler's return value is the wire response, so declare `result` as exactly what it returns (raw data, `toIpcResponse(...)`, `ipcSuccess(...)`). Type handlers with `HandlerFor`. A thrown error or a failed Zod parse reaches the renderer as a rejected promise. Use this for new domains.
- **`createRegistryIpcHandlers(registry, handlers, fallbackError, overrides?)`**: wraps every handler as `{ success: true, ...returned }` or `{ success: false, error }`, catching throws and validation failures. The handler returns bare data (or nothing) and throws on failure (`if (!result.ok) throw new Error(result.error)`). Declare `result` as `RegistryResponse<T>` and type handlers with `UnwrappedHandlerFor`. `RegistryResponse` is a local type redeclared in each registry file that uses it; copy it from a neighbour such as `customThemeEndpoints.ts`.

Stay with whichever binder a domain already uses. A few older handlers hand-roll the same loop as `bindRegistryHandlers`; they behave the same. `handlers/testing.ts` registers its channels one by one, and only when `NODE_ENV=test`.

## Recipe: add an endpoint to an existing domain

1. Add an entry to `src/shared/ipc/{domain}Endpoints.ts`: `{ channel, params, result }`. Use `params: null` for no payload. Channels follow `domain:action-name`.
2. Add the matching key to the handler map in `src/main/ipc/handlers/{domain}.ts`. A missing key, or a return type that disagrees with `result`, is a compile error.
3. Expose it in `src/preload/api.ts`. Some domains expose the derived object directly; others list methods by hand (e.g. `customThemes`, where `delete: (themeId) => customThemeInvoke.delete({ themeId })`). If the domain lists methods, add yours, or it silently stays unreachable.
4. Add a function to `src/renderer/services/{domain}Service.ts` and call that from stores and components.
5. Run `npx tsc --noEmit` and `npm test -- src/main/ipc`.

`IPC_CHANNELS` derives from the registry, so it needs no edit.

## Recipe: add a new domain

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

- **Write registry entries as plain object literals.** A generic factory like `endpoint(channel, params)` widens `params` to the shared bound, and `EndpointPayload` then becomes `undefined` for every entry without any error.
- **Registry files are bundled into the renderer**, because preload and renderer services import them for types. They must not import Node built-ins (`fs`, `path`, `os`) or main-process code, or the renderer build breaks. For a check that needs Node, keep a format-only schema in the registry and layer the real check in `src/main/ipc/validation/{domain}.ts` via `.extend({...})`, then pass it as the binder's `overrides` argument. Examples: `validation/project.ts` (directory exists) used by `handlers/repos.ts` and `handlers/attachments.ts`; `validation/artifacts.ts` and `validation/chat.ts` (path inside the temp-images dir). For pure string checks, reuse `src/shared/ipc/relativePath.ts`.
- **Validate on the main side only.** Request params are parsed by Zod. `result` and event payloads are compile-time markers with no runtime check, because main produces them.
- **The client payload is the schema's input type** (`EndpointClientPayload`), so fields with `.default()` stay optional in the renderer but are filled in for the handler.
- **Don't delete an event just because one side looks missing.** A few entries are emitted with no subscriber, or subscribed with no emitter. Check the whole call graph before removing one.

## Testing

- `src/main/ipc/registration.test.ts` boots every registrar against the mocked `ipcMain` and fails if an `IPC_CHANNELS` channel has neither a handler nor an event-registry entry.
- `src/main/ipc/validation.test.ts` covers schemas by parsing `{domain}Endpoints[key].params` directly, plus the refine overrides.
- For handler logic, call the exported `build{Domain}Handlers(fakeDeps)` and invoke a key with `(params, {} as never)`. See `handlers/playbooks.test.ts`. `tests/setup.ts` mocks `electron` globally.
