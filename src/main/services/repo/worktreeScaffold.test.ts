import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import * as fs from 'fs';
import * as gitUtils from './gitUtils';
import { scaffoldWorktree } from './worktreeScaffold';

vi.mock('./gitUtils', () => ({
  gitExec: vi.fn(),
  getCurrentBranch: vi.fn(),
  resolveUpstreamBranch: vi.fn(),
  getMergeBase: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const gitExecMock = vi.mocked(gitUtils.gitExec);
const getCurrentBranchMock = vi.mocked(gitUtils.getCurrentBranch);
const existsSyncMock = vi.mocked(fs.existsSync);

const worktreePath = '/base/wt/mybranch';
const worktreesDir = path.dirname(worktreePath);

beforeEach(() => {
  vi.clearAllMocks();
  // Parent dir exists; the worktree itself does not yet.
  existsSyncMock.mockImplementation((p) => p === worktreesDir);
  getCurrentBranchMock.mockResolvedValue('main');
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
