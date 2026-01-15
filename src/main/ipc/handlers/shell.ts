import { ipcMain, shell } from 'electron';
import { ShellSchemas } from '../validation';

export function registerShellHandlers(): void {
  // Open URL in default browser
    const { url } = ShellSchemas.openExternal.parse(params);
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open URL' };
    }
  });
}
