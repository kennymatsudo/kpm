/**
 * Settings IPC handlers.
 */

import { ipcMain } from 'electron';

  ipcMain.handle(
    'settings:anthropic:has-key',
    createSimpleIpcHandler(async () => {
  );

  ipcMain.handle(
    'settings:anthropic:save-key',
    createIpcHandler(
      SettingsSchemas.saveApiKey,
      async ({ apiKey }) => {
      },
  );

  ipcMain.handle(
    'settings:anthropic:delete-key',
    createSimpleIpcHandler(async () => {
  );

  ipcMain.handle(
    'settings:anthropic:test-key',
    createIpcHandler(
      SettingsSchemas.testApiKey,
      async ({ apiKey }) => {
      },
  );

  ipcMain.handle(
    'settings:app:get',
    createIpcHandler(
      SettingsSchemas.getAppSetting,
      },
  );

  ipcMain.handle(
    'settings:app:set',
    createIpcHandler(
      SettingsSchemas.setAppSetting,
      },
  );

  ipcMain.handle(
    'settings:app:get-all',
  );
}
