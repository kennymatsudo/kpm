/**
 * Briefing IPC Handlers
 *
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { BriefingSchemas } from '../validation/briefing';
import type { BriefingService } from '../../services/core/BriefingService';

export function registerBriefingHandlers(briefingService: BriefingService): void {
    const { projectId } = BriefingSchemas.generate.parse(params);
  });
}
