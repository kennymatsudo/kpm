/**
 * Settings IPC handlers.
 */

import { settingsEndpoints, type SettingsEndpointName } from '../../../shared/ipc/settingsEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { SettingsService } from '../../services/core/SettingsService';
import type { IAppSettingsRepository } from '../../db/interfaces';
import { getClaudeAvailability, refreshClaudeAvailability } from '../../claude/availabilityState';
import { getCodexStatus } from '../../codex/auth';
import { getProviderReadiness, refreshProviderReadiness } from '../../providers/readiness';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `settingsEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type SettingsHandlers = { [K in SettingsEndpointName]: UnwrappedHandlerFor<typeof settingsEndpoints, K> };

function buildSettingsHandlers(
  settingsService: SettingsService,
  appSettings: IAppSettingsRepository
): SettingsHandlers {
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

    'app.get': ({ key }) => ({ value: appSettings.get(key) ?? null }),

    'app.set': ({ key, value }) => {
      appSettings.set(key, value);
    },

    'app.getAll': () => ({ settings: appSettings.getAll() }),

    'claude.getAvailability': () => ({ success: true, ...getClaudeAvailability() }),

    'claude.refreshAvailability': () => ({ success: true, ...refreshClaudeAvailability() }),

    'codex.getStatus': async () => getCodexStatus(),

    'providers.getReadiness': async () => ({ success: true, ...(await getProviderReadiness()) }),

    'providers.refreshReadiness': async () => ({ success: true, ...(await refreshProviderReadiness()) }),
  };
}

export function registerSettingsHandlers(
  settingsService: SettingsService,
  appSettings: IAppSettingsRepository
): void {
  createRegistryIpcHandlers(
    settingsEndpoints,
    buildSettingsHandlers(settingsService, appSettings),
    'Settings operation failed'
  );
}
