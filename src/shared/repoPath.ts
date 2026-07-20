import type { Repo } from './types';

/**
 * The filesystem path a connected repo currently points at: the active worktree
 * if the user has switched to one, otherwise the main checkout (`repo.path`).
 *
 * Every read of a connected repo — chat tools, system prompts, workspace file
 * access, add-dir scoping, and branch watching — resolves through here so the
 * "switch worktree" choice is honored consistently in both the main and
 * renderer processes. Pure: it does not verify the worktree still exists.
 */
export function resolveEffectiveRepoPath(
  repo: Pick<Repo, 'path' | 'active_worktree_path'>
): string {
  return repo.active_worktree_path ?? repo.path;
}
