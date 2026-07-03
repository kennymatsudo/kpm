/**
 * MCP servers domain endpoint registry.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

export const mcpServersEndpoints = {
  listAvailable: { channel: 'mcp-servers:list-available', params: z.object({}) },
  getPreferences: { channel: 'mcp-servers:get-preferences', params: z.object({}) },
  setEnabled: {
    channel: 'mcp-servers:set-enabled',
    params: z.object({ serverName: z.string().min(1), enabled: z.boolean() }),
  },
} satisfies Record<string, EndpointDefinition>;

export type McpServersEndpoints = typeof mcpServersEndpoints;
export type McpServersEndpointName = keyof McpServersEndpoints;
