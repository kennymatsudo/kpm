import { ipcMain, shell } from 'electron';
import { ShellSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerShellHandlers(): void {
  // Open URL in default browser
  ipcMain.handle(IPC_CHANNELS.shell.openExternal, async (_event, params: unknown) => {
    const { url } = ShellSchemas.openExternal.parse(params);
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open URL' };
    }
  });
}
