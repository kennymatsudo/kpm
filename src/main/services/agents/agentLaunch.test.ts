import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSessionManager } from './AgentSessionManager';
import { createBoardAgentSession } from './agentLaunch';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  captureRepoEnvironment: vi.fn(),
}));

vi.mock('../../claude/findClaude', () => ({
  getClaudeSdkSpawnOptions: vi.fn(() => ({})),
}));

vi.mock('../repo/EnvironmentService', () => ({
  captureRepoEnvironment: mocks.captureRepoEnvironment,
}));

const agentSessionManager = { create: mocks.create } as unknown as AgentSessionManager;

function launch(overrides: Partial<Parameters<typeof createBoardAgentSession>[0]> = {}) {
  return createBoardAgentSession({
    sessionId: 'session-1',
    projectId: 'project-1',
    provider: 'claude',
    role: 'subagent',
    worktreePath: '/tmp/worktree',
    systemPrompt: 'Review the implementation.',
    taskPrompt: 'Here is the diff.',
    writes: false,
    ...overrides,
  }, agentSessionManager);
}

describe('createBoardAgentSession', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.create.mockReturnValue({ start: vi.fn() });
    mocks.captureRepoEnvironment.mockReset();
    mocks.captureRepoEnvironment.mockResolvedValue({ vars: {} });
  });

  it('carries a configured effort into a Claude subagent launch', async () => {
    await launch({ model: 'opus', effort: 'max' });

    expect(mocks.create.mock.calls[0][0].sdkOptions.effort).toBe('max');
  });

  it('clamps an effort the chosen Claude model cannot serve', async () => {
    await launch({ model: 'sonnet', effort: 'max' });

    expect(mocks.create.mock.calls[0][0].sdkOptions.effort).toBe('high');
  });

  it('keeps workflows off for a writing subagent', async () => {
    await launch({ writes: true });

    const { sdkOptions } = mocks.create.mock.calls[0][0];
    expect(sdkOptions.disallowedTools).toContain('Workflow');
    expect(sdkOptions.settings.disableWorkflows).toBe(true);
    expect(mocks.create.mock.calls[0][0].readOnly).toBe(false);
  });

  it('gives every launch the repo environment, not just the implementation run', async () => {
    mocks.captureRepoEnvironment.mockResolvedValue({ vars: { DATABASE_URL: 'postgres://local' } });

    await launch({ writes: true, environmentMode: 'direnv' });

    expect(mocks.captureRepoEnvironment).toHaveBeenCalledWith('direnv', '/tmp/worktree');
    expect(mocks.create.mock.calls[0][0].sdkOptions.env.DATABASE_URL).toBe('postgres://local');
  });

  it.each([
    ['codex' as const, { sdkOptions: false, model: true, systemPrompt: false, effort: true }],
    ['pi' as const, { sdkOptions: false, model: true, systemPrompt: true, effort: true }],
    ['claude' as const, { sdkOptions: true, model: false, systemPrompt: false, effort: false }],
  ])('routes launch options to the fields %s reads', async (provider, reads) => {
    await launch({ provider, model: 'a-model', effort: 'high' });

    const params = mocks.create.mock.calls[0][0];
    expect(params.sdkOptions != null).toBe(reads.sdkOptions);
    expect(params.model != null).toBe(reads.model);
    expect(params.systemPrompt != null).toBe(reads.systemPrompt);
    expect(params.effort != null).toBe(reads.effort);
  });

  it.each([
    ['claude' as const, false],
    ['pi' as const, false],
    ['codex' as const, true],
    ['gemini' as const, true],
  ])('prepends role instructions for %s only when it has no native slot', async (provider, prepended) => {
    const { providerPrompt } = await launch({ provider });

    expect(providerPrompt.startsWith('Review the implementation.')).toBe(prepended);
    expect(providerPrompt).toContain('Here is the diff.');
  });
});
