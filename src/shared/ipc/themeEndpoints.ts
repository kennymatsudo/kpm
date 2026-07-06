/**
 * Theme domain endpoint registry.
 *
 * The renderer reports its resolved window-background appearance (surface0 +
 * color scheme) here whenever a theme is applied; the main process persists it
 * to a sidecar so the next launch can set `BrowserWindow.backgroundColor`
 * before the renderer boots, eliminating the launch flash.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/theme.ts`): the handler returns `void`, and the
 * registry loop wraps it as `{success: true}` / `{success: false, error}`.
 */
type RegistryResponse = { success: true } | { success: false; error: string };

export const themeEndpoints = {
  reportResolved: {
    channel: 'theme:report-resolved',
    params: z.object({
      surface0: z.string().trim().min(1).max(64),
      colorScheme: z.enum(['light', 'dark']),
    }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ThemeEndpoints = typeof themeEndpoints;
export type ThemeEndpointName = keyof ThemeEndpoints;
