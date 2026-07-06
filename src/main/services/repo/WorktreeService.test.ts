import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as gitUtils from './gitUtils';
import { createWorktreeService, type WorktreeServiceDeps } from './WorktreeService';

vi.mock('./gitUtils', () => ({ gitExec: vi.fn() }));
vi.mock('./editorLauncher', () => ({ openDirectoryInCodeEditor: vi.fn() }));
vi.mock('fs', () => ({ existsSync: vi.fn(), rmSync: vi.fn() }));

const gitExecMock = vi.mocked(gitUtils.gitExec);
const existsSyncMock = vi.mocked(fs.existsSync);

const worktree = {
  id: 'w1',
  worktree_path: '/wt',
  branch_name: 'feature-x',
  plan_item_id: 'p1',
  project_id: 'proj1',
};

function makeService() {
  const deps = {
    worktrees: { get: vi.fn(), getByProject: vi.fn(), getByPlanItem: vi.fn(), delete: vi.fn() },
    planItems: { get: vi.fn() },
    projects: { get: vi.fn() },
    repos: { getByProject: vi.fn() },
  };
  return { service: createWorktreeService(deps as unknown as WorktreeServiceDeps), deps };
}

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(true);
  gitExecMock.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('WorktreeService end-of-options hardening', () => {
  it('pushBranch passes -- before the branch name', async () => {
    const { service, deps } = makeService();
    deps.worktrees.get.mockReturnValue(worktree);

    const result = await service.pushBranch('w1');

    expect(result.ok).toBe(true);
    expect(gitExecMock).toHaveBeenCalledWith(
      ['push', '-u', 'origin', '--', 'feature-x'],
      { cwd: '/wt' }
    );
  });

  it('destroyWorktree passes -- before the branch name for local and remote deletes', async () => {
    const { service, deps } = makeService();
    deps.worktrees.get.mockReturnValue(worktree);
    deps.planItems.get.mockReturnValue({ id: 'p1' });
    deps.projects.get.mockReturnValue({ id: 'proj1' });
    deps.repos.getByProject.mockReturnValue([{ path: '/repo' }]);

    const result = await service.destroyWorktree('w1');

    expect(result.ok).toBe(true);
    expect(gitExecMock).toHaveBeenCalledWith(['branch', '-D', '--', 'feature-x'], { cwd: '/repo' });
    expect(gitExecMock).toHaveBeenCalledWith(
      ['push', 'origin', '--delete', '--', 'feature-x'],
      { cwd: '/repo' }
    );
  });
});
