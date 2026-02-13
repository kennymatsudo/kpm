import { ipcMain, shell } from 'electron';
import { ShellSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import { isAllowedExternalUrl } from '../../security/externalUrl';

export function registerShellHandlers(): void {
  // Open URL in default browser
  ipcMain.handle(IPC_CHANNELS.shell.openExternal, async (_event, params: unknown) => {
    const { url } = ShellSchemas.openExternal.parse(params);
    if (!isAllowedExternalUrl(url)) {
      return { success: false, error: 'Blocked unsafe URL protocol' };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open URL' };
    }
  });
}
