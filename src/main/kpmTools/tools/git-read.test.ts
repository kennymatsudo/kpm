import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createGitReadTools } from './git-read';

const gitExecCaptured = vi.fn();

vi.mock('../../services/repo/gitUtils', () => ({
  gitExecCaptured: (...args: unknown[]) => gitExecCaptured(...args),
}));

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const REPO_PATH = '/repos/kpm';

function makeTool(repos?: { path: string; active_worktree_path: string | null }[]) {
  const [readTool] = createGitReadTools({
    repos: { getByProject: () => (repos ?? [{ path: REPO_PATH, active_worktree_path: null }]) as never },
  });
  return readTool;
}

function callTool(readTool: ReturnType<typeof makeTool>, input: Record<string, unknown>) {
  return (readTool as any).handler({ projectId: PROJECT_ID, args: [], ...input });
}

beforeEach(() => {
  vi.clearAllMocks();
  gitExecCaptured.mockResolvedValue({ stdout: 'abc123 Add thing', stderr: '', exitCode: 0 });
});

describe('git_read', () => {
  it('runs the classified command in the connected repo', async () => {
    const result = await callTool(makeTool(), { operation: 'log', args: ['--oneline', '-5'] });

    expect(result.isError).toBeFalsy();
    expect(gitExecCaptured).toHaveBeenCalledWith(
      ['log', '--oneline', '-5'],
      expect.objectContaining({ cwd: REPO_PATH })
    );
  });

  it('runs in the active worktree when the repo has one', async () => {
    const readTool = makeTool([{ path: REPO_PATH, active_worktree_path: '/repos/kpm-worktrees/feature' }]);

    await callTool(readTool, { operation: 'status' });

    expect(gitExecCaptured).toHaveBeenCalledWith(
      ['status'],
      expect.objectContaining({ cwd: '/repos/kpm-worktrees/feature' })
    );
  });

  it.each([
    ['a write flag on a read subcommand', { operation: 'branch', args: ['-D', 'feature'] }],
    ['a command that writes a file', { operation: 'log', args: ['--output=/tmp/out'] }],
    ['a command that runs a program', { operation: 'diff', args: ['--ext-diff'] }],
    ['a fetch refspec that can move a local branch', { operation: 'fetch', args: ['origin', 'main:main'] }],
  ])('refuses %s without invoking git', async (_case, input) => {
    const result = await callTool(makeTool(), input);

    expect(result.isError).toBe(true);
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });

  it('reports a non-zero exit without treating it as a tool error', async () => {
    gitExecCaptured.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });

    const result = await callTool(makeTool(), { operation: 'grep', args: ['nothing-matches'] });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text).exitCode).toBe(1);
  });

  it('requires repoPath when several repos are connected', async () => {
    const readTool = makeTool([
      { path: '/repos/one', active_worktree_path: null },
      { path: '/repos/two', active_worktree_path: null },
    ]);

    const result = await callTool(readTool, { operation: 'status' });

    expect(result.isError).toBe(true);
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });
});
