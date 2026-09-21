import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSessionManager } from './AgentSessionManager';
import { getConfig } from '../../config';
import { launchAutoReview } from './autoReview';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  start: vi.fn(),
}));

vi.mock('../repo/gitUtils', () => ({
  getDiff: vi.fn().mockResolvedValue('diff --git a/src/example.ts b/src/example.ts'),
  gitExec: vi.fn(),
}));

vi.mock('./agentCatalog', () => ({
  getReviewOpponent: vi.fn(() => 'claude'),
  isAgentAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../codex/auth', () => ({
  hasCodexAuth: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../claude/findClaude', () => ({
  getClaudeSdkSpawnOptions: vi.fn(() => ({})),
}));

describe('launchAutoReview', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.start.mockReset();
    mocks.create.mockReturnValue({
      start: mocks.start,
    });
  });

  it('gives a tool-using Claude review enough turns to inspect surrounding code', async () => {
    const agentSessionManager = {
      create: mocks.create,
    } as unknown as AgentSessionManager;

    await launchAutoReview({
      implementationSessionId: 'session-1',
      implementationAgentType: 'codex',
      worktreePath: '/tmp/worktree',
      baseBranch: 'main',
      taskDescription: 'Implement the requested change',
      projectId: 'project-1',
      agentSessionManager,
      getPromptContent: () => 'Review the implementation.',
      stepId: 'review',
    });

    const createParams = mocks.create.mock.calls[0]?.[0];
    expect(createParams.agentType).toBe('claude');
    expect(createParams.role).toBe('review');
    expect(createParams.sdkOptions.maxTurns).toBe(200);
    expect(createParams.readOnly).toBe(true);
    expect(createParams.expectsFindings).toBe(true);
  });

  it('does not hand the Codex model to a Claude reviewer', async () => {
    const agentSessionManager = {
      create: mocks.create,
    } as unknown as AgentSessionManager;

    await launchAutoReview({
      implementationSessionId: 'session-1',
      implementationAgentType: 'codex',
      worktreePath: '/tmp/worktree',
      baseBranch: 'main',
      taskDescription: 'Implement the requested change',
      projectId: 'project-1',
      agentSessionManager,
      getPromptContent: () => 'Review the implementation.',
      stepId: 'review',
    });

    const createParams = mocks.create.mock.calls[0]?.[0];
    expect(createParams.sdkOptions.model).toBe(getConfig().generation.fastModel);
  });

  it('runs the reviewer the playbook step resolved to instead of the opposing default', async () => {
    const agentSessionManager = {
      create: mocks.create,
    } as unknown as AgentSessionManager;

    await launchAutoReview({
      implementationSessionId: 'session-1',
      implementationAgentType: 'codex',
      worktreePath: '/tmp/worktree',
      baseBranch: 'main',
      taskDescription: 'Implement the requested change',
      projectId: 'project-1',
      agentSessionManager,
      getPromptContent: () => 'Review the implementation.',
      stepId: 'review',
      // getReviewOpponent is mocked to always return 'claude' regardless of
      // implementationAgentType, so a resolved provider of 'pi' can only come
      // from the playbook's configured reviewer winning over that default.
      reviewer: { provider: 'pi', model: 'openai/gpt-5-codex' },
    });

    const createParams = mocks.create.mock.calls[0]?.[0];
    expect(createParams.agentType).toBe('pi');
    expect(createParams.model).toBe('openai/gpt-5-codex');
  });
});
