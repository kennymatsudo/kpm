/**
 * Settings IPC handlers.
 */

import { settingsEndpoints, type SettingsEndpointName } from '../../../shared/ipc/settingsEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { SettingsService } from '../../services/core/SettingsService';
import { getClaudeAvailability, refreshClaudeAvailability } from '../../claude/availabilityState';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `settingsEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type SettingsHandlers = { [K in SettingsEndpointName]: UnwrappedHandlerFor<typeof settingsEndpoints, K> };

function buildSettingsHandlers(settingsService: SettingsService): SettingsHandlers {
  return {
    'anthropic.hasKey': async () => {
      const result = await settingsService.hasAnthropicKey();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    'anthropic.saveKey': async ({ apiKey }) => {
      const result = await settingsService.saveAnthropicKey(apiKey);
      if (!result.ok) throw new Error(result.error);
    },

    'anthropic.deleteKey': async () => {
      const result = await settingsService.deleteAnthropicKey();
      if (!result.ok) throw new Error(result.error);
    },

    'anthropic.testKey': async ({ apiKey }) => {
      const result = await settingsService.testAnthropicKey(apiKey);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    'app.get': ({ key }) => {
      const result = settingsService.getAppSetting(key);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    'app.set': ({ key, value }) => {
      const result = settingsService.setAppSetting(key, value);
      if (!result.ok) throw new Error(result.error);
    },

    'app.getAll': () => {
      const result = settingsService.getAllAppSettings();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    'claude.getAvailability': () => ({ success: true, ...getClaudeAvailability() }),

    'claude.refreshAvailability': () => ({ success: true, ...refreshClaudeAvailability() }),
  };
}

export function registerSettingsHandlers(settingsService: SettingsService): void {
  createRegistryIpcHandlers(settingsEndpoints, buildSettingsHandlers(settingsService), 'Settings operation failed');
}
