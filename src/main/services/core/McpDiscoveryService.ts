/**
 * MCP Discovery Service
 *
 * Discovers installed Claude Code plugins from the user's Claude Code plugin ecosystem.
 * Starts from installed_plugins.json and records whether each plugin also has an MCP server config.
 *
 * Does NOT manage MCP server processes — the SDK handles that.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import type { DiscoveredPlugin, DiscoveredMcpServer, McpServerSource, UserMcpServer } from '../../../shared/types';
import type { IAppSettingsRepository } from '../../db/interfaces';
import { success, failure, type ServiceResult } from '../result';

// =============================================================================
// Constants
// =============================================================================

/** app_settings key for MCP server preferences */
const MCP_PREFERENCES_KEY = 'mcp_enabled_servers';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

/**
 * Discover installed Claude Code plugins.
 *
 * Flow:
 * 1. Read installed_plugins.json to get installed plugin keys (e.g., "slack@claude-plugins-official")
 * 2. For each, derive the external plugin path and read plugin metadata
 * 3. Record whether it exposes MCP servers via .mcp.json
 * 4. Read enabledPlugins from settings.json to know which are active in Claude Code
 */
function discoverInstalledClaudePlugins(): DiscoveredPlugin[] {
  const installedPath = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(installedPath)) return [];

  let installedData: { plugins?: Record<string, unknown> };
  try {
    installedData = JSON.parse(fs.readFileSync(installedPath, 'utf-8'));
  } catch {
    return [];
  }

  const installedKeys = Object.keys(installedData.plugins ?? {});
  if (installedKeys.length === 0) return [];

  // Read enabled state from Claude Code settings
  let enabledPlugins: Record<string, boolean> = {};
  try {
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      enabledPlugins = settings.enabledPlugins ?? {};
    }
  } catch { /* ignore */ }

  const plugins: DiscoveredPlugin[] = [];

  for (const key of installedKeys) {
    // Parse "slack@claude-plugins-official" → name="slack", marketplace="claude-plugins-official"
    const atIndex = key.indexOf('@');
    if (atIndex === -1) continue;
    const name = key.substring(0, atIndex);
    const marketplace = key.substring(atIndex + 1);

    const pluginDir = path.join(CLAUDE_DIR, 'plugins', 'marketplaces', marketplace, 'external_plugins', name);

    // Read plugin manifest for description
    let description: string | undefined;
    const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        description = manifest.description;
      } catch {
        // Ignore invalid manifests and still surface the plugin
      }
    }

    // Check for .mcp.json in the external plugin directory
    const mcpPath = path.join(pluginDir, '.mcp.json');
    let serverNames: string[] = [];
    const hasMcpServer = fs.existsSync(mcpPath);

    if (hasMcpServer) {
      try {
        const mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
        // .mcp.json can have servers at top level or nested under mcpServers
        const servers: Record<string, unknown> = mcpConfig.mcpServers ?? mcpConfig;
        serverNames = Object.keys(servers).filter(k => k !== 'mcpServers');
      } catch {
        // Keep the plugin discoverable even if its MCP metadata is invalid.
        serverNames = [];
      }
    }

    plugins.push({
      name,
      path: pluginDir,
      description,
      hasMcpServer,
      serverNames,
      enabledInClaudeCode: enabledPlugins[key] === true,
    });
  }

  return plugins;
}

/**
 * Discover user-configured MCP servers from ~/.claude.json mcpServers.
 * These are servers added via `claude mcp add --scope user`.
 */
function discoverUserMcpServers(): UserMcpServer[] {
  const claudeJsonPath = path.join(os.homedir(), '.claude.json');
  if (!fs.existsSync(claudeJsonPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf-8'));
    const mcpServers = data.mcpServers as Record<string, Record<string, unknown>> | undefined;
    if (!mcpServers) return [];

    return Object.entries(mcpServers).map(([name, config]) => {
      let type: 'stdio' | 'sse' | 'http' = 'stdio';
      if (config.type === 'sse') type = 'sse';
      else if (config.type === 'http') type = 'http';

      return { name, type, config };
    });
  } catch {
    return [];
  }
}

/** app_settings key for last-known managed server info */
const MCP_MANAGED_SERVERS_KEY = 'mcp_managed_servers';

/**
 * Run `claude mcp list` to discover all MCP servers (managed + user).
 * Parses the text output to extract server names, sources, and statuses.
 * Returns managed servers (claude.ai *) separately.
 */
async function discoverManagedServersViaCli(): Promise<DiscoveredMcpServer[]> {
  try {
    // Find claude executable
    const claudePath = findClaudeInPath();
    if (!claudePath) return [];

    const { stdout: output } = await execFileAsync(claudePath, ['mcp', 'list'], {
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env },
    });

    const servers: DiscoveredMcpServer[] = [];
    // Each line: "claude.ai Slack: https://mcp.slack.com/mcp - ✓ Connected"
    // Or: "claude.ai Linear: https://mcp.linear.app/mcp - ! Needs authentication"
    for (const line of output.split('\n')) {
      const match = /^(.+?):\s+.+?\s+-\s+(.+)$/.exec(line.trim());
      if (!match) continue;

      const name = match[1].trim();
      const statusText = match[2].trim();

      // Only include claude.ai managed servers (user servers come from ~/.claude.json)
      if (!name.startsWith('claude.ai')) continue;

      let status: DiscoveredMcpServer['status'] = 'failed';
      if (statusText.includes('Connected')) status = 'connected';
      else if (statusText.includes('Needs authentication')) status = 'needs-auth';
      else if (statusText.includes('disabled')) status = 'disabled';

      servers.push({
        name,
        source: 'claude-ai',
        status,
        tools: [], // Tool names aren't available from CLI output
      });
    }

    return servers;
  } catch {
    return [];
  }
}

/** Find claude executable in PATH */
function findClaudeInPath(): string | null {
  const localBin = path.join(os.homedir(), '.local', 'bin', 'claude');
  if (fs.existsSync(localBin)) return localBin;

  // Check common paths
  for (const dir of ['/usr/local/bin', '/opt/homebrew/bin']) {
    const p = path.join(dir, 'claude');
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function isSlackIdentifier(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('slack');
}

function hasSlackUrl(config: Record<string, unknown> | undefined): boolean {
  if (!config) return false;
  const url = config.url;
  return typeof url === 'string' && url.toLowerCase().includes('slack');
}

function isEnabledInKpm(preferences: Record<string, boolean>, key: string): boolean {
  return preferences[key] === true;
}

export interface SlackMcpAvailability {
  available: boolean;
  source: McpServerSource | null;
  serverName: string | null;
  reason: string | null;
}

// =============================================================================
// Types
// =============================================================================

export interface McpDiscoveryServiceDeps {
  appSettings: IAppSettingsRepository;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMcpDiscoveryService(deps: McpDiscoveryServiceDeps) {
  return {
    /**
     * Discover installed Claude Code plugins.
     */
    discoverPlugins(): ServiceResult<DiscoveredPlugin[]> {
      try {
      } catch (error) {
        return failure(`Failed to discover Claude plugins: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    /**
     * Discover user-configured MCP servers from ~/.claude.json.
     */
    discoverUserServers(): ServiceResult<UserMcpServer[]> {
      try {
      } catch (error) {
        return failure(`Failed to discover user MCP servers: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    /**
     * Get configs for enabled user MCP servers (to pass to SDK mcpServers option).
     */
    getEnabledUserMcpConfigs(): ServiceResult<Record<string, Record<string, unknown>>> {
      const serversResult = this.discoverUserServers();
      if (!serversResult.ok) return failure(serversResult.error);

      const prefsResult = this.getPreferences();
      if (!prefsResult.ok) return failure(prefsResult.error);

      const prefs = prefsResult.data;
      const configs: Record<string, Record<string, unknown>> = {};

      for (const server of serversResult.data) {
        if (prefs[`user:${server.name}`] === true) {
          configs[server.name] = server.config;
        }
      }

      return success(configs);
    },

    /**
     * Save managed server info from session init (so settings UI can show them).
     */
    saveManagedServers(servers: DiscoveredMcpServer[]): ServiceResult<void> {
      try {
        const managed = servers.filter(s => s.source === 'claude-ai');
        return success(undefined);
      } catch (error) {
        return failure(`Failed to save managed servers: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    /**
     * Get cached managed server info (sync, for use during session creation).
     * Returns empty if no session has run yet.
     */
    getCachedManagedServers(): ServiceResult<DiscoveredMcpServer[]> {
      try {
        const raw = deps.appSettings.get(MCP_MANAGED_SERVERS_KEY);
        if (!raw) return success([]);
        return success(JSON.parse(raw) as DiscoveredMcpServer[]);
      } catch {
        return success([]);
      }
    },

    /**
     * Get managed server info for settings UI (async).
     * Uses cached data if available, falls back to `claude mcp list` CLI.
     */
    async getManagedServers(): Promise<ServiceResult<DiscoveredMcpServer[]>> {
      try {
        const raw = deps.appSettings.get(MCP_MANAGED_SERVERS_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as DiscoveredMcpServer[];
          if (cached.length > 0) return success(cached);
        }

        return success(await discoverManagedServersViaCli());
      } catch {
        return success([]);
      }
    },

    /**
     * Detect whether Slack MCP is available from the user's Claude environment.
     */
    async getSlackAvailability(): Promise<ServiceResult<SlackMcpAvailability>> {
      const prefsResult = this.getPreferences();
      if (!prefsResult.ok) return failure(prefsResult.error);
      const prefs = prefsResult.data;

      const pluginsResult = this.discoverPlugins();
      if (!pluginsResult.ok) return failure(pluginsResult.error);

      const slackPlugins = pluginsResult.data.filter((plugin) =>
        plugin.enabledInClaudeCode
        && plugin.hasMcpServer
        && (
          isSlackIdentifier(plugin.name) ||
          plugin.serverNames.some((serverName) => isSlackIdentifier(serverName))
        )
      );
      const enabledSlackPlugin = slackPlugins.find((plugin) => isEnabledInKpm(prefs, plugin.name));
      if (enabledSlackPlugin) {
        return success({
          available: true,
          source: 'plugin',
          serverName: enabledSlackPlugin.serverNames.find((serverName) => isSlackIdentifier(serverName)) ?? enabledSlackPlugin.name,
          reason: null,
        });
      }

      const userServersResult = this.discoverUserServers();
      if (!userServersResult.ok) return failure(userServersResult.error);

      const slackUserServers = userServersResult.data.filter((server) =>
        isSlackIdentifier(server.name) || hasSlackUrl(server.config)
      );
      const enabledSlackUserServer = slackUserServers.find((server) => isEnabledInKpm(prefs, `user:${server.name}`));
      if (enabledSlackUserServer) {
        return success({
          available: true,
          source: 'user',
          serverName: enabledSlackUserServer.name,
          reason: null,
        });
      }

      const managedServersResult = await this.getManagedServers();
      if (!managedServersResult.ok) return failure(managedServersResult.error);

      const slackManagedServer = managedServersResult.data.find((server) => isSlackIdentifier(server.name));
      if (slackManagedServer) {
        const available = slackManagedServer.status === 'connected';
        return success({
          source: 'claude-ai',
          serverName: slackManagedServer.name,
            : available
              ? null
              : `Slack MCP is detected but currently ${slackManagedServer.status}`,
        });
      }

      if (slackPlugins.length > 0) {
        return success({
          available: false,
          source: 'plugin',
          serverName: slackPlugins[0].serverNames.find((serverName) => isSlackIdentifier(serverName)) ?? slackPlugins[0].name,
        });
      }

      if (slackUserServers.length > 0) {
        return success({
          available: false,
          source: 'user',
          serverName: slackUserServers[0].name,
        });
      }

      return success({
        available: false,
        source: null,
        serverName: null,
        reason: 'Slack MCP not detected in the user Claude environment',
      });
    },

    /**
     */
    getPreferences(): ServiceResult<Record<string, boolean>> {
      try {
        const raw = deps.appSettings.get(MCP_PREFERENCES_KEY);
        if (!raw) return success({});
        return success(JSON.parse(raw) as Record<string, boolean>);
      } catch {
        return success({});
      }
    },

    /**
     */
    setServerEnabled(serverName: string, enabled: boolean): ServiceResult<void> {
      try {
        const current = deps.appSettings.get(MCP_PREFERENCES_KEY);
        const prefs: Record<string, boolean> = current ? JSON.parse(current) : {};
        prefs[serverName] = enabled;
        deps.appSettings.set(MCP_PREFERENCES_KEY, JSON.stringify(prefs));
        return success(undefined);
      } catch (error) {
        return failure(`Failed to save MCP preference: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    /**
     * Get plugin paths that should be loaded for the current session.
     * Returns paths for plugins that are both discovered and enabled by the user.
     */
    getEnabledPluginPaths(): ServiceResult<string[]> {
      const pluginsResult = this.discoverPlugins();
      if (!pluginsResult.ok) return failure(pluginsResult.error);

      const prefsResult = this.getPreferences();
      if (!prefsResult.ok) return failure(prefsResult.error);

      const prefs = prefsResult.data;
      const paths: string[] = [];

      for (const plugin of pluginsResult.data) {
        if (prefs[plugin.name] === true) {
          paths.push(plugin.path);
        }
      }

      return success(paths);
    },

    /**
     * Get tool names that should be disallowed (for disabled claude.ai managed servers).
     * Takes the list of MCP servers from the last session init and returns tool names
     * for servers the user has explicitly disabled.
     */
    getDisabledMcpTools(knownServers: DiscoveredMcpServer[]): ServiceResult<string[]> {
      const prefsResult = this.getPreferences();
      if (!prefsResult.ok) return failure(prefsResult.error);

      const prefs = prefsResult.data;
      const disabledTools: string[] = [];

      for (const server of knownServers) {
        // Managed servers use "managed:" prefix in preferences
        const prefKey = server.source === 'claude-ai' ? `managed:${server.name}` : server.name;
        if (prefs[prefKey] === false) {
          disabledTools.push(...server.tools);
        }
      }

      return success(disabledTools);
    },
  };
}

export type McpDiscoveryService = ReturnType<typeof createMcpDiscoveryService>;
