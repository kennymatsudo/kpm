/**
 * The branch questions KPM asks a checkout, with one answer each.
 *
 * These four questions — which branch is checked out, which branch is the
 * repo's default, may an agent push here, does this branch have an upstream —
 * used to be answered by pairs of resolvers that disagreed: the watcher and
 * `rev-parse` reported a detached HEAD differently, and the board's Create-PR
 * path used a narrower push guard than the `git_push` tool, so it would publish
 * a default branch the tool refused. Everything that needs a branch fact now
 * reads it here.
 *
 * One convention for "no branch": `null`. One mechanism difference survives and
 * cannot be resolved away — on an unborn branch (a fresh repo with no commit)
 * `.git/HEAD` names the branch while `rev-parse` fails, so `normalizeHeadRef`
 * returns the name and `resolveCurrentBranch` returns `null`.
 */

import { gitExecCaptured } from './gitUtils';

/** Branches KPM never pushes to directly, and never opens a pull request from. */
export const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'release']);

/** Carries the branch so callers get a non-null name out of an accepted check. */
export type PushTargetCheck = { ok: true; branch: string } | { ok: false; reason: string };

const HEAD_REF_PREFIX = 'refs/heads/';

/**
 * The branch named by the contents of `.git/HEAD`, or `null` when HEAD holds a
 * raw commit instead of a ref. Pure, so the file watcher can answer from the
 * bytes it already read instead of spawning git per event.
 */
export function normalizeHeadRef(headContents: string): string | null {
  const trimmed = headContents.trim();
  if (!trimmed.startsWith('ref:')) return null;

  const refPath = trimmed.slice(4).trim();
  if (!refPath) return null;
  return refPath.startsWith(HEAD_REF_PREFIX) ? refPath.slice(HEAD_REF_PREFIX.length) : refPath;
}

/** The checked-out branch, or `null` when HEAD is detached or unborn. */
export async function resolveCurrentBranch(repoPath: string): Promise<string | null> {
  const head = await gitExecCaptured(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
  if (head.exitCode !== 0) return null;

  const branch = head.stdout.trim();
  return branch === '' || branch === 'HEAD' ? null : branch;
}

/**
 * The repo's default branch. Prefers what the clone recorded in
 * `refs/remotes/origin/HEAD`, since that is the remote's own answer and covers
 * repos whose default is neither `main` nor `master`; falls back to whichever of
 * those exists locally, then to `main` for a repo with no commits yet.
 */
export async function resolveDefaultBranch(repoPath: string): Promise<string> {
  const remoteHead = await gitExecCaptured(['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoPath });
  if (remoteHead.exitCode === 0) {
    const recorded = remoteHead.stdout
      .trim()
      .replace('refs/remotes/origin/', '')
      .replace(HEAD_REF_PREFIX, '');
    if (recorded) return recorded;
  }

  for (const candidate of ['main', 'master']) {
    const exists = await gitExecCaptured(['rev-parse', '--verify', candidate], { cwd: repoPath });
    if (exists.exitCode === 0) return candidate;
  }

  return 'main';
}

/**
 * The base branch to compare against: the declared one when it still exists in
 * this checkout, otherwise the repo's default. A session created against `main`
 * in a `master` repo declares a branch that isn't there.
 */
export async function resolveBaseBranch(repoPath: string, declared?: string | null): Promise<string> {
  if (declared) {
    const exists = await gitExecCaptured(['rev-parse', '--verify', declared], { cwd: repoPath });
    if (exists.exitCode === 0) return declared;
  }
  return resolveDefaultBranch(repoPath);
}

/**
 * Why a branch is off limits to an agent, or `null` when it isn't. Checking the
 * repo's real default branch is why this has to ask git rather than consulting
 * `PROTECTED_BRANCHES` alone: a repo whose default is `trunk` would otherwise
 * look ordinary.
 */
export type ProtectedBranchReason = 'protectedName' | 'defaultBranch';

export async function protectedBranchReason(
  repoPath: string,
  branch: string
): Promise<ProtectedBranchReason | null> {
  if (PROTECTED_BRANCHES.has(branch)) return 'protectedName';
  if (branch === await resolveDefaultBranch(repoPath)) return 'defaultBranch';
  return null;
}

/** Whether `branch` may be pushed to at all. */
export async function classifyPushTarget(repoPath: string, branch: string | null): Promise<PushTargetCheck> {
  if (!branch || branch === 'HEAD') {
    return { ok: false, reason: 'No current branch to push — HEAD may be detached. Check out a branch first.' };
  }

  const protectedReason = await protectedBranchReason(repoPath, branch);
  if (protectedReason === 'protectedName') {
    return {
      ok: false,
      reason: `"${branch}" is a protected branch. Move the commits onto a feature branch and push that instead.`,
    };
  }
  if (protectedReason === 'defaultBranch') {
    return {
      ok: false,
      reason: `"${branch}" is this repository's default branch. Move the commits onto a feature branch and push that instead.`,
    };
  }

  return { ok: true, branch };
}

/**
 * Whether `branch` has an upstream configured, which is what decides between
 * `push` and `push --set-upstream`. Distinct from "is this branch on the
 * remote": the remote-tracking ref this reads can outlive the remote branch.
 */
export async function hasUpstream(repoPath: string, branch: string): Promise<boolean> {
  const upstream = await gitExecCaptured(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{u}`],
    { cwd: repoPath }
  );
  return upstream.exitCode === 0;
}
