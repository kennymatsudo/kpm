import { describe, expect, it, vi } from 'vitest';
import { createBoardTools, type BoardToolDeps } from './board';
import { runWithToolExecutionContext } from '../runtime';
import type { WorktreeCandidate } from '../../../shared/boardChanges';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const repoA = { id: 'repo-a', project_id: 'project-1', path: '/code/a', active_worktree_path: null };
const repoB = { id: 'repo-b', project_id: 'project-1', path: '/code/b', active_worktree_path: null };
const item = { id: ITEM_ID, project_id: 'project-1', title: 'Outside work' };

function makeTools(options: {
  worktrees?: Record<string, WorktreeCandidate[]>;
  repos?: typeof repoA[];
  overrides?: Partial<BoardToolDeps>;
} = {}) {
  const worktrees = options.worktrees ?? {};
  const onBoardChange = vi.fn();
  const deps: BoardToolDeps = {
    repos: { getByProject: vi.fn(() => options.repos ?? [repoA, repoB]) },
    planItems: { get: vi.fn((id: string) => (id === ITEM_ID ? item : undefined)) } as never,
    listAttachableWorktrees: vi.fn(async (repoId: string) => ({ ok: true as const, data: worktrees[repoId] ?? [] })),
    previewAttachWorktree: vi.fn(async (_itemId: string, _repoId: string, worktreePath: string) => ({
      ok: true as const,
      data: { item, projectId: 'project-1', repo: repoB, worktreePath, branchName: 'feature/x', carriedPr: { pr_number: 42 } },
    })) as never,
    previewLinkPr: vi.fn(async () => ({
      ok: true as const,
      data: {
        item,
        projectId: 'project-1',
        repo: repoB,
        session: { pr_number: 7, worktree_path: '/code/b-feature', branch_name: 'feature/x' },
        pr: { number: 12, url: 'https://github.com/org/b/pull/12', title: 'Add x', headRefName: 'feature/x' },
      },
    })) as never,
    getRepoSlug: vi.fn(async (repoPath: string) => (repoPath === '/code/b' ? 'org/b' : 'org/a')),
    onBoardChange,
    ...options.overrides,
  };
  const [listTool, proposeTool] = createBoardTools(deps);
  const call = (target: unknown, args: Record<string, unknown>, projectId = 'project-1') =>
    runWithToolExecutionContext({ projectId }, () =>
      (target as { handler: (args: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> }).handler(args, {}));
  return {
    deps,
    onBoardChange,
    list: (args: Record<string, unknown> = {}) => call(listTool, args),
    propose: (args: Record<string, unknown>, projectId?: string) => call(proposeTool, args, projectId),
  };
}

const mainA = { path: '/code/a', branch: 'main', unavailableReason: 'Main checkout' };
const featureB = { path: '/code/b-feature', branch: 'feature/x' };

describe('propose_board_change attach_worktree', () => {
  it('finds the worktree for a branch across connected repos and proposes the resolved attach', async () => {
    const { propose, onBoardChange, deps } = makeTools({ worktrees: { 'repo-a': [mainA], 'repo-b': [featureB] } });

    const result = await propose({ change: 'attach_worktree', itemId: ITEM_ID, branch: 'feature/x' });

    expect(result.isError).toBeFalsy();
    expect(deps.previewAttachWorktree).toHaveBeenCalledWith(ITEM_ID, 'repo-b', '/code/b-feature');
    expect(onBoardChange).toHaveBeenCalledWith({
      kind: 'attach_worktree',
      planItemId: ITEM_ID,
      itemTitle: 'Outside work',
      repoId: 'repo-b',
      repoPath: '/code/b',
      worktreePath: '/code/b-feature',
      branchName: 'feature/x',
      carriedPrNumber: 42,
    });
  });

  it.each([
    ['a branch only in the main checkout', { branch: 'main' }, 'checked out in the main checkout'],
    ['a branch in no worktree', { branch: 'nowhere' }, 'No worktree has branch nowhere'],
    ['a worktree path with another branch', { worktreePath: '/code/b-feature', branch: 'main' }, 'No worktree at /code/b-feature with branch main'],
    ['neither branch nor path', {}, 'needs branch or worktreePath'],
  ])('refuses %s without proposing', async (_case, args, message) => {
    const { propose, onBoardChange } = makeTools({ worktrees: { 'repo-a': [mainA], 'repo-b': [featureB] } });

    const result = await propose({ change: 'attach_worktree', itemId: ITEM_ID, ...args });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
    expect(onBoardChange).not.toHaveBeenCalled();
  });

  it('names the owning task when the worktree is already attached', async () => {
    const owned = { ...featureB, unavailableReason: 'Attached to another task', attachedTo: { planItemId: 'item-2', title: 'Other task', sameProject: true } };
    const { propose } = makeTools({ worktrees: { 'repo-b': [owned] } });

    const result = await propose({ change: 'attach_worktree', itemId: ITEM_ID, branch: 'feature/x' });

    expect(result.content[0].text).toContain('already attached to "Other task"');
  });

  it('asks which repo when the branch is checked out in two', async () => {
    const { propose } = makeTools({ worktrees: { 'repo-a': [{ path: '/code/a-feature', branch: 'feature/x' }], 'repo-b': [featureB] } });

    const result = await propose({ change: 'attach_worktree', itemId: ITEM_ID, branch: 'feature/x' });

    expect(result.content[0].text).toContain('Pass repoPath or worktreePath');
  });

  it('relays the service refusal instead of proposing', async () => {
    const { propose, onBoardChange } = makeTools({
      worktrees: { 'repo-b': [featureB] },
      overrides: { previewAttachWorktree: vi.fn(async () => ({ ok: false as const, error: 'This task already has a worktree at /x. Delete it first.' })) },
    });

    const result = await propose({ change: 'attach_worktree', itemId: ITEM_ID, branch: 'feature/x' });

    expect(result.content[0].text).toContain('already has a worktree');
    expect(onBoardChange).not.toHaveBeenCalled();
  });

  it('refuses a task from another project', async () => {
    const { propose, deps } = makeTools({ worktrees: { 'repo-b': [featureB] } });

    const result = await propose({ change: 'attach_worktree', itemId: ITEM_ID, branch: 'feature/x' }, 'project-2');

    expect(result.isError).toBe(true);
    expect(deps.previewAttachWorktree).not.toHaveBeenCalled();
  });
});

describe('propose_board_change link_pr', () => {
  it('picks the repo a PR URL names and proposes a link that replaces the old PR', async () => {
    const { propose, onBoardChange, deps } = makeTools();

    const result = await propose({ change: 'link_pr', itemId: ITEM_ID, pr: 'https://github.com/org/b/pull/12' });

    expect(result.isError).toBeFalsy();
    expect(deps.previewLinkPr).toHaveBeenCalledWith(ITEM_ID, 'repo-b', 'https://github.com/org/b/pull/12');
    expect(onBoardChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'link_pr',
      prNumber: 12,
      prUrl: 'https://github.com/org/b/pull/12',
      sessionBranch: 'feature/x',
      replacesPrNumber: 7,
    }));
  });

  it('asks which repo for a bare number when several are connected', async () => {
    const { propose, deps } = makeTools();

    const result = await propose({ change: 'link_pr', itemId: ITEM_ID, pr: '12' });

    expect(result.content[0].text).toContain('Pass repoPath');
    expect(deps.previewLinkPr).not.toHaveBeenCalled();
  });

  it('refuses a PR the task already has', async () => {
    const { propose, onBoardChange } = makeTools({
      repos: [repoB],
      overrides: {
        previewLinkPr: vi.fn(async () => ({
          ok: true as const,
          data: { item, projectId: 'project-1', repo: repoB, session: { pr_number: 12 }, pr: { number: 12, url: 'u' } },
        })) as never,
      },
    });

    const result = await propose({ change: 'link_pr', itemId: ITEM_ID, pr: '#12' });

    expect(result.content[0].text).toContain('already linked to this task');
    expect(onBoardChange).not.toHaveBeenCalled();
  });
});

describe('list_worktrees', () => {
  it('reports each worktree as attachable or with its reason', async () => {
    const { list } = makeTools({ worktrees: { 'repo-a': [mainA], 'repo-b': [featureB] } });

    const result = await list({ repoPath: '/code/b' });

    expect(JSON.parse(result.content[0].text)).toEqual({
      repos: [{ repoPath: '/code/b', worktrees: [{ path: '/code/b-feature', branch: 'feature/x', attachable: true }] }],
    });
  });
});
