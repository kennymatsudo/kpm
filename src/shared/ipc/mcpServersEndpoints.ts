/**
 * MCP servers domain endpoint registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import type { DiscoveredMcpServer, DiscoveredPlugin, UserMcpServer } from '../types';

/** Standard `{success, error?}` envelope used by `toIpcResponse` (see `main/ipc/response.ts`). */
type McpServersIpcResponse = { success: true } | { success: false; error: string };

export const mcpServersEndpoints = {
  listAvailable: {
    channel: 'mcp-servers:list-available',
    params: z.object({}),
    result: resultOf<{ plugins: DiscoveredPlugin[]; userServers: UserMcpServer[]; managedServers: DiscoveredMcpServer[] }>(),
  },
  getPreferences: {
    channel: 'mcp-servers:get-preferences',
    params: z.object({}),
    result: resultOf<{ preferences: Record<string, boolean> }>(),
  },
  setEnabled: {
    channel: 'mcp-servers:set-enabled',
    params: z.object({ serverName: z.string().min(1), enabled: z.boolean() }),
    result: resultOf<McpServersIpcResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type McpServersEndpoints = typeof mcpServersEndpoints;
export type McpServersEndpointName = keyof McpServersEndpoints;
