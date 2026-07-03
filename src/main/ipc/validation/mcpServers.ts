/**
 * MCP Servers IPC Validation Schemas
 */

import type { z } from 'zod';
import { mcpServersEndpoints } from '../../../shared/ipc/mcpServersEndpoints';

export const McpServerSchemas = {
  listAvailable: mcpServersEndpoints.listAvailable.params,
  getPreferences: mcpServersEndpoints.getPreferences.params,
  setEnabled: mcpServersEndpoints.setEnabled.params,
};

// Inferred types
export type McpServerSetEnabledInput = z.infer<typeof McpServerSchemas.setEnabled>;
