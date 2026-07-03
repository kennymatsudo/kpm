/**
 * Shell domain endpoint registry.
 *
 * One entry per `shell:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.shell`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

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

export const shellEndpoints = {
  openExternal: {
    channel: 'shell:open-external',
    params: z.object({
      url: z.string().url('Valid URL is required').refine(isAllowedExternalUrl, 'Only http, https, and mailto URLs are allowed'),
    }),
  },
} satisfies Record<string, EndpointDefinition>;

export type ShellEndpoints = typeof shellEndpoints;
export type ShellEndpointName = keyof ShellEndpoints;
