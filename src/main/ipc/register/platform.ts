import { ipcMain, BrowserWindow } from 'electron';
import { registerTempImageHandlers } from '../handlers/tempImages';
import { registerShellHandlers } from '../handlers/shell';
import { registerTerminalHandlers } from '../handlers/terminal';
import { registerPerfHandlers } from '../handlers/perf';
import { registerConfluenceHandlers } from '../handlers/confluence';
import { registerLinearDocumentHandlers } from '../handlers/linearDocuments';
import { registerTestingHandlers } from '../handlers/testing';
import { registerToolLogHandlers } from '../handlers/toollog';
import { registerPromptOverrideHandlers } from '../handlers/promptOverrides';
import { registerSearchHandlers } from '../handlers/search';
import { registerMcpServerHandlers } from '../handlers/mcpServers';
import { registerUsageHandlers } from '../handlers/usage';
import { registerActivityHandlers } from '../handlers/activity';
import type { IpcRegistrationContext } from './types';
import { assertTrustedIpcSender } from '../senderValidation';

export function registerPlatformHandlers({
  services,
  chatRuntime,
  getMainWindow,
}: IpcRegistrationContext): void {
  ipcMain.on('window:close', (event) => {
    try {
      assertTrustedIpcSender(event);
    } catch {
      return;
    }
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  registerTempImageHandlers();
  registerShellHandlers();
  registerTerminalHandlers(services.terminalService, getMainWindow);
  registerPerfHandlers();
  registerConfluenceHandlers(services.confluenceSyncService);
  registerLinearDocumentHandlers(services.linearDocumentService);
  registerTestingHandlers();
  registerToolLogHandlers(chatRuntime.toolCallLogger);
  registerPromptOverrideHandlers(services.promptOverrideService);
  registerSearchHandlers(services.searchService);
  registerMcpServerHandlers(services.mcpDiscoveryService);
  registerUsageHandlers(services.claudeUsageService);
  registerActivityHandlers(services.activityService);
}
