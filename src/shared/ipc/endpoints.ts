/**
 * Generic IPC endpoint registry helpers.
 *
 * A domain endpoint registry (e.g. `shared/ipc/trackerEndpoints.ts`) is a flat
 * object keyed by dotted method path (e.g. `'credentials.get'`), where each
 * entry pairs an IPC channel string with the Zod schema for its payload (or
 * `null` for no-argument endpoints). Main-process handler bindings and the
 * preload invoke bridge are both derived from the same registry so the
 * channel string, payload shape, and response type can't drift between them.
 */

import type { z } from 'zod';

/**
 * Phantom carrier for an endpoint's response type. Never holds a real value —
 * `resultOf<T>()` always returns `undefined` at runtime — it only exists so
 * `EndpointResult<E>` has a `TResult` to infer from. There is no response Zod
 * schema; the result type is compile-time only, matching the invariant that
 * responses aren't runtime-validated like requests are.
 */
export interface ResultMarker<TResult> {
  readonly __resultType?: TResult;
}

/** Declares an endpoint's response type without a runtime value. */
export function resultOf<TResult>(): ResultMarker<TResult> {
  return undefined as unknown as ResultMarker<TResult>;
}

/** One IPC endpoint: the wire channel, its payload schema (or none), and its response type. */
export interface EndpointDefinition<TParams = unknown, TResult = unknown> {
  channel: string;
  params: z.ZodType<TParams> | null;
  result: ResultMarker<TResult>;
}

/** Registry shape: dotted method name -> endpoint definition. */
export type EndpointRegistry = Record<string, EndpointDefinition>;

/**
 * Payload type a main-process handler receives: the schema's *output* type,
 * i.e. after `.parse()` has applied defaults and transforms.
 */
export type EndpointPayload<E extends EndpointDefinition> =
  E['params'] extends z.ZodType<infer TParams> ? TParams : undefined;

/**
 * Payload type the renderer-facing client method accepts: the schema's
 * *input* type, i.e. before `.parse()` runs on the main side — fields with
 * `.default()` stay optional here even though the handler receives them
 * filled in.
 */
export type EndpointClientPayload<E extends EndpointDefinition> = E['params'] extends null
  ? undefined
  : z.input<NonNullable<E['params']>>;

/** Response type returned by an endpoint's client method. */
export type EndpointResult<E extends EndpointDefinition> =
  E['result'] extends ResultMarker<infer TResult> ? TResult : never;

/**
 * Rebuilds `{ a: { b: 'x:a:b' } }`-shaped channel objects from a flat
 * registry, for call sites that still read nested `IPC_CHANNELS.<domain>.*`
 * constants (e.g. the channel-registration completeness test).
 */
export function toNestedChannels<R extends EndpointRegistry>(registry: R): unknown {
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
 * Signature a main-process handler must satisfy for registry entry `K`: it
 * receives the entry's validated payload (plus the raw IPC event) and must
 * return (sync or async) the entry's declared result type. A handler
 * returning the wrong shape is a compile error, the counterpart to a missing
 * handler key already being one (`{ [K in keyof R]: HandlerFor<R, K> }`).
 *
 * Use this directly for domains bound via `bindRegistryHandlers`, where the
 * handler's return value IS the wire response. Domains bound via
 * `createRegistryIpcHandlers` instead unwrap one layer (that helper adds the
 * `{success: true, ...}` / `{success: false, error}` envelope itself) — use
 * `UnwrappedHandlerFor` there.
 */
export type HandlerFor<R extends EndpointRegistry, K extends keyof R> = (
  params: EndpointPayload<R[K]>,
  event: Electron.IpcMainInvokeEvent
) => EndpointResult<R[K]> | Promise<EndpointResult<R[K]>>;

/**
 * Data a registry entry's declared `RegistryResponse<T>` result wraps as
 * `{success: true} & T`, or `void` when the result is a bare pass/fail
 * envelope with no extra data. Used to type handlers bound through
 * `createRegistryIpcHandlers`, which adds the envelope itself — the handler
 * only returns (or throws on failure) the unwrapped `T`.
 */
export type UnwrappedResult<E extends EndpointDefinition> = Extract<
  EndpointResult<E>,
  { success: true }
> extends { success: true } & infer TData
  ? TData
  : never;

/** Handler signature for domains bound via `createRegistryIpcHandlers` (see `UnwrappedResult`). */
export type UnwrappedHandlerFor<R extends EndpointRegistry, K extends keyof R> = (
  params: EndpointPayload<R[K]>,
  event: Electron.IpcMainInvokeEvent
) => UnwrappedResult<R[K]> | Promise<UnwrappedResult<R[K]>>;

/**
 * Flat client surface derived from a registry: one invoke method per entry.
 * `params: null` endpoints take no argument; schemas that accept `undefined`
 * (e.g. `z.object({}).optional()`) make the argument optional; the rest take
 * the schema's input type (see `EndpointClientPayload`).
 */
export type DomainApi<R extends EndpointRegistry> = {
  [K in keyof R]: R[K]['params'] extends null
    ? () => Promise<EndpointResult<R[K]>>
    : undefined extends EndpointClientPayload<R[K]>
      ? (payload?: EndpointClientPayload<R[K]>) => Promise<EndpointResult<R[K]>>
      : (payload: EndpointClientPayload<R[K]>) => Promise<EndpointResult<R[K]>>;
};

/**
 * Builds a closed `{ method: (payload) => invoke(channel, payload) }` surface
 * from a registry — nothing beyond the registry's own channels is exposed.
 * Callers that need nested namespaces (e.g. `tracker.credentials.get`) wrap
 * the result in their own object literal; the response type of each method
 * is already correct from the registry's `result` marker, so no explicit
 * annotation or cast is needed at the call site.
 */
export function deriveDomainApi<R extends EndpointRegistry>(
  registry: R,
  invoke: (channel: string, payload: unknown) => Promise<unknown>
): DomainApi<R> {
  const api = {} as DomainApi<R>;
  for (const key of Object.keys(registry) as (keyof R)[]) {
    const { channel } = registry[key];
    (api[key] as (payload: unknown) => Promise<unknown>) = (payload: unknown) => invoke(channel, payload);
  }
  return api;
}
