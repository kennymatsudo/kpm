import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createGitPushTools } from './git-push';
import type { WriteDecision } from '../../chat/writeGrants';

const resolveCurrentBranch = vi.fn();
const publishBranch = vi.fn();

vi.mock('../../services/repo/branchFacts', () => ({
  resolveCurrentBranch: (...args: unknown[]) => resolveCurrentBranch(...args),
}));

vi.mock('../../services/repo/gitWrites', () => ({
  publishBranch: (...args: unknown[]) => publishBranch(...args),
}));

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const REPO_PATH = '/repos/kpm';

function makeTool(repos?: { path: string; active_worktree_path: string | null }[]) {
  const requestWriteAccess = vi.fn(async (): Promise<WriteDecision> => ({ allowed: true }));
  const [pushTool] = createGitPushTools({
    repos: { getByProject: () => (repos ?? [{ path: REPO_PATH, active_worktree_path: null }]) as never },
    requestWriteAccess,
  });
  return { pushTool, requestWriteAccess };
}

function callTool(pushTool: ReturnType<typeof makeTool>['pushTool'], input: Record<string, unknown> = {}) {
  return (pushTool as any).handler({ projectId: PROJECT_ID, remote: 'origin', ...input });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveCurrentBranch.mockResolvedValue('feature/add-thing');
  publishBranch.mockResolvedValue({ ok: true, summary: 'pushed', setUpstream: false });
});

describe('git_push', () => {
  it('publishes the checked-out branch of the resolved repo', async () => {
    const { pushTool } = makeTool();
    const result = await callTool(pushTool, { remote: 'upstream' });

    expect(result.isError).toBeFalsy();
    expect(publishBranch).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: REPO_PATH, remote: 'upstream', branch: 'feature/add-thing' })
    );
  });

  it('hands the write grant through as the authorization', async () => {
    const { pushTool, requestWriteAccess } = makeTool();
    await callTool(pushTool);

    const authorization = publishBranch.mock.calls[0][0].authorization;
    expect(authorization.kind).toBe('projectWriteGrant');
    await authorization.request();
    expect(requestWriteAccess).toHaveBeenCalledWith({
      remote: 'origin',
      branch: 'feature/add-thing',
      repoPath: REPO_PATH,
    });
  });

  it('surfaces a refusal as a tool error', async () => {
    const { pushTool } = makeTool();
    publishBranch.mockResolvedValue({ ok: false, kind: 'refused', reason: 'protected branch' });

    const result = await callTool(pushTool);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/protected branch/);
  });

  it('surfaces a failed push with git output', async () => {
    const { pushTool } = makeTool();
    publishBranch.mockResolvedValue({ ok: false, kind: 'failed', reason: '! [rejected] non-fast-forward' });

    const result = await callTool(pushTool);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/non-fast-forward/);
  });

  it('requires repoPath when several repos are connected', async () => {
    const { pushTool } = makeTool([
      { path: '/repos/one', active_worktree_path: null },
      { path: '/repos/two', active_worktree_path: null },
    ]);

    const result = await callTool(pushTool);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/pass repoPath/);
    expect(publishBranch).not.toHaveBeenCalled();
  });

  it('pushes from the active worktree when the repo has one', async () => {
    const { pushTool } = makeTool([{ path: REPO_PATH, active_worktree_path: '/repos/kpm-worktrees/feature' }]);

    await callTool(pushTool);

    expect(publishBranch).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repos/kpm-worktrees/feature' })
    );
  });
});
