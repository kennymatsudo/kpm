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

/** One IPC endpoint: the wire channel plus its payload schema (or none). */
export interface EndpointDefinition<TParams = unknown> {
  channel: string;
  params: z.ZodType<TParams> | null;
}

/** Registry shape: dotted method name -> endpoint definition. */
export type EndpointRegistry = Record<string, EndpointDefinition>;

/** Payload type accepted by an endpoint's client method. */
export type EndpointPayload<E extends EndpointDefinition> =
  E['params'] extends z.ZodType<infer TParams> ? TParams : undefined;

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

/** Flat client surface derived from a registry: one invoke method per entry. */
export type DomainApi<R extends EndpointRegistry> = {
  [K in keyof R]: (payload: EndpointPayload<R[K]>) => Promise<unknown>;
};

/**
 * Builds a closed `{ method: (payload) => invoke(channel, payload) }` surface
 * from a registry — nothing beyond the registry's own channels is exposed.
 * Callers that need nested namespaces (e.g. `tracker.credentials.get`) or
 * precise per-method response types wrap the result in their own object
 * literal / type annotation; this function only owns the channel + payload
 * wiring, which is the part that must never drift from the registry.
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
