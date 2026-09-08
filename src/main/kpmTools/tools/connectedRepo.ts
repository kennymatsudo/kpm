/**
 * Shared repository-argument resolution for the git tools.
 *
 * A tool call names a project, not a checkout, so `repoPath` may land anywhere
 * inside a connected repo (or the worktree the user has switched it to). Omitting
 * it is only unambiguous when exactly one repo is connected.
 */

import path from 'path';
import type { Repo } from '../../../shared/types';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

type ConnectedRepo = Pick<Repo, 'path' | 'active_worktree_path'>;

export type ConnectedRepoResolution =
  | { ok: true; repoPath: string }
  | { ok: false; reason: string };

function isWithinDir(target: string, base: string): boolean {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolveConnectedRepoPath(
  repos: ConnectedRepo[],
  requestedPath?: string
): ConnectedRepoResolution {
  if (repos.length === 0) {
    return { ok: false, reason: 'No repositories are connected to this project.' };
  }

  const effectivePathOf = (repo: ConnectedRepo) => path.resolve(resolveEffectiveRepoPath(repo));

  if (requestedPath) {
    const resolved = path.resolve(requestedPath);
    const match = repos.find((repo) => isWithinDir(resolved, effectivePathOf(repo)));
    if (!match) {
      return {
        ok: false,
        reason: `"${requestedPath}" is not within a connected repository. Connected: ${repos.map(effectivePathOf).join(', ')}`,
      };
    }
    return { ok: true, repoPath: resolved };
  }

  if (repos.length === 1) {
    return { ok: true, repoPath: effectivePathOf(repos[0]) };
  }

  return {
    ok: false,
    reason: `Multiple repositories are connected — pass repoPath. Options: ${repos.map(effectivePathOf).join(', ')}`,
  };
}
