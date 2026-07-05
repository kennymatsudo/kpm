/**
 * Custom theme domain endpoint registry.
 *
 * One entry per `custom-themes:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.customThemes`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import type { CustomTheme } from '../types';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/customThemes.ts`): the handler returns bare data
 * (or `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const customThemeEndpoints = {
  list: { channel: 'custom-themes:list', params: null, result: resultOf<RegistryResponse<{ themes: CustomTheme[] }>>() },
  importFromUrl: {
    channel: 'custom-themes:import-from-url',
    params: z.object({ url: z.string().trim().min(1).max(500) }),
    result: resultOf<RegistryResponse<{ theme: CustomTheme; warnings: string[] }>>(),
  },
  delete: {
    channel: 'custom-themes:delete',
    params: z.object({ themeId: z.string().trim().min(1).max(200) }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type CustomThemeEndpoints = typeof customThemeEndpoints;
export type CustomThemeEndpointName = keyof CustomThemeEndpoints;
