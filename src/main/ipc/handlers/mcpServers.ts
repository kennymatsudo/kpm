/**
 * MCP Servers IPC Handlers
 *
 * Bridges renderer to McpDiscoveryService for MCP server discovery and preferences.
 */

import { ipcMain } from 'electron';
import { mcpServersEndpoints, type McpServersEndpointName } from '../../../shared/ipc/mcpServersEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { McpDiscoveryService } from '../../services/core/McpDiscoveryService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

/**
 * One handler per `mcpServersEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type McpServersHandlers = { [K in McpServersEndpointName]: HandlerFor<typeof mcpServersEndpoints, K> };

function buildMcpServersHandlers(mcpDiscoveryService: McpDiscoveryService): McpServersHandlers {
  return {
    // List all discovered sources: plugins, user servers, and last-known managed servers
    listAvailable: async () => {
      const managedResult = await mcpDiscoveryService.getManagedServers();
      return {
        plugins: unwrapOrThrow(mcpDiscoveryService.discoverPlugins()),
        userServers: unwrapOrThrow(mcpDiscoveryService.discoverUserServers()),
        managedServers: unwrapOrThrow(managedResult),
      };
    },

    // Get user preferences (which servers are enabled/disabled)
    getPreferences: async () => {
      return { preferences: unwrapOrThrow(mcpDiscoveryService.getPreferences()) };
    },

    // Enable or disable a server
    setEnabled: async ({ serverName, enabled }) => {
      return toIpcResponse(mcpDiscoveryService.setServerEnabled(serverName, enabled));
    },
  };
}

export function registerMcpServerHandlers(mcpDiscoveryService: McpDiscoveryService): void {
  const handlers = buildMcpServersHandlers(mcpDiscoveryService);

  for (const [name, { channel, params }] of Object.entries(mcpServersEndpoints) as [
    McpServersEndpointName,
    (typeof mcpServersEndpoints)[McpServersEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildMcpServersHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
