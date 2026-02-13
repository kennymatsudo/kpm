import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Worktree } from '../../src/shared/base-types';
import { createWorktreeService } from '../../src/main/services/repo/WorktreeService';
import { gitExec } from '../../src/main/services/repo/gitUtils';

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(),
  },
}));

vi.mock('../../src/main/services/repo/gitUtils', () => ({
  gitExec: vi.fn(),
}));

const gitExecMock = vi.mocked(gitExec);

let tempRoots: string[] = [];

function mkTemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function createWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'worktree-1',
    plan_item_id: 'plan-item-1',
    project_id: 'project-1',
    worktree_path: '/tmp/worktree',
    branch_name: 'feature/safe',
    ...overrides,
  };
}

function createDeps(worktree: Worktree, repoPath: string) {
  const worktrees = {
    getByProject: vi.fn(() => [worktree]),
    get: vi.fn((id: string) => (id === worktree.id ? worktree : undefined)),
    getByPlanItem: vi.fn(() => worktree),
    create: vi.fn(),
    updateLastOpened: vi.fn(),
    delete: vi.fn(),
  };

  const deps = {
    worktrees,
    planItems: {
      get: vi.fn((id: string) => (id === worktree.plan_item_id ? { id } : undefined)),
    },
    projects: {
      get: vi.fn((id: string) => (id === worktree.project_id ? { id } : undefined)),
    },
    repos: {
      getByProject: vi.fn((id: string) => (
        id === worktree.project_id
          ? [{ id: 'repo-1', project_id: id, path: repoPath }]
          : []
      )),
    },
  };

  return { deps: deps as unknown as Parameters<typeof createWorktreeService>[0], worktrees };
}

beforeEach(() => {
  vi.clearAllMocks();
  gitExecMock.mockResolvedValue({ stdout: '', stderr: '' });
});

afterEach(() => {
  for (const dir of tempRoots) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  tempRoots = [];
});

describe('WorktreeService command safety', () => {
  it('passes branch names with shell metacharacters as literal git args when pushing', async () => {
    const repoPath = mkTemp('worktree-repo-');
    const worktreePath = mkTemp('worktree-path-');
    const maliciousBranch = 'feat"; touch /tmp/pwn #';
    const worktree = createWorktree({
      worktree_path: worktreePath,
      branch_name: maliciousBranch,
    });
    const { deps } = createDeps(worktree, repoPath);
    const service = createWorktreeService(deps);

    const result = await service.pushBranch(worktree.id);

    expect(result.ok).toBe(true);
    expect(gitExecMock).toHaveBeenCalledWith(
      ['push', '-u', 'origin', maliciousBranch],
      { cwd: worktreePath }
    );
  });

  it('uses argumentized git calls for force-delete flow', async () => {
    const repoPath = mkTemp('worktree-repo-');
    const worktreePath = path.join(repoPath, 'wt"; echo owned #');
    fs.mkdirSync(worktreePath, { recursive: true });
    const maliciousBranch = 'topic"; rm -rf ~ #';
    const worktree = createWorktree({
      worktree_path: worktreePath,
      branch_name: maliciousBranch,
    });
    const { deps, worktrees } = createDeps(worktree, repoPath);
    const service = createWorktreeService(deps);

    const result = await service.destroyWorktree(worktree.id);

    expect(result.ok).toBe(true);
    expect(gitExecMock).toHaveBeenCalledWith(
      ['worktree', 'remove', worktreePath, '--force'],
      { cwd: repoPath }
    );
    expect(gitExecMock).toHaveBeenCalledWith(
      ['branch', '-D', maliciousBranch],
      { cwd: repoPath }
    );
    expect(gitExecMock).toHaveBeenCalledWith(
      ['push', 'origin', '--delete', maliciousBranch],
      { cwd: repoPath }
    );
    expect(worktrees.delete).toHaveBeenCalledWith(worktree.id);
  });

  it('uses argumentized git calls for delete flow', async () => {
    const repoPath = mkTemp('worktree-repo-');
    const worktreePath = path.join(repoPath, 'wt"; rm -rf / #');
    fs.mkdirSync(worktreePath, { recursive: true });
    const maliciousBranch = 'bugfix"; whoami #';
    const worktree = createWorktree({
      worktree_path: worktreePath,
      branch_name: maliciousBranch,
    });
    const { deps, worktrees } = createDeps(worktree, repoPath);
    const service = createWorktreeService(deps);

    const result = await service.deleteWorktree(worktree.id, true);

    expect(result.ok).toBe(true);
    expect(gitExecMock).toHaveBeenCalledWith(
      ['worktree', 'remove', worktreePath, '--force'],
      { cwd: repoPath }
    );
    expect(gitExecMock).toHaveBeenCalledWith(
      ['branch', '-d', maliciousBranch],
      { cwd: repoPath }
    );
    expect(worktrees.delete).toHaveBeenCalledWith(worktree.id);
  });
});
