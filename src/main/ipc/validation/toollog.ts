import { z } from 'zod';

export const ToolLogSchemas = {
  getEntries: z.object({
    chatSessionId: z.string().min(1, 'chatSessionId is required'),
  }),
  getSessionStats: z.object({
    chatSessionId: z.string().min(1, 'chatSessionId is required'),
  }),
  setEnabled: z.object({
    enabled: z.boolean(),
  }),
};

export type ToolLogGetEntriesInput = z.infer<typeof ToolLogSchemas.getEntries>;
export type ToolLogGetSessionStatsInput = z.infer<typeof ToolLogSchemas.getSessionStats>;
export type ToolLogSetEnabledInput = z.infer<typeof ToolLogSchemas.setEnabled>;
