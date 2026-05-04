import { ipcMain, BrowserWindow } from 'electron';
import { registerTempImageHandlers } from '../handlers/tempImages';
import { registerShellHandlers } from '../handlers/shell';
import { registerPerfHandlers } from '../handlers/perf';
import { registerConfluenceHandlers } from '../handlers/confluence';
import { registerDebugHandlers } from '../handlers/debug';
import { registerTestingHandlers } from '../handlers/testing';
import { registerToolLogHandlers } from '../handlers/toollog';
import { registerPromptOverrideHandlers } from '../handlers/promptOverrides';
import { registerSearchHandlers } from '../handlers/search';
import { registerBriefingHandlers } from '../handlers/briefing';
import { registerMcpServerHandlers } from '../handlers/mcpServers';
import { registerUsageHandlers } from '../handlers/usage';
import type { IpcRegistrationContext } from './types';
import { assertTrustedIpcSender } from '../senderValidation';

export function registerPlatformHandlers({
  services,
  chatRuntime,
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
  registerPerfHandlers();
  registerConfluenceHandlers(services.confluenceSyncService);
  registerDebugHandlers();
  registerTestingHandlers();
  registerToolLogHandlers(chatRuntime.toolCallLogger);
  registerPromptOverrideHandlers(services.promptOverrideService);
  registerSearchHandlers(services.searchService);
  registerBriefingHandlers(services.briefingService);
  registerMcpServerHandlers(services.mcpDiscoveryService);
  registerUsageHandlers(services.claudeUsageService);
}
