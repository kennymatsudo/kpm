import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IDevSessionRepository, IPlanItemRepository, IRepoRepository } from '../../db/interfaces';

const runGenerationMock = vi.hoisted(() => vi.fn());
const gitMocks = vi.hoisted(() => ({
  getCommittedDiff: vi.fn(),
  getCommitLog: vi.fn(),
  getCurrentBranch: vi.fn(),
  resolveBaseBranch: vi.fn(),
  hasCommitsAhead: vi.fn(),
  readPrTemplate: vi.fn(),
}));

vi.mock('../../generation', () => ({
  runGeneration: runGenerationMock,
}));

vi.mock('../../config', () => ({
  getConfig: () => ({
    generation: {
      prGenerationTimeoutMs: 60_000,
    },
  }),
}));

vi.mock('./gitUtils', () => gitMocks);

import { createGitHubService } from './GitHubService';

function buildService(overrides: Partial<Parameters<typeof createGitHubService>[0]> = {}) {
  const session = {
    id: 'session-1',
    project_id: 'project-1',
    plan_item_id: 'plan-1',
    repo_id: 'repo-1',
    worktree_path: '/path/that/does/not/exist',
    branch_name: 'feature/support-attachments',
    base_branch: 'main',
  };
  const repo = {
    id: 'repo-1',
    path: '/repo',
  };
  const planItem = {
    id: 'plan-1',
    project_id: 'project-1',
    parent_id: null,
    title: 'Build media service attachment records',
    description: 'Media service needs durable attachment records before App can serve bytes.',
    intent: 'Persist attachment authorization state for the upload lifecycle.',
    acceptance_criteria: [
      'Authorize creates or reuses a pending attachment record for the sender.',
      'Finalize validates supported image MIME types before making an attachment available.',
      'Token resolve denies users who do not own the conversation.',
    ],
    external_key: 'PROJ-184',
  };

  const service = createGitHubService({
    devSessions: {
      get: vi.fn(() => session),
      updatePrInfo: vi.fn(),
    } as unknown as IDevSessionRepository,
    repos: {
      getById: vi.fn(() => repo),
    } as unknown as IRepoRepository,
    planItems: {
      get: vi.fn((id: string) => id === planItem.id ? planItem : null),
      getByProject: vi.fn(() => [planItem]),
    } as unknown as IPlanItemRepository,
    getPromptContent: (key: string) => {
      if (key === 'generation.pr_system_prompt') {
        return 'System prompt.\n\n{{description_guidance}}\n\nRespond with TITLE and BODY.';
      }
      if (key === 'generation.pr_description_instructions') {
        return 'Write a concise reviewer-oriented description.';
      }
      return '';
    },
    ...overrides,
  });

  return { service };
}

describe('GitHubService PR generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gitMocks.resolveBaseBranch.mockResolvedValue('main');
    gitMocks.getCurrentBranch.mockResolvedValue('feature/support-attachments');
    gitMocks.getCommittedDiff.mockResolvedValue([
      'diff --git a/service.py b/service.py',
      '-old behavior',
      '+new committed behavior',
    ].join('\n'));
    gitMocks.getCommitLog.mockResolvedValue('abc123 Add attachment records');
    gitMocks.hasCommitsAhead.mockResolvedValue(true);
    gitMocks.readPrTemplate.mockResolvedValue(null);
    runGenerationMock.mockResolvedValue({
      text: 'TITLE: PROJ-184: Add attachment records\nBODY:\nThis adds attachment records for the media service upload flow.',
      errors: [],
    });
  });

  it('builds raw PR context from the plan item without commit or change-count noise', async () => {
    const { service } = buildService();

    const result = await service.buildPrContext('session-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.body).toContain('## Description');
    expect(result.data.body).toContain('Media service needs durable attachment records');
    // GitHub renders the commit list and diffstat natively; keep them out of the seed/fallback body.
    expect(result.data.body).not.toContain('## Commits');
    expect(result.data.body).not.toContain('**Changes:**');
    expect(result.data.suggestedTitle).toBe('PROJ-184: Build media service attachment records');
  });

  it('passes plan intent and acceptance criteria as reference context', async () => {
    const { service } = buildService();

    const result = await service.generatePrContent('session-1', 'Raw title', 'Raw body', null, '', '');

    expect(result.ok).toBe(true);
    expect(gitMocks.getCommittedDiff).toHaveBeenCalledWith('/repo', 'main', 80_000);
    expect(runGenerationMock).toHaveBeenCalledTimes(1);
    const prompt = runGenerationMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Intent: Persist attachment authorization state for the upload lifecycle.');
    expect(prompt).toContain('- Finalize validates supported image MIME types before making an attachment available.');
    expect(prompt).toContain('+new committed behavior');
    const netDiffIndex = prompt.indexOf('[REFERENCE — Net Diff]');
    const commitHistoryIndex = prompt.indexOf('[REFERENCE — Commit History]');
    expect(netDiffIndex).toBeGreaterThan(-1);
    expect(commitHistoryIndex).toBeGreaterThan(netDiffIndex);
    expect(prompt).toContain('Authoritative current PR contents compared with main');
    expect(prompt).toContain('Secondary chronology for intent and grouping only');
  });

  it('uses an optional feature context document as reviewer context', async () => {
    const readProjectDocument = vi.fn(async () => ({
      ok: true as const,
      data: '# Support attachments\n\nThis feature lets App store bytes while media service owns access control.',
    }));
    runGenerationMock
      .mockResolvedValueOnce({
        text: [
          '- Larger feature: decouple attachment byte storage from media service authorization.',
          '- This PR adds the media service record lifecycle App will call before serving bytes.',
          '- Review the ownership boundary and denied cross-user access.',
        ].join('\n'),
        errors: [],
      })
      .mockResolvedValueOnce({
        text: 'TITLE: PROJ-184: Add attachment records\nBODY:\nThis PR establishes the media service attachment record lifecycle for the larger attachment upload feature.',
        errors: [],
      });
    const { service } = buildService({ readProjectDocument });

    const result = await service.generatePrContent(
      'session-1',
      'Raw title',
      'Raw body',
      null,
      '',
      '',
      'docs/support-attachments.md'
    );

    expect(result.ok).toBe(true);
    expect(readProjectDocument).toHaveBeenCalledWith('project-1', 'docs/support-attachments.md');
    expect(runGenerationMock).toHaveBeenCalledTimes(2);
    const extractionPrompt = runGenerationMock.mock.calls[0][0].prompt as string;
    expect(extractionPrompt).toContain('[REFERENCE - Feature Document]');
    expect(extractionPrompt).toContain('docs/support-attachments.md');
    expect(extractionPrompt.indexOf('[REFERENCE - Net Diff]')).toBeLessThan(
      extractionPrompt.indexOf('[REFERENCE - Commit History]')
    );
    const finalPrompt = runGenerationMock.mock.calls[1][0].prompt as string;
    expect(finalPrompt).toContain('[REFERENCE — Feature Context]');
    expect(finalPrompt).toContain('decouple attachment byte storage');
    expect(finalPrompt).toContain('media service record lifecycle');
  });

  it('uses the repository PR template as body guidance when present', async () => {
    gitMocks.readPrTemplate.mockResolvedValue('## Description\n\n## Manual Test Plan');
    const { service } = buildService();

    await service.buildPrContext('session-1');
    await service.generatePrContent(
      'session-1',
      'Raw title',
      'Raw body',
      '## Description\n\n## Manual Test Plan',
      '',
      ''
    );

    const systemPrompt = runGenerationMock.mock.calls[0][0].systemPrompt as string;
    expect(systemPrompt).toContain('MUST use the repository');
    expect(systemPrompt).toContain('## PR Template');
    expect(systemPrompt).toContain('## Manual Test Plan');
    // The overview must lead the body even when the template has no Description section.
    expect(systemPrompt).toContain('BEFORE the first template heading');
  });

  it('falls back to the primary checkout PR template when a worktree lacks one', async () => {
    const worktreePath = mkdtempSync(join(tmpdir(), 'kpm-pr-template-'));
    try {
      gitMocks.readPrTemplate
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('## Description\n\n## Manual Test Plan');

      const session = {
        id: 'session-1',
        project_id: 'project-1',
        plan_item_id: 'plan-1',
        repo_id: 'repo-1',
        worktree_path: worktreePath,
        branch_name: 'feature/support-attachments',
        base_branch: 'main',
      };
      const { service } = buildService({
        devSessions: {
          get: vi.fn(() => session),
          updatePrInfo: vi.fn(),
        } as unknown as IDevSessionRepository,
      });

      const result = await service.buildPrContext('session-1');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(gitMocks.readPrTemplate).toHaveBeenNthCalledWith(1, worktreePath);
      expect(gitMocks.readPrTemplate).toHaveBeenNthCalledWith(2, '/repo');
      expect(result.data.prTemplate).toBe('## Description\n\n## Manual Test Plan');
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('keeps repository template guidance when a custom system prompt omits the variable', async () => {
    const { service } = buildService({
      getPromptContent: (key: string) => {
        if (key === 'generation.pr_system_prompt') {
          return 'Custom PR system prompt.\n\nRespond with TITLE and BODY.';
        }
        if (key === 'generation.pr_description_instructions') {
          return 'Write a concise reviewer-oriented description.';
        }
        return '';
      },
    });

    await service.generatePrContent(
      'session-1',
      'Raw title',
      'Raw body',
      '## Description\n\n## Manual Test Plan',
      '',
      ''
    );

    const systemPrompt = runGenerationMock.mock.calls[0][0].systemPrompt as string;
    expect(systemPrompt).toContain('Custom PR system prompt.');
    expect(systemPrompt).toContain('Description guidance:');
    expect(systemPrompt).toContain('## PR Template');
    expect(systemPrompt).toContain('## Manual Test Plan');
  });

  it('resolves plan refs in generated PR content before returning it to the UI', async () => {
    const linkedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    runGenerationMock.mockResolvedValueOnce({
      text: `TITLE: PROJ-184: Add attachment records\nBODY:\nPart of @plan/${linkedId}.`,
      errors: [],
    });
    const planItem = {
      id: 'plan-1',
      project_id: 'project-1',
      parent_id: null,
      title: 'Build media service attachment records',
      description: null,
      intent: null,
      acceptance_criteria: null,
      external_key: 'PROJ-184',
    };
    const linkedItem = {
      ...planItem,
      id: linkedId,
      title: 'Linked feature',
      external_key: 'ENG-451',
      external_url: 'https://linear.app/example/issue/ENG-451/linked-feature',
    };
    const { service } = buildService({
      planItems: {
        get: vi.fn((id: string) => id === planItem.id ? planItem : null),
        getByProject: vi.fn(() => [planItem, linkedItem]),
      } as unknown as IPlanItemRepository,
    });

    const result = await service.generatePrContent('session-1', 'Raw title', 'Raw body', null, '', '');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.body).toBe('Part of ENG-451.');
  });

  it('falls back to raw context when the generated response is malformed', async () => {
    runGenerationMock.mockResolvedValueOnce({ text: 'No structured response', errors: [] });
    const { service } = buildService();

    const result = await service.generatePrContent('session-1', 'Raw title', 'Raw body', null, '', '');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ title: 'Raw title', body: 'Raw body' });
  });
});
