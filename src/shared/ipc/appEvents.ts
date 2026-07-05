/**
 * Generic main→renderer event registry helpers.
 *
 * Mirrors `endpoints.ts`'s registry pattern for the push-event direction: a
 * domain event registry (e.g. `shared/ipc/chatEvents.ts`) is a flat object
 * keyed by dotted method path (e.g. `'chat.chunk'`), where each entry pairs
 * an IPC channel string with the payload type the main process emits on it.
 *
 * Unlike invoke endpoints, event payloads have no runtime Zod schema — main
 * produces them and they're trusted, so `payloadOf<T>()` is a compile-time-only
 * phantom marker (same shape as `resultOf<T>()` in `endpoints.ts`). Main-process
 * emit call sites and the preload subscription bridge are both derived from
 * the same registry so the channel string and payload type can't drift.
 */

/**
 * Phantom carrier for an event's payload type. Never holds a real value —
 * `payloadOf<T>()` always returns `undefined` at runtime — it only exists so
 * `EventPayload<E>` has a `TPayload` to infer from. There is no runtime
 * validation of event payloads; main produces them and they're trusted.
 */
export interface PayloadMarker<TPayload> {
  readonly __payloadType?: TPayload;
}

/** Declares an event's payload type without a runtime value. */
export function payloadOf<TPayload>(): PayloadMarker<TPayload> {
  return undefined as unknown as PayloadMarker<TPayload>;
}

/** One main→renderer event: the wire channel and its payload type. */
export interface EventDefinition<TPayload = unknown> {
  channel: string;
  payload: PayloadMarker<TPayload>;
}

/** Registry shape: dotted method name -> event definition. */
export type EventRegistry = Record<string, EventDefinition>;

/** Payload type for a registry entry, extracted from its `payload` marker. */
export type EventPayload<E extends EventDefinition> =
  E['payload'] extends PayloadMarker<infer TPayload> ? TPayload : never;

/**
 * Rebuilds `{ a: { b: 'x:a:b' } }`-shaped channel objects from a flat event
 * registry, for call sites that still read nested `IPC_CHANNELS.<domain>.*`
 * constants — the event-side counterpart to `toNestedChannels` in
 * `endpoints.ts`.
 */
export function toNestedEventChannels<R extends EventRegistry>(registry: R): unknown {
  const root: Record<string, unknown> = {};
  for (const [dottedKey, definition] of Object.entries(registry)) {
    const segments = dottedKey.split('.');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      const next = (node[segment] as Record<string, unknown> | undefined) ?? {};
      node[segment] = next;
      node = next;
    }
    node[segments[segments.length - 1]] = definition.channel;
  }
  return root;
}

/**
 * A window-like sender: `BrowserWindow.webContents` and Electron's
 * `IpcMainEvent.sender` both satisfy this, so `emitAppEvent` works whether
 * the caller has a `BrowserWindow` or a raw `WebContents`.
 */
export interface AppEventSender {
  send(channel: string, payload: unknown): void;
}

/**
 * Typed emit for a single registry entry. Every `webContents.send(...)` call
 * site should go through this instead of a bare string channel, so the
 * payload is compile-checked against the registry's declared shape.
 *
 * `sender` may be `null`/`undefined` (mirrors the common
 * `mainWindow?.webContents.send(...)` call site) — a no-op in that case.
 */
export function emitAppEvent<E extends EventDefinition>(
  sender: AppEventSender | null | undefined,
  event: E,
  payload: EventPayload<E>
): void {
  sender?.send(event.channel, payload);
}

/**
 * Typed broadcast to every open window. Mirrors the `broadcastToWindows`
 * helper pattern used by `appServices.ts`/`NotificationService`, but bound to
 * a single registry entry so the payload is compile-checked.
 */
export function broadcastAppEvent<E extends EventDefinition>(
  windows: Iterable<AppEventSender & { isDestroyed(): boolean }>,
  event: E,
  payload: EventPayload<E>
): void {
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.send(event.channel, payload);
    }
  }
}

/**
 * Preload-side subscription surface derived from a registry: one `onX`
 * method per entry, each producing an `ipcRenderer.on` wrapper and returning
 * the standard unsubscribe function. Naming: dotted key `chat.chunk` becomes
 * method `onChunk` when merged into the domain's existing nested object by
 * the caller (see `deriveEventSubscriptions`) — this function itself returns
 * a flat `{ [dottedKey]: subscribe }` map; callers that need nested
 * namespaces (e.g. `chat.onChunk`) destructure the flat map into their own
 * object literal, exactly like `deriveDomainApi` for invoke endpoints.
 */
export type EventSubscriptions<R extends EventRegistry> = {
  [K in keyof R]: (callback: (payload: EventPayload<R[K]>) => void) => () => void;
};

/**
 * Minimal slice of Electron's `ipcRenderer` this helper needs — kept as an
 * interface so preload code can pass the real module without this file
 * importing `electron` (this file is shared/renderer-bundled).
 */
export interface RendererEventSource {
  on(channel: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * Builds a flat `{ [registryKey]: (callback) => unsubscribe }` map,
 * collapsing the hand-written `ipcRenderer.on(...)` + `removeListener(...)`
 * block each event used to need in `src/preload/api.ts`. Keys are the
 * registry's own keys, untransformed — the preload re-keys them into its
 * public `onX` method names when assembling the domain's nested object,
 * exactly like `deriveDomainApi` for invoke endpoints.
 */
export function deriveEventSubscriptions<R extends EventRegistry>(
  registry: R,
  ipcRenderer: RendererEventSource
): EventSubscriptions<R> {
  const subscriptions = {} as EventSubscriptions<R>;
  for (const key of Object.keys(registry) as (keyof R)[]) {
    const { channel } = registry[key];
    (subscriptions[key] as (callback: (payload: unknown) => void) => () => void) = (callback) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    };
  }
  return subscriptions;
}
