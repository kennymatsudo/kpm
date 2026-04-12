import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import { createMcpDiscoveryService } from '../../src/main/services/core/McpDiscoveryService';

vi.mock('os', () => ({
  homedir: () => '/mock-home',
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

function createExecFileMock(response: { stdout: string; stderr: string } | Error): typeof execFile {
  return ((
    _cmd: string,
    _args: unknown,
    _opts: unknown,
    callback?: ((error: Error | null, stdout: string, stderr: string) => void) | null
  ) => {
    if (callback) {
      if (response instanceof Error) {
        callback(response, '', '');
      } else {
        callback(null, response.stdout, response.stderr);
      }
    }

    return {} as ReturnType<typeof execFile>;
  }) as unknown as typeof execFile;
}

describe('McpDiscoveryService.getSlackAvailability', () => {
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
    mockExecFile.mockImplementation(createExecFileMock(new Error('claude unavailable')));
    appSettings.get.mockReturnValue(undefined);
  });

    files.set('/mock-home/.claude/plugins/installed_plugins.json', JSON.stringify({
      plugins: {
        'slack@claude-plugins-official': [{}],
      },
    }));
    files.set('/mock-home/.claude/settings.json', JSON.stringify({
      enabledPlugins: {
        'slack@claude-plugins-official': true,
      },
    }));
    files.set('/mock-home/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/slack/.mcp.json', JSON.stringify({
      mcpServers: {
        slack: {},
      },
    }));
    appSettings.get.mockImplementation((key: string) => key === 'mcp_enabled_servers' ? JSON.stringify({}) : undefined);

    const result = await service.getSlackAvailability();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        available: false,
        source: 'plugin',
        serverName: 'slack',
      });
    }
  });

    files.set('/mock-home/.claude.json', JSON.stringify({
      mcpServers: {
        slack: {
          command: 'node',
          args: ['slack-mcp.js'],
        },
      },
    }));
    appSettings.get.mockImplementation((key: string) => key === 'mcp_enabled_servers'
      ? JSON.stringify({ 'user:slack': true })
      : undefined);

    const result = await service.getSlackAvailability();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        available: true,
        source: 'user',
        serverName: 'slack',
        reason: null,
      });
    }
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

    const result = service.getEnabledPluginPaths();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        '/mock-home/.claude/plugins/marketplaces/openai-codex/external_plugins/codex',
      ]);
    }
  });
});
