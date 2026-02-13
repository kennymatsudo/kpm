import { ipcMain } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, ToolLogSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import type { ToolCallLogger } from '../../services/toollog';

export function registerToolLogHandlers(toolCallLogger: ToolCallLogger): void {
  ipcMain.handle(
    IPC_CHANNELS.toolLog.getEntries,
    createIpcHandler(
      ToolLogSchemas.getEntries,
      ({ chatSessionId }) => ({
        entries: toolCallLogger.getEntriesForSession(chatSessionId),
      }),
      'Failed to get tool log entries'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.toolLog.getSessionStats,
    createIpcHandler(
      ToolLogSchemas.getSessionStats,
      ({ chatSessionId }) => ({
        stats: toolCallLogger.getSessionStats(chatSessionId),
      }),
      'Failed to get tool log stats'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.toolLog.getInfo,
    createSimpleIpcHandler(
      () => toolCallLogger.getInfo(),
      'Failed to get tool log info'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.toolLog.setEnabled,
    createIpcHandler(
      ToolLogSchemas.setEnabled,
      ({ enabled }) => {
        toolCallLogger.setEnabled(enabled);
      },
      'Failed to toggle tool logging'
    )
  );
}
