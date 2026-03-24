/**
 * MCP Servers IPC Validation Schemas
 */

import { z } from 'zod';

export const McpServerSchemas = {
  listAvailable: z.object({}),

  getPreferences: z.object({}),

  setEnabled: z.object({
    serverName: z.string().min(1),
    enabled: z.boolean(),
  }),
};

// Inferred types
export type McpServerSetEnabledInput = z.infer<typeof McpServerSchemas.setEnabled>;
