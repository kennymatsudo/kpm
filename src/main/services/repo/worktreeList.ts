/**
 * Reads a repository's worktrees from `git worktree list --porcelain`.
 *
 * Git always lists the main worktree first, whichever worktree the command
 * runs in, so `isMain` is trustworthy even when a connected repo points at a
 * linked worktree.
 */

import { gitExec } from './gitUtils';

export interface GitWorktreeEntry {
  path: string;
  /** Short branch name, or null for a detached HEAD or a bare main worktree. */
  branch: string | null;
  isMain: boolean;
  bare: boolean;
  detached: boolean;
  /** Git knows the directory is gone; `git worktree prune` would remove it. */
  prunable: boolean;
}

export function parseWorktreeListPorcelain(stdout: string): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | null = null;
  const flush = () => {
    if (current) entries.push(current);
    current = null;
  };

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush();
      current = {
        path: line.slice('worktree '.length),
        branch: null,
        isMain: entries.length === 0,
        bare: false,
        detached: false,
        prunable: false,
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true;
    } else if (line === '') {
      flush();
    }
  }
  flush();
  return entries;
}

export async function listGitWorktrees(repoPath: string): Promise<GitWorktreeEntry[]> {
  const { stdout } = await gitExec(['worktree', 'list', '--porcelain'], { cwd: repoPath });
  return parseWorktreeListPorcelain(stdout);
}
