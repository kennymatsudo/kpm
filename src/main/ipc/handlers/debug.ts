import { ipcMain } from 'electron';

// Debug mode flag - set via IPC from renderer
let debugEnabled = false;

/**
 */
export function registerDebugHandlers(): void {
    debugEnabled = enabled;
    console.log(`[Debug] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    return { enabled: debugEnabled };
  });

    return { enabled: debugEnabled };
  });
}
