import { ipcMain } from 'electron';
import type { CustomThemeService } from '../../services/core/CustomThemeService';
import { IPC_CHANNELS } from '../channels';
import { createIpcHandler, createSimpleIpcHandler, CustomThemeSchemas } from '../validation';

export function registerCustomThemeHandlers(customThemeService: CustomThemeService): void {
  ipcMain.handle(
    IPC_CHANNELS.customThemes.list,
    createSimpleIpcHandler(() => {
      const result = customThemeService.list();
      if (!result.ok) throw new Error(result.error);
      return { themes: result.data };
    }, 'Failed to list custom themes'),
  );

  ipcMain.handle(
    IPC_CHANNELS.customThemes.importFromUrl,
    createIpcHandler(
      CustomThemeSchemas.importFromUrl,
      async ({ url }) => {
        const result = await customThemeService.importFromVsCodeThemesUrl(url);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      'Failed to import custom theme',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.customThemes.delete,
    createIpcHandler(
      CustomThemeSchemas.delete,
      ({ themeId }) => {
        const result = customThemeService.delete(themeId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to delete custom theme',
    ),
  );
}

