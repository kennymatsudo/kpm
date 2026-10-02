import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveConnectedRepo } from './connectedRepo';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-connected-repo-')));
const mainCheckout = path.join(root, 'kpm');
const switchedWorktree = path.join(root, '.kpm-worktrees', 'kpm', 'feature');
const otherRepo = path.join(root, 'other');
for (const dir of [path.join(mainCheckout, 'src'), path.join(switchedWorktree, 'src'), otherRepo]) {
  fs.mkdirSync(dir, { recursive: true });
}
const linkToMain = path.join(root, 'kpm-link');
fs.symlinkSync(mainCheckout, linkToMain);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const switched = { path: mainCheckout, active_worktree_path: switchedWorktree };
const other = { path: otherRepo, active_worktree_path: null };

describe('resolveConnectedRepo', () => {
  it('runs in the requested directory when it is inside the current checkout', () => {
    expect(resolveConnectedRepo([switched, other], path.join(switchedWorktree, 'src')))
      .toEqual({ ok: true, repo: switched, repoPath: path.join(switchedWorktree, 'src') });
  });

  it('matches a main-checkout path but runs in the worktree the user switched to', () => {
    expect(resolveConnectedRepo([switched, other], path.join(mainCheckout, 'src')))
      .toEqual({ ok: true, repo: switched, repoPath: switchedWorktree });
  });

  it('matches through a symlink to the checkout', () => {
    expect(resolveConnectedRepo([other, { path: mainCheckout, active_worktree_path: null }], path.join(linkToMain, 'src')))
      .toMatchObject({ ok: true, repoPath: path.join(mainCheckout, 'src') });
  });

  it('defaults to the only repo, in its current checkout', () => {
    expect(resolveConnectedRepo([switched])).toEqual({ ok: true, repo: switched, repoPath: switchedWorktree });
  });

  it('refuses a path outside every connected repo', () => {
    expect(resolveConnectedRepo([switched], root)).toEqual({
      ok: false,
      reason: `"${root}" is not within a connected repository. Connected: ${switchedWorktree}`,
    });
  });

  it('refuses to guess between several repos', () => {
    expect(resolveConnectedRepo([switched, other])).toMatchObject({ ok: false });
  });
});
