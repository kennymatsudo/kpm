import { z } from 'zod';

export const PerfSchemas = {
  log: z.object({
    name: z.string().min(1, 'Event name is required'),
    durationMs: z.number().nonnegative().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
};
