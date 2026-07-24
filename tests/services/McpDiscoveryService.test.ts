import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { createMcpDiscoveryService } from '../../src/main/services/core/McpDiscoveryService';

vi.mock('os', () => ({
  homedir: () => '/mock-home',
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

describe('McpDiscoveryService managed server cache', () => {
  const appSettings = {
    get: vi.fn<(key: string) => string | undefined>(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    appSettings.get.mockReturnValue(undefined);
  });

  it('preserves known tool names when a managed server is pending', () => {
    appSettings.get.mockImplementation((key: string) => key === 'mcp_managed_servers'
      ? JSON.stringify([
        {
          name: 'claude.ai Slack',
          source: 'claude-ai',
          status: 'connected',
          tools: ['mcp__slack__search'],
        },
      ])
      : undefined);

    const service = createMcpDiscoveryService({ appSettings });
    const result = service.saveManagedServers([
      {
        name: 'claude.ai Slack',
        source: 'claude-ai',
        status: 'pending',
        tools: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(appSettings.set).toHaveBeenCalledWith('mcp_managed_servers', JSON.stringify([
      {
        name: 'claude.ai Slack',
        source: 'claude-ai',
        status: 'pending',
        tools: ['mcp__slack__search'],
      },
    ]));
  });

  it('returns disabled managed server names even when tools are not known yet', () => {
    appSettings.get.mockImplementation((key: string) => key === 'mcp_enabled_servers'
      ? JSON.stringify({ 'managed:claude.ai Slack': false })
      : undefined);

    const service = createMcpDiscoveryService({ appSettings });
    const result = service.getDisabledMcpServerNames([
      {
        name: 'claude.ai Slack',
        source: 'claude-ai',
        status: 'pending',
        tools: [],
      },
    ]);

    expect(result).toEqual({
      ok: true,
      data: ['claude.ai Slack'],
    });
  });
});

describe('McpDiscoveryService plugin discovery', () => {
  const files = new Map<string, string>();

  const appSettings = {
    get: vi.fn<(key: string) => string | undefined>(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();

    mockExistsSync.mockImplementation((filePath: fs.PathLike) => files.has(String(filePath)));
    mockReadFileSync.mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      const content = files.get(String(filePath));
      if (content === undefined) {
        throw new Error(`Unexpected read: ${String(filePath)}`);
      }
      return content;
    });
    appSettings.get.mockReturnValue(undefined);
  });

  it('discovers non-MCP Claude plugins and marks them as not exposing MCP servers', () => {
    files.set('/mock-home/.claude/plugins/installed_plugins.json', JSON.stringify({
      plugins: {
        'codex@openai-codex': [{}],
      },
    }));
    files.set('/mock-home/.claude/settings.json', JSON.stringify({
      enabledPlugins: {
        'codex@openai-codex': true,
      },
    }));
    files.set('/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex/.claude-plugin/plugin.json', JSON.stringify({
      description: 'Use Codex from inside Claude Code.',
    }));
    files.set('/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex', '');

    const service = createMcpDiscoveryService({ appSettings: appSettings });
    const result = service.discoverPlugins();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          name: 'codex',
          path: '/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex',
          description: 'Use Codex from inside Claude Code.',
          hasMcpServer: false,
          serverNames: [],
          enabledInClaudeCode: true,
        },
      ]);
    }
  });

  it('returns enabled plugin paths for non-MCP Claude plugins when enabled in KPM', () => {
    files.set('/mock-home/.claude/plugins/installed_plugins.json', JSON.stringify({
      plugins: {
        'codex@openai-codex': [{}],
      },
    }));
    files.set('/mock-home/.claude/settings.json', JSON.stringify({
      enabledPlugins: {
        'codex@openai-codex': true,
      },
    }));
    files.set('/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex/.claude-plugin/plugin.json', JSON.stringify({
      description: 'Use Codex from inside Claude Code.',
    }));
    files.set('/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex', '');
    appSettings.get.mockImplementation((key: string) => key === 'mcp_enabled_servers'
      ? JSON.stringify({ codex: true })
      : undefined);

    const service = createMcpDiscoveryService({ appSettings: appSettings });
    const result = service.getEnabledPluginPaths();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        '/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex',
      ]);
    }
  });
});
