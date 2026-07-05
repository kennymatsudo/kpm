/**
 * Shell domain endpoint registry.
 *
 * One entry per `shell:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.shell`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Mirrors `src/main/security/externalUrl.ts`'s `isAllowedExternalUrl`. */
function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/shell.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const shellEndpoints = {
  openExternal: {
    channel: 'shell:open-external',
    params: z.object({
      url: z.string().url('Valid URL is required').refine(isAllowedExternalUrl, 'Only http, https, and mailto URLs are allowed'),
    }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ShellEndpoints = typeof shellEndpoints;
export type ShellEndpointName = keyof ShellEndpoints;
