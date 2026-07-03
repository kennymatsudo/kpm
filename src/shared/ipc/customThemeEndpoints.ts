/**
 * Custom theme domain endpoint registry.
 *
 * One entry per `custom-themes:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.customThemes`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

export const customThemeEndpoints = {
  list: { channel: 'custom-themes:list', params: null },
  importFromUrl: {
    channel: 'custom-themes:import-from-url',
    params: z.object({ url: z.string().trim().min(1).max(500) }),
  },
  delete: {
    channel: 'custom-themes:delete',
    params: z.object({ themeId: z.string().trim().min(1).max(200) }),
  },
} satisfies Record<string, EndpointDefinition>;

export type CustomThemeEndpoints = typeof customThemeEndpoints;
export type CustomThemeEndpointName = keyof CustomThemeEndpoints;
