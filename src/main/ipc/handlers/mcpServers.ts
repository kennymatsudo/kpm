/**
 * MCP Servers IPC Handlers
 *
 * Bridges renderer to McpDiscoveryService for MCP server discovery and preferences.
 */

import { ipcMain } from 'electron';
import { McpServerSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import { createIpcHandler } from '../validation/utils';
import type { McpDiscoveryService } from '../../services/core/McpDiscoveryService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

export function registerMcpServerHandlers(mcpDiscoveryService: McpDiscoveryService): void {
  // List all discovered sources: plugins, user servers, and last-known managed servers
  ipcMain.handle(
    IPC_CHANNELS.mcpServers.listAvailable,
    createIpcHandler(
      McpServerSchemas.listAvailable,
      async () => {
        const managedResult = await mcpDiscoveryService.getManagedServers();
        return {
          plugins: unwrapOrThrow(mcpDiscoveryService.discoverPlugins()),
          userServers: unwrapOrThrow(mcpDiscoveryService.discoverUserServers()),
          managedServers: unwrapOrThrow(managedResult),
        };
      },
      'Failed to list available MCP servers'
    )
  );

  // Get user preferences (which servers are enabled/disabled)
  ipcMain.handle(
    IPC_CHANNELS.mcpServers.getPreferences,
    createIpcHandler(
      McpServerSchemas.getPreferences,
      () => {
        return { preferences: unwrapOrThrow(mcpDiscoveryService.getPreferences()) };
      },
      'Failed to get MCP server preferences'
    )
  );

  // Enable or disable a server
  ipcMain.handle(
    IPC_CHANNELS.mcpServers.setEnabled,
    createIpcHandler(
      McpServerSchemas.setEnabled,
      ({ serverName, enabled }) => {
        return toIpcResponse(mcpDiscoveryService.setServerEnabled(serverName, enabled));
      },
      'Failed to update MCP server preference'
    )
  );
}
