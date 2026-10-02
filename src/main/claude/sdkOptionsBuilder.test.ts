import { describe, expect, it, vi } from 'vitest';
import type { PlanContext } from '../chat/prompts';
import { getClaudeSdkSpawnOptions } from './findClaude';
import { buildSdkOptions } from './sdkOptionsBuilder';

vi.mock('../chat/prompts/index', () => ({
  buildFocusSystemPrompt: vi.fn(() => 'focus prompt'),
  buildSystemPrompt: vi.fn(() => 'main prompt'),
}));

vi.mock('./permissions', () => ({
  createKpmToolHook: vi.fn(() => ({ hooks: [] })),
  createPermissionPrompt: vi.fn(() => vi.fn()),
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
  it('keeps default tools and leaves permissions and sandbox to the user\'s Claude Code settings', () => {
    const options = buildSdkOptions({
      context,
      model: 'sonnet',
      mainWindow: null,
    });

    // 'default' must be the sole `tools` value so the native binary expands it
    // to the full built-in preset.
    expect(options.tools).toEqual(['default']);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['kpm']);
    expect(options.settingSources).toEqual(['user']);
    expect(options).not.toHaveProperty('allowedTools');
    expect(options).not.toHaveProperty('sandbox');
    expect(options).not.toHaveProperty('permissionMode');
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

  it('passes --chrome to main chat sessions only', () => {
    const focusContext = { ...context, focusDocument: { path: 'notes.md' } } as unknown as PlanContext;

    expect(buildSdkOptions({ context, model: 'sonnet', mainWindow: null, claudeInChrome: true }).extraArgs).toEqual({ chrome: null });
    expect(buildSdkOptions({ context, model: 'sonnet', mainWindow: null })).not.toHaveProperty('extraArgs');
    expect(buildSdkOptions({ context: focusContext, model: 'sonnet', mainWindow: null, claudeInChrome: true })).not.toHaveProperty('extraArgs');
  });
});
