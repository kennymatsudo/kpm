/**
 * Settings domain endpoint registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import type { ClaudeAvailability, CodexStatus, ProvidersReadiness } from '../types';

/** Anthropic API key - starts with 'sk-ant-' */
const anthropicApiKey = z
  .string()
  .min(1, 'API key cannot be empty')
  .refine((key) => key.startsWith('sk-ant-'), 'Invalid API key format (should start with sk-ant-)');

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/settings.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const settingsEndpoints = {
  'anthropic.hasKey': {
    channel: 'settings:anthropic:has-key',
    params: null,
    result: resultOf<RegistryResponse<{ hasKey: boolean }>>(),
  },
  'anthropic.saveKey': {
    channel: 'settings:anthropic:save-key',
    params: z.object({ apiKey: anthropicApiKey }),
    result: resultOf<RegistryResponse>(),
  },
  'anthropic.deleteKey': {
    channel: 'settings:anthropic:delete-key',
    params: null,
    result: resultOf<RegistryResponse>(),
  },
  'anthropic.testKey': {
    channel: 'settings:anthropic:test-key',
    params: z.object({ apiKey: anthropicApiKey }),
    result: resultOf<RegistryResponse<{ valid: boolean; error?: string }>>(),
  },

  'claude.getAvailability': {
    channel: 'settings:claude:get-availability',
    params: null,
    result: resultOf<RegistryResponse<ClaudeAvailability>>(),
  },
  'claude.refreshAvailability': {
    channel: 'settings:claude:refresh-availability',
    params: null,
    result: resultOf<RegistryResponse<ClaudeAvailability>>(),
  },

  'codex.getStatus': {
    channel: 'settings:codex:get-status',
    params: null,
    result: resultOf<RegistryResponse<CodexStatus>>(),
  },

  'providers.getReadiness': {
    channel: 'settings:providers:get-readiness',
    params: null,
    result: resultOf<RegistryResponse<ProvidersReadiness>>(),
  },
  'providers.refreshReadiness': {
    channel: 'settings:providers:refresh-readiness',
    params: null,
    result: resultOf<RegistryResponse<ProvidersReadiness>>(),
  },

  'app.get': {
    channel: 'settings:app:get',
    params: z.object({ key: z.string().min(1) }),
    result: resultOf<RegistryResponse<{ value: string | null }>>(),
  },
  'app.set': {
    channel: 'settings:app:set',
    params: z.object({ key: z.string().min(1), value: z.string() }),
    result: resultOf<RegistryResponse>(),
  },
  'app.getAll': {
    channel: 'settings:app:get-all',
    params: null,
    result: resultOf<RegistryResponse<{ settings: Record<string, string> }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type SettingsEndpoints = typeof settingsEndpoints;
export type SettingsEndpointName = keyof SettingsEndpoints;
