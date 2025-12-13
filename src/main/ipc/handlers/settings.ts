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
}
