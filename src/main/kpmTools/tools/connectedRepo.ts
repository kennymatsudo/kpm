/**
 * Shared repository-argument resolution for the chat tools.
 *
 * A tool call names a project, not a checkout, so `repoPath` may land anywhere
 * inside a connected repo's main checkout or the worktree the user has switched
 * it to. Either picks the repo; git then runs in the checkout the repo currently
 * points at, so a main-checkout path never sends git past the user's switch.
 * Omitting `repoPath` is only unambiguous when exactly one repo is connected.
 */

import fs from 'fs';
import path from 'path';
import type { Repo } from '../../../shared/types';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

type ConnectedRepo = Pick<Repo, 'path' | 'active_worktree_path'>;

export type ConnectedRepoResolution<R extends ConnectedRepo = ConnectedRepo> =
  | { ok: true; repo: R; repoPath: string }
  | { ok: false; reason: string };

function realDirectory(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

function isWithinDir(target: string, base: string): boolean {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function describeConnectedRepos(repos: ConnectedRepo[]): string {
  return repos.map(resolveEffectiveRepoPath).join(', ');
}

export function resolveConnectedRepo<R extends ConnectedRepo>(
  repos: R[],
  requestedPath?: string
): ConnectedRepoResolution<R> {
  if (repos.length === 0) {
    return { ok: false, reason: 'No repositories are connected to this project.' };
  }

  if (requestedPath) {
    const target = realDirectory(requestedPath);
    // Checked before any main checkout, so a worktree nested inside another repo's checkout still wins.
    const inCurrentCheckout = repos.find((repo) => isWithinDir(target, realDirectory(resolveEffectiveRepoPath(repo))));
    if (inCurrentCheckout) return { ok: true, repo: inCurrentCheckout, repoPath: target };
    const inMainCheckout = repos.find((repo) => isWithinDir(target, realDirectory(repo.path)));
    if (inMainCheckout) {
      return { ok: true, repo: inMainCheckout, repoPath: realDirectory(resolveEffectiveRepoPath(inMainCheckout)) };
    }
    return {
      ok: false,
      reason: `"${requestedPath}" is not within a connected repository. Connected: ${describeConnectedRepos(repos)}`,
    };
  }

  if (repos.length === 1) {
    return { ok: true, repo: repos[0], repoPath: realDirectory(resolveEffectiveRepoPath(repos[0])) };
  }

  return {
    ok: false,
    reason: `Multiple repositories are connected — pass repoPath. Options: ${describeConnectedRepos(repos)}`,
  };
}
