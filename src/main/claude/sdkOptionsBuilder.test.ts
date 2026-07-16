import { describe, expect, it, vi } from 'vitest';
import type { PlanContext } from '../chat/prompts';
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
    const externalMcp = { type: 'stdio', command: 'example-mcp' };

    const options = buildSdkOptions({
      context,
      model: 'sonnet',
      mainWindow: null,
      enabledUserMcpConfigs: { external: externalMcp },
    });

    // 'default' must be the sole `tools` value so the native binary expands it
    // to the full built-in preset; Grep/Glob (omitted from native presets) are
    // enabled via allowedTools. Listing them in `tools` alongside 'default'
    // would collapse the preset to only those two tools.
    expect(options.tools).toEqual(['default']);
    expect(options.allowedTools).toEqual(['Grep', 'Glob']);
    expect(options.mcpServers).toMatchObject({ external: externalMcp });
  });
});
