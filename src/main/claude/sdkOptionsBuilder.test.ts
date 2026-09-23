import { describe, expect, it, vi } from 'vitest';
import type { PlanContext } from '../chat/prompts';
import { getClaudeSdkSpawnOptions } from './findClaude';
import { buildSdkOptions } from './sdkOptionsBuilder';

vi.mock('../chat/prompts/index', () => ({
  buildFocusSystemPrompt: vi.fn(() => 'focus prompt'),
  buildSystemPrompt: vi.fn(() => 'main prompt'),
}));

vi.mock('./permissions', () => ({
  createPermissionHandler: vi.fn(() => vi.fn()),
}));

vi.mock('../kpmTools/createKpmServer', () => ({
  getFocusKpmServer: vi.fn(() => ({ name: 'focus-kpm' })),
  getKpmServer: vi.fn(() => ({ name: 'kpm' })),
}));

vi.mock('../config', () => ({
  getConfig: vi.fn(() => ({
    claude: {
      autoCompact: false,
      debug: false,
      forwardSubagentText: true,
      includePartialMessages: true,
      maxTurns: 100,
    },
  })),
}));

vi.mock('./findClaude', () => ({
  getClaudeSdkSpawnOptions: vi.fn(() => undefined),
}));

vi.mock('../services/core/PermissionPromptService', () => ({
  promptUser: vi.fn(),
}));

vi.mock('../services/files/pathSecurity', () => ({
  getDeniedPathRoots: () => ['/protected/credentials', '/home/developer/.docker'],
  getDockerConfigPathRoots: () => ['/home/developer/.docker'],
}));

const context = {
  project: {
    id: 'project-id',
    folder_path: '/project',
  },
  repos: [],
  attachments: [],
  planItems: [],
  focusedResources: [],
} as unknown as PlanContext;

describe('buildSdkOptions', () => {
  it('keeps default tools and explicitly enables native repo search tools', () => {
    const options = buildSdkOptions({
      context,
      model: 'sonnet',
      mainWindow: null,
    });

    // 'default' must be the sole `tools` value so the native binary expands it
    // to the full built-in preset; Grep/Glob (omitted from native presets) are
    // enabled via allowedTools. Listing them in `tools` alongside 'default'
    // would collapse the preset to only those two tools.
    expect(options.tools).toEqual(['default']);
    expect(options.allowedTools).toEqual(['Grep', 'Glob']);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['kpm']);
    expect(options.sandbox).toEqual({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      excludedCommands: ['docker *'],
      network: {
        allowedDomains: ['localhost', '127.0.0.1', '::1'],
        allowLocalBinding: true,
        allowUnixSockets: [
          '/var/run/docker.sock',
          '/home/developer/.docker/run/docker.sock',
          '/home/developer/.docker/desktop/docker.sock',
        ],
        // Non-darwin sandboxes additionally allow all Unix sockets — assert
        // this per-platform so the test doesn't only pass on macOS dev machines.
        ...(process.platform !== 'darwin' && { allowAllUnixSockets: true }),
      },
      filesystem: {
        allowWrite: ['/'],
        denyRead: ['/protected/credentials'],
        denyWrite: ['/protected/credentials'],
      },
      credentials: {
        files: [{ path: '/protected/credentials', mode: 'deny' }],
      },
    });
  });

  // The SDK records a bare-string systemPrompt on the conversation's first
  // request and replays it on every resume. KPM rebuilds the prompt each time
  // it connects so plan edits and view switches reach the model, so the
  // recording has to stay off.
  it('sends the system prompt unrecorded so a resume picks up the rebuilt one', () => {
    const options = buildSdkOptions({ context, model: 'sonnet', mainWindow: null });

    expect(options.systemPrompt).toEqual({
      type: 'custom',
      prompt: 'main prompt',
      snapshot: false,
    });
  });

  // --await-initialize only exists on the binary we bundle; a `claude` found on
  // PATH may be older and would exit on the unknown option.
  it('only sends plugins over stdin when the bundled binary is pinned', () => {
    const withPlugins = () => buildSdkOptions({
      context,
      model: 'sonnet',
      mainWindow: null,
      enabledPluginPaths: ['/plugins/slack'],
    });

    expect(withPlugins().pluginDelivery).toBeUndefined();

    vi.mocked(getClaudeSdkSpawnOptions).mockReturnValueOnce({ pathToClaudeCodeExecutable: '/bundled/claude' });
    expect(withPlugins().pluginDelivery).toBe('initialize');
  });
});
