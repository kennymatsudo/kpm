import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';

// Debug mode flag - set via IPC from renderer
let debugEnabled = false;

/**
 */
export function registerDebugHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.debug.setEnabled, (_event, enabled: boolean) => {
    debugEnabled = enabled;
    console.log(`[Debug] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    return { enabled: debugEnabled };
  });

  ipcMain.handle(IPC_CHANNELS.debug.isEnabled, () => {
    return { enabled: debugEnabled };
  });
}
