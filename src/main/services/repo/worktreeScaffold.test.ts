import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import * as fs from 'fs';
import * as gitUtils from './gitUtils';
import * as branchFacts from './branchFacts';
import { scaffoldWorktree } from './worktreeScaffold';

vi.mock('./gitUtils', () => ({
  gitExec: vi.fn(),
  resolveUpstreamBranch: vi.fn(),
  getMergeBase: vi.fn(),
}));

vi.mock('./branchFacts', () => ({
  resolveCurrentBranch: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const gitExecMock = vi.mocked(gitUtils.gitExec);
const resolveCurrentBranchMock = vi.mocked(branchFacts.resolveCurrentBranch);
const existsSyncMock = vi.mocked(fs.existsSync);

const worktreePath = '/base/wt/mybranch';
const worktreesDir = path.dirname(worktreePath);

beforeEach(() => {
  vi.clearAllMocks();
  // Parent dir exists; the worktree itself does not yet.
  existsSyncMock.mockImplementation((p) => p === worktreesDir);
  resolveCurrentBranchMock.mockResolvedValue('main');
});

describe('scaffoldWorktree end-of-options hardening', () => {
  it('passes -- before the path/base positionals when creating a new branch', async () => {
    gitExecMock.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await scaffoldWorktree({
      worktreePath,
      branchName: 'feature-x',
      baseBranch: 'main',
      repoPath: '/repo',
    });

    expect(result).toEqual({ ok: true });
    expect(gitExecMock).toHaveBeenCalledWith(
      ['worktree', 'add', '-b', 'feature-x', '--', worktreePath, 'main'],
      { cwd: '/repo' }
    );
  });

  it('passes -- before the positionals on the existing-branch retry form', async () => {
    gitExecMock
      .mockRejectedValueOnce(new Error('a branch named feature-x already exists'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    const result = await scaffoldWorktree({
      worktreePath,
      branchName: 'feature-x',
      baseBranch: 'main',
      repoPath: '/repo',
    });

    expect(result).toEqual({ ok: true });
    expect(gitExecMock).toHaveBeenNthCalledWith(
      2,
      ['worktree', 'add', '--', worktreePath, 'feature-x'],
      { cwd: '/repo' }
    );
  });
});

describe('scaffoldWorktree error semantics', () => {
  it('does nothing when the worktree path already exists', async () => {
    existsSyncMock.mockImplementation((p) => p === worktreesDir || p === worktreePath);

    const result = await scaffoldWorktree({
      worktreePath,
      branchName: 'feature-x',
      baseBranch: 'main',
      repoPath: '/repo',
    });

    expect(result).toEqual({ ok: true });
    expect(gitExecMock).not.toHaveBeenCalled();
  });

  it('refuses to shadow the branch checked out in the primary repo', async () => {
    resolveCurrentBranchMock.mockResolvedValue('feature-x');

    const result = await scaffoldWorktree({
      worktreePath,
      branchName: 'feature-x',
      baseBranch: 'main',
      repoPath: '/repo',
    });

    expect(result).toEqual({ ok: false, kind: 'checkedOutInMainRepo' });
    expect(gitExecMock).not.toHaveBeenCalled();
  });

  it('reports checkedOutElsewhere when the branch is already checked out in another worktree', async () => {
    gitExecMock
      .mockRejectedValueOnce(new Error('a branch named feature-x already exists'))
      .mockRejectedValueOnce(new Error("fatal: 'feature-x' is already checked out at '/other/wt'"));

    const result = await scaffoldWorktree({
      worktreePath,
      branchName: 'feature-x',
      baseBranch: 'main',
      repoPath: '/repo',
    });

    expect(result).toEqual({ ok: false, kind: 'checkedOutElsewhere' });
  });

  it('reports createFailed with both error messages when neither attempt succeeds', async () => {
    gitExecMock
      .mockRejectedValueOnce(new Error('outer failure'))
      .mockRejectedValueOnce(new Error('inner failure'));

    const result = await scaffoldWorktree({
      worktreePath,
      branchName: 'feature-x',
      baseBranch: 'main',
      repoPath: '/repo',
    });

    expect(result).toEqual({
      ok: false,
      kind: 'createFailed',
      outerMessage: 'outer failure',
      innerMessage: 'inner failure',
    });
  });
});
