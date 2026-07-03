import type { z } from 'zod';
import { toolLogEndpoints } from '../../../shared/ipc/toolLogEndpoints';

export const ToolLogSchemas = {
  getEntries: toolLogEndpoints.getEntries.params,
  getSessionStats: toolLogEndpoints.getSessionStats.params,
  setEnabled: toolLogEndpoints.setEnabled.params,
};

export type ToolLogGetEntriesInput = z.infer<typeof ToolLogSchemas.getEntries>;
export type ToolLogGetSessionStatsInput = z.infer<typeof ToolLogSchemas.getSessionStats>;
export type ToolLogSetEnabledInput = z.infer<typeof ToolLogSchemas.setEnabled>;
