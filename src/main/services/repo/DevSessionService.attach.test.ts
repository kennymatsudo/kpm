import { execFileSync } from 'child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevSessionService } from './DevSessionService';

const getPrForBranch = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('./ghUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  getPrForBranch,
}));

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

const item = {
  id: 'item-1',
  project_id: 'project-1',
  parent_id: null,
  title: 'Outside work',
  description: 'Started in a terminal',
  intent: null,
  acceptance_criteria: [],
  external_key: null,
  code_refs: null,
  work_brief_revision: 3,
};

describe('DevSessionService.attachWorktree', () => {
  let root: string;
  let repoPath: string;
  let worktreePath: string;
  let forkSha: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'attach-session-')));
    repoPath = join(root, 'repo');
    execFileSync('git', ['init', '-b', 'main', repoPath]);
    runGit(repoPath, ['config', 'user.name', 'Test User']);
    runGit(repoPath, ['config', 'user.email', 'test@example.com']);
    writeFileSync(join(repoPath, 'a.txt'), 'a\n');
    runGit(repoPath, ['add', 'a.txt']);
    runGit(repoPath, ['commit', '-m', 'base']);
    forkSha = runGit(repoPath, ['rev-parse', 'HEAD']);

    worktreePath = join(root, 'feature');
    runGit(repoPath, ['worktree', 'add', '-b', 'feature/outside', worktreePath]);
    writeFileSync(join(worktreePath, 'a.txt'), 'changed outside KPM\n');
    runGit(worktreePath, ['commit', '-am', 'outside commit']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    getPrForBranch.mockReset();
  });

  function buildService(existingSessions: Record<string, unknown>[] = []) {
    const create = vi.fn((session) => ({
      ...session,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      completed_at: null,
    }));
    const deleteSession = vi.fn();
    const service = createDevSessionService({
      planItems: { get: vi.fn(() => item), getByProject: vi.fn(() => [item]) },
      projects: { get: vi.fn(() => ({ id: 'project-1', name: 'Project' })) },
      repos: { getById: vi.fn(() => ({ id: 'repo-1', path: repoPath })) },
      devSessions: { getByProject: vi.fn(() => existingSessions), create, delete: deleteSession },
      appSettings: { get: vi.fn() },
    } as never);
    return { service, create, deleteSession };
  }

  it('creates an inactive session on the worktree branch, measured from where it left main', async () => {
    const { service } = buildService();

    const result = await service.attachWorktree('item-1', 'repo-1', worktreePath);

    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      plan_item_id: 'item-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature/outside',
      base_branch: 'main',
      base_sha: forkSha,
      status: 'inactive',
      worktree_origin: 'attached',
      playbook_snapshot: null,
      work_brief_revision: 3,
    });
    expect(result.data.initial_instructions).toContain('Started in a terminal');
  });

  const prOnly = {
    id: 'stub-1', plan_item_id: 'item-1', repo_id: 'repo-1', worktree_path: '',
    pr_number: 42, pr_url: 'https://github.com/o/r/pull/42', pr_state: 'open', review_state: null, pr_is_draft: true,
  };

  it('folds in a PR-only session from Link PR instead of leaving two sessions', async () => {
    getPrForBranch.mockResolvedValue({ number: 42 });
    const { service, deleteSession } = buildService([prOnly]);

    const result = await service.attachWorktree('item-1', 'repo-1', worktreePath);

    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({ pr_number: 42, pr_url: prOnly.pr_url, pr_is_draft: true });
    expect(deleteSession).toHaveBeenCalledWith('stub-1');
  });

  it.each([
    ['is on a different branch', { number: 7 }],
    ['cannot be looked up', null],
  ])('leaves a linked PR on its own session when it %s', async (_case, branchPr) => {
    getPrForBranch.mockResolvedValue(branchPr);
    const { service, deleteSession } = buildService([prOnly]);

    const result = await service.attachWorktree('item-1', 'repo-1', worktreePath);

    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({ pr_number: null, pr_url: null });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('refuses when the task already has a worktree', async () => {
    const { service, create } = buildService([
      { id: 's-1', plan_item_id: 'item-1', repo_id: 'repo-1', worktree_path: join(root, 'kpm-made') },
    ]);

    const result = await service.attachWorktree('item-1', 'repo-1', worktreePath);

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('already has a worktree') });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a worktree another task already owns', async () => {
    const { service, create } = buildService([
      { id: 's-2', plan_item_id: 'item-2', repo_id: 'repo-1', worktree_path: worktreePath },
    ]);

    const result = await service.attachWorktree('item-1', 'repo-1', worktreePath);

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('another task') });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['keeps the branch of a worktree made outside KPM', 'attached', 'feature/outside'],
    ['deletes the branch of a worktree KPM made', 'kpm', ''],
  ])('destroy %s', async (_case, origin, remainingBranch) => {
    const session = {
      id: 'session-1', plan_item_id: 'item-1', repo_id: 'repo-1',
      worktree_path: worktreePath, branch_name: 'feature/outside', worktree_origin: origin,
    };
    const service = createDevSessionService({
      repos: { getById: vi.fn(() => ({ id: 'repo-1', path: repoPath })) },
      devSessions: { get: vi.fn(() => session), delete: vi.fn() },
    } as never);

    const result = await service.destroySession('session-1');

    expect(result.ok).toBe(true);
    expect(runGit(repoPath, ['branch', '--list', 'feature/outside'])).toBe(remainingBranch);
  });
});
