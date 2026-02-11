import { ipcMain } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, ToolLogSchemas } from '../validation';
import type { ToolCallLogger } from '../../services/toollog';

export function registerToolLogHandlers(toolCallLogger: ToolCallLogger): void {
  ipcMain.handle(
    createIpcHandler(
      ToolLogSchemas.getEntries,
      ({ chatSessionId }) => ({
        entries: toolCallLogger.getEntriesForSession(chatSessionId),
      }),
      'Failed to get tool log entries'
    )
  );

  ipcMain.handle(
    createIpcHandler(
      ToolLogSchemas.getSessionStats,
      ({ chatSessionId }) => ({
        stats: toolCallLogger.getSessionStats(chatSessionId),
      }),
      'Failed to get tool log stats'
    )
  );

  ipcMain.handle(
    createSimpleIpcHandler(
      () => toolCallLogger.getInfo(),
      'Failed to get tool log info'
    )
  );

  ipcMain.handle(
    createIpcHandler(
      ToolLogSchemas.setEnabled,
      ({ enabled }) => {
        toolCallLogger.setEnabled(enabled);
      },
      'Failed to toggle tool logging'
    )
  );
}
