import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IDevSessionRepository, IPlanItemRepository, IRepoRepository } from '../../db/interfaces';

const runGenerationMock = vi.hoisted(() => vi.fn());
const gitMocks = vi.hoisted(() => ({
  getCommittedDiff: vi.fn(),
  getCommitLog: vi.fn(),
  countCommitsAhead: vi.fn(),
  readPrTemplate: vi.fn(),
}));
const branchMocks = vi.hoisted(() => ({
  resolveCurrentBranch: vi.fn(),
  resolveBaseBranch: vi.fn(),
  classifyPushTarget: vi.fn(),
  resolveUpstreamBranchName: vi.fn(),
}));
const ghMocks = vi.hoisted(() => ({
  probePrReviewState: vi.fn(),
  createPr: vi.fn(),
  getPrForBranch: vi.fn(),
  isBranchPushed: vi.fn(),
  getPrByNumber: vi.fn(),
  getRepoSlug: vi.fn(),
  describeGhFailure: vi.fn(),
}));

vi.mock('../../generation', () => ({
  runGeneration: runGenerationMock,
}));

vi.mock('../../config', () => ({
  getConfig: () => ({
    generation: {
      prGenerationTimeoutMs: 60_000,
    },
    agentSession: {
      prCreateTimeoutMs: 120_000,
    },
    claude: {
      debug: false,
    },
  }),
}));

vi.mock('./gitUtils', () => gitMocks);

vi.mock('./branchFacts', () => branchMocks);

vi.mock('./ghUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  ...ghMocks,
}));

import { GhTimeoutError } from './ghUtils';
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
      getByProject: vi.fn(() => [session]),
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
    branchMocks.resolveBaseBranch.mockResolvedValue('main');
    branchMocks.resolveCurrentBranch.mockResolvedValue('feature/support-attachments');
    branchMocks.classifyPushTarget.mockResolvedValue({ ok: true, branch: 'feature/support-attachments' });
    gitMocks.getCommittedDiff.mockResolvedValue([
      'diff --git a/service.py b/service.py',
      '-old behavior',
      '+new committed behavior',
    ].join('\n'));
    gitMocks.getCommitLog.mockResolvedValue('abc123 Add attachment records');
    gitMocks.countCommitsAhead.mockResolvedValue(3);
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
    expect(systemPrompt).toContain('Use its section headings');
    expect(systemPrompt).toContain('## PR Template');
    expect(systemPrompt).toContain('## Manual Test Plan');
    // The change list must lead the body even when the template has no Description section.
    expect(systemPrompt).toContain('before the first template heading');
  });

  it('falls back to the primary checkout PR template when a worktree lacks one', async () => {
    const worktreePath = mkdtempSync(join(tmpdir(), 'kpm-pr-template-'));
    try {
      mkdirSync(join(worktreePath, '.git'));
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

  it('uses the primary checkout when an existing session path is not a Git worktree', async () => {
    const staleWorktreePath = mkdtempSync(join(tmpdir(), 'kpm-stale-worktree-'));
    try {
      ghMocks.probePrReviewState.mockResolvedValue({ digest: 'unchanged' });
      const session = {
        id: 'session-1',
        project_id: 'project-1',
        plan_item_id: 'plan-1',
        repo_id: 'repo-1',
        worktree_path: staleWorktreePath,
        branch_name: 'feature/support-attachments',
        base_branch: 'main',
        pr_number: 42,
      };
      const { service } = buildService({
        devSessions: {
          get: vi.fn(() => session),
          updatePrInfo: vi.fn(),
        } as unknown as IDevSessionRepository,
      });

      const result = await service.probePrReviewState('session-1');

      expect(result).toEqual({ ok: true, data: { digest: 'unchanged' } });
      expect(ghMocks.probePrReviewState).toHaveBeenCalledWith('/repo', 42);
    } finally {
      rmSync(staleWorktreePath, { recursive: true, force: true });
    }
  });

  it('uses the primary checkout for a linked-PR session with no worktree path', async () => {
    const unrelatedCheckout = mkdtempSync(join(tmpdir(), 'kpm-unrelated-checkout-'));
    const originalCwd = process.cwd();
    try {
      mkdirSync(join(unrelatedCheckout, '.git'));
      process.chdir(unrelatedCheckout);
      ghMocks.probePrReviewState.mockResolvedValue({ digest: 'unchanged' });
      const session = {
        id: 'session-1',
        project_id: 'project-1',
        plan_item_id: 'plan-1',
        repo_id: 'repo-1',
        worktree_path: '',
        branch_name: '',
        base_branch: '',
        pr_number: 42,
      };
      const { service } = buildService({
        devSessions: {
          get: vi.fn(() => session),
          updatePrInfo: vi.fn(),
        } as unknown as IDevSessionRepository,
      });

      await service.probePrReviewState('session-1');

      expect(ghMocks.probePrReviewState).toHaveBeenCalledWith('/repo', 42);
    } finally {
      process.chdir(originalCwd);
      rmSync(unrelatedCheckout, { recursive: true, force: true });
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

describe('GitHubService.createPr after gh times out', () => {
  const openPr = {
    number: 42,
    url: 'https://github.com/example/repo/pull/42',
    state: 'OPEN',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    branchMocks.resolveBaseBranch.mockResolvedValue('main');
    branchMocks.classifyPushTarget.mockResolvedValue({ ok: true, branch: 'feature/support-attachments' });
    gitMocks.countCommitsAhead.mockResolvedValue(1);
    ghMocks.isBranchPushed.mockResolvedValue(true);
    ghMocks.createPr.mockRejectedValue(new GhTimeoutError('gh pr create did not finish within 120 seconds.'));
  });

  it('links the pull request GitHub created before the kill', async () => {
    ghMocks.getPrForBranch.mockResolvedValue(openPr);
    const updatePrInfo = vi.fn();
    const { service } = buildService({
      devSessions: {
        get: vi.fn(() => ({
          id: 'session-1',
          project_id: 'project-1',
          repo_id: 'repo-1',
          worktree_path: '/path/that/does/not/exist',
          branch_name: 'feature/support-attachments',
          base_branch: 'main',
        })),
        updatePrInfo,
      } as unknown as IDevSessionRepository,
    });

    const result = await service.createPr('session-1', 'Title', 'Body', true);

    expect(result).toEqual({ ok: true, data: { number: 42, url: openPr.url } });
    expect(updatePrInfo).toHaveBeenCalledWith('session-1', 42, openPr.url, 'OPEN', null, true);
  });

  it.each([
    ['no pull request exists for the branch', null],
    ['the branch only has a closed pull request', { ...openPr, state: 'CLOSED' }],
  ])('reports the timeout when %s', async (_case, found) => {
    ghMocks.getPrForBranch.mockResolvedValue(found);
    const { service } = buildService();

    const result = await service.createPr('session-1', 'Title', 'Body');

    expect(result).toEqual({ ok: false, error: 'gh pr create did not finish within 120 seconds.' });
  });
});

describe('GitHubService.createPr export boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchMocks.resolveBaseBranch.mockResolvedValue('main');
    branchMocks.classifyPushTarget.mockResolvedValue({ ok: true, branch: 'feature/support-attachments' });
    gitMocks.countCommitsAhead.mockResolvedValue(1);
    ghMocks.isBranchPushed.mockResolvedValue(true);
    ghMocks.createPr.mockResolvedValue({ number: 7, url: 'https://github.com/example/repo/pull/7' });
  });

  it('rewrites plan refs in the title as well as the body', async () => {
    const planItem = { id: '11111111-1111-4111-8111-111111111111', project_id: 'project-1', title: 'Task', external_key: 'PROJ-184' };
    const { service } = buildService({
      planItems: { getByProject: vi.fn(() => [planItem]) } as unknown as IPlanItemRepository,
    });

    await service.createPr('session-1', `Fix @plan/${planItem.id}`, `Part of @plan/${planItem.id}`);

    const sent = ghMocks.createPr.mock.calls[0][1];
    expect(sent.title).toBe('Fix Task');
    expect(sent.body).toBe('Part of Task\n\nCloses PROJ-184\n');
  });
});

describe('GitHubService.linkPr', () => {
  const pr12 = {
    number: 12,
    url: 'https://github.com/org/a/pull/12',
    state: 'OPEN',
    reviewDecision: null,
    isDraft: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ghMocks.getRepoSlug.mockResolvedValue('org/a');
    ghMocks.getPrByNumber.mockResolvedValue(pr12);
  });

  it('rejects a URL from another repository instead of linking the same number here', async () => {
    const { service } = buildService();

    const result = await service.linkPr('session-1', 'https://github.com/org/b/pull/12');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('org/b');
    expect(result.error).toContain('org/a');
    expect(ghMocks.getPrByNumber).not.toHaveBeenCalled();
  });

  it('accepts a URL for the session repository regardless of case', async () => {
    const { service } = buildService();

    const result = await service.linkPr('session-1', 'https://github.com/Org/A/pull/12');

    expect(result).toEqual({ ok: true, data: pr12 });
    expect(ghMocks.getPrByNumber).toHaveBeenCalledWith('/repo', 12);
  });

  it('does not need the repository slug for a bare number', async () => {
    const { service } = buildService();

    const result = await service.linkPr('session-1', '#12');

    expect(result.ok).toBe(true);
    expect(ghMocks.getRepoSlug).not.toHaveBeenCalled();
  });

  it('reports why gh failed rather than calling the PR missing', async () => {
    const authError = Object.assign(new Error('gh failed'), { stderr: 'HTTP 401: Bad credentials' });
    ghMocks.getPrByNumber.mockRejectedValue(authError);
    ghMocks.describeGhFailure.mockResolvedValue('HTTP 401: Bad credentials\n\nRun `gh auth refresh`.');
    const { service } = buildService();

    const result = await service.linkPr('session-1', '12');

    expect(result).toEqual({ ok: false, error: 'HTTP 401: Bad credentials\n\nRun `gh auth refresh`.' });
    expect(ghMocks.describeGhFailure).toHaveBeenCalledWith('/repo', authError);
  });

  it('says not found only when gh found no such PR', async () => {
    ghMocks.getPrByNumber.mockResolvedValue(null);
    const { service } = buildService();

    const result = await service.linkPr('session-1', 'https://github.com/org/a/pull/99');

    expect(result).toEqual({ ok: false, error: 'PR #99 not found in org/a.' });
  });

  it('refuses a PR another task already has', async () => {
    const devSessions = {
      get: vi.fn(() => ({ id: 'session-1', project_id: 'project-1', plan_item_id: 'plan-1', repo_id: 'repo-1', worktree_path: '', branch_name: '' })),
      getByProject: vi.fn(() => [{ id: 'session-2', plan_item_id: 'plan-2', repo_id: 'repo-1', pr_number: 12 }]),
      updatePrInfo: vi.fn(),
    };
    const { service } = buildService({
      devSessions: devSessions as unknown as IDevSessionRepository,
      planItems: { get: vi.fn(() => ({ id: 'plan-2', title: 'Other task' })) } as unknown as IPlanItemRepository,
    });

    const result = await service.linkPr('session-1', '12');

    expect(result).toEqual({ ok: false, error: 'PR #12 is already linked to "Other task". Unlink it there first.' });
    expect(devSessions.updatePrInfo).not.toHaveBeenCalled();
  });

  it.each([
    ['refuses a PR from another branch', 'other-branch', null, false],
    ['accepts a PR opened from the branch it was pushed as', 'pushed-name', 'pushed-name', true],
    ['accepts a PR on the worktree branch', 'feature/support-attachments', null, true],
  ])('%s', async (_case, headRefName, upstreamName, linked) => {
    ghMocks.getPrByNumber.mockResolvedValue({ ...pr12, headRefName });
    branchMocks.resolveUpstreamBranchName.mockResolvedValue(upstreamName);
    const { service } = buildService();

    const result = await service.linkPr('session-1', '12');

    expect(result.ok).toBe(linked);
    if (!linked) expect(result).toMatchObject({ error: 'PR #12 is on branch other-branch, but this task\'s worktree is on feature/support-attachments.' });
  });
});

describe('GitHubService.linkPrToItem', () => {
  const pr12 = { number: 12, url: 'https://github.com/org/a/pull/12', state: 'OPEN', reviewDecision: null, isDraft: false };
  const planItem = { id: 'plan-1', project_id: 'project-1', title: 'Task' };

  function buildItemService(sessions: Record<string, unknown>[]) {
    const devSessions = {
      getByProject: vi.fn(() => sessions),
      create: vi.fn((session) => session),
      updatePrInfo: vi.fn(),
    };
    const { service } = buildService({
      devSessions: devSessions as unknown as IDevSessionRepository,
      repos: { getById: vi.fn((id: string) => ({ id, path: `/${id}` })) } as unknown as IRepoRepository,
      planItems: { get: vi.fn(() => planItem) } as unknown as IPlanItemRepository,
    });
    return { service, devSessions };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    ghMocks.getPrByNumber.mockResolvedValue(pr12);
  });

  it('links onto the task\'s session in the chosen repo, not its newest session elsewhere', async () => {
    const { service, devSessions } = buildItemService([
      { id: 'newest-in-b', plan_item_id: 'plan-1', repo_id: 'repo-b', worktree_path: '', branch_name: '' },
      { id: 'older-in-a', plan_item_id: 'plan-1', repo_id: 'repo-a', worktree_path: '', branch_name: '' },
    ]);

    const result = await service.linkPrToItem('plan-1', 'repo-a', '12');

    expect(result.ok).toBe(true);
    expect(devSessions.updatePrInfo).toHaveBeenCalledWith('older-in-a', 12, pr12.url, 'OPEN', null, false);
    expect(devSessions.create).not.toHaveBeenCalled();
  });

  it('leaves no stub session behind when the PR is refused', async () => {
    ghMocks.getPrByNumber.mockResolvedValue(null);
    const { service, devSessions } = buildItemService([]);

    const result = await service.linkPrToItem('plan-1', 'repo-a', '12');

    expect(result).toEqual({ ok: false, error: 'PR #12 not found in this repository.' });
    expect(devSessions.create).not.toHaveBeenCalled();
  });

  it('creates a stub session for a task with none in that repo', async () => {
    const { service, devSessions } = buildItemService([]);

    const result = await service.linkPrToItem('plan-1', 'repo-a', '12');

    expect(result.ok).toBe(true);
    expect(devSessions.create).toHaveBeenCalledWith(expect.objectContaining({ plan_item_id: 'plan-1', repo_id: 'repo-a', worktree_path: '' }));
    expect(ghMocks.getPrByNumber).toHaveBeenCalledWith('/repo-a', 12);
  });
});
