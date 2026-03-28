/**
 * Settings IPC handlers.
 */

import { ipcMain } from 'electron';
import type { SettingsService } from '../../services/core/SettingsService';
import { createIpcHandler, createSimpleIpcHandler, SettingsSchemas } from '../validation';

export function registerSettingsHandlers(settingsService: SettingsService): void {
  ipcMain.handle(
    'settings:anthropic:has-key',
    createSimpleIpcHandler(async () => {
      const result = await settingsService.hasAnthropicKey();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    }, 'Failed to check API key status'),
  );

  ipcMain.handle(
    'settings:anthropic:save-key',
    createIpcHandler(
      SettingsSchemas.saveApiKey,
      async ({ apiKey }) => {
        const result = await settingsService.saveAnthropicKey(apiKey);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to save API key',
    ),
  );

  ipcMain.handle(
    'settings:anthropic:delete-key',
    createSimpleIpcHandler(async () => {
      const result = await settingsService.deleteAnthropicKey();
      if (!result.ok) throw new Error(result.error);
    }, 'Failed to delete API key'),
  );

  ipcMain.handle(
    'settings:anthropic:test-key',
    createIpcHandler(
      SettingsSchemas.testApiKey,
      async ({ apiKey }) => {
        const result = await settingsService.testAnthropicKey(apiKey);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      'Failed to test API key',
    ),
  );

  ipcMain.handle(
    'settings:app:get',
    createIpcHandler(
      SettingsSchemas.getAppSetting,
      ({ key }) => {
        const result = settingsService.getAppSetting(key);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      'Failed to get setting',
    ),
  );

  ipcMain.handle(
    'settings:app:set',
    createIpcHandler(
      SettingsSchemas.setAppSetting,
      ({ key, value }) => {
        const result = settingsService.setAppSetting(key, value);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to save setting',
    ),
  );

  ipcMain.handle(
    'settings:app:get-all',
    createSimpleIpcHandler(() => {
      const result = settingsService.getAllAppSettings();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    }, 'Failed to get settings'),
  );
}
