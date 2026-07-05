/**
 * Briefing IPC Handlers
 *
 * Generates a prioritized project briefing by gathering SQL context and
 * synthesizing with Claude. Stage 2 streams via `briefing:chunk` events.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { briefingEndpoints } from '../../../shared/ipc/briefingEndpoints';
import { ipcSuccess, toIpcResponseAsync } from '../response';
import type { BriefingService } from '../../services/core/BriefingService';

export function registerBriefingHandlers(briefingService: BriefingService): void {
  ipcMain.handle(IPC_CHANNELS.briefing.generate, async (event, params: unknown) => {
    const { projectId } = briefingEndpoints.generate.params.parse(params);
    const sender = event.sender;

    return toIpcResponseAsync(
      briefingService.generateBriefing(projectId, {
        onChunk: (delta) => {
          if (sender.isDestroyed()) return;
          // Send through the originating webContents so the right window
          // receives the stream even with multiple windows open.
          sender.send(IPC_CHANNELS.briefing.chunk, { projectId, delta });
        },
      }),
    );
  });

  ipcMain.handle(IPC_CHANNELS.briefing.get, (_event, params: unknown) => {
    const { projectId } = briefingEndpoints.get.params.parse(params);
    return ipcSuccess(briefingService.getBriefing(projectId));
  });
}
