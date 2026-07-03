/**
 * Settings domain endpoint registry.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

/** Anthropic API key - starts with 'sk-ant-' */
const anthropicApiKey = z
  .string()
  .min(1, 'API key cannot be empty')
  .refine((key) => key.startsWith('sk-ant-'), 'Invalid API key format (should start with sk-ant-)');

export const settingsEndpoints = {
  'anthropic.hasKey': { channel: 'settings:anthropic:has-key', params: null },
  'anthropic.saveKey': { channel: 'settings:anthropic:save-key', params: z.object({ apiKey: anthropicApiKey }) },
  'anthropic.deleteKey': { channel: 'settings:anthropic:delete-key', params: null },
  'anthropic.testKey': { channel: 'settings:anthropic:test-key', params: z.object({ apiKey: anthropicApiKey }) },

  'claude.getAvailability': { channel: 'settings:claude:get-availability', params: null },
  'claude.refreshAvailability': { channel: 'settings:claude:refresh-availability', params: null },

  'app.get': { channel: 'settings:app:get', params: z.object({ key: z.string().min(1) }) },
  'app.set': { channel: 'settings:app:set', params: z.object({ key: z.string().min(1), value: z.string() }) },
  'app.getAll': { channel: 'settings:app:get-all', params: null },
} satisfies Record<string, EndpointDefinition>;

export type SettingsEndpoints = typeof settingsEndpoints;
export type SettingsEndpointName = keyof SettingsEndpoints;
