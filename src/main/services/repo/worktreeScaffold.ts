/**
 * Board session worktree/branch scaffolding — raw git orchestration for
 * bringing a session's worktree into existence and verifying it's checked
 * out correctly. Independent of session lifecycle (create/start/stop): these
 * functions only know about branch names and filesystem paths, not DB state.
 */

import * as fs from 'fs';
import * as path from 'path';
import { failure, success, type ServiceResult } from '../result';
import type { DevSession } from '../../../shared/types';
import { gitExec, resolveUpstreamBranch, getMergeBase } from './gitUtils';
import { resolveCurrentBranch } from './branchFacts';

/** The session's worktree while it is still a checkout, otherwise `repoPath`. */
export function sessionCheckoutPath(session: Pick<DevSession, 'worktree_path'>, repoPath: string): string {
  return session.worktree_path && fs.existsSync(path.join(session.worktree_path, '.git'))
    ? session.worktree_path
    : repoPath;
}

/**
 * Get the worktrees directory for a repo
 */
export function getWorktreesDir(repoPath: string): string {
  const repoName = path.basename(repoPath);
  return path.join(path.dirname(repoPath), `.kpm-worktrees`, repoName);
}

/**
 * Check if a branch exists in the repo
 */
export async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', `refs/heads/${branchName}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique branch name by appending -v2, -v3, etc. if needed
 */
export async function generateUniqueBranchName(repoPath: string, baseBranchName: string): Promise<string> {
  // First check if base name is available
  if (!(await branchExists(repoPath, baseBranchName))) {
    return baseBranchName;
  }

  // Find next available version
  let version = 2;
  while (version < 100) {
    const versionedName = `${baseBranchName}-v${version}`;
    if (!(await branchExists(repoPath, versionedName))) {
      return versionedName;
    }
    version++;
  }

  // Fallback to timestamp if somehow we have 100 versions
  return `${baseBranchName}-${Date.now()}`;
}

export type WorktreeScaffoldResult =
  | { ok: true }
  | { ok: false; kind: 'checkedOutInMainRepo' }
  | { ok: false; kind: 'checkedOutElsewhere' }
  | { ok: false; kind: 'createFailed'; outerMessage: string; innerMessage: string };

/**
 * Ensure the worktrees directory exists and, if the worktree path is absent,
 * create it via `git worktree add`.  Returns a discriminated result so callers
 * can produce their own exact error messages.
 *
 * Preconditions: session fields `worktree_path`, `branch_name`, `base_branch`
 * must already be set; `repoPath` is the path of the primary checkout.
 */
export async function scaffoldWorktree(params: {
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  repoPath: string;
}): Promise<WorktreeScaffoldResult> {
  const { worktreePath, branchName, baseBranch, repoPath } = params;

  // Ensure the parent worktrees directory exists
  const worktreesDir = path.dirname(worktreePath);
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Nothing to do — worktree already present
  if (fs.existsSync(worktreePath)) {
    return { ok: true };
  }

  // Guard: never shadow the primary checkout's current branch
  const checkedOut = await resolveCurrentBranch(repoPath);
  if (checkedOut && checkedOut === branchName) {
    return { ok: false, kind: 'checkedOutInMainRepo' };
  }

  try {
    // Attempt to create a new branch from base
    await gitExec(
      ['worktree', 'add', '-b', branchName, '--', worktreePath, baseBranch],
      { cwd: repoPath }
    );
    return { ok: true };
  } catch (outerError) {
    const outerMessage = outerError instanceof Error ? outerError.message : String(outerError);
    // Branch may already exist — retry without -b
    try {
      await gitExec(
        ['worktree', 'add', '--', worktreePath, branchName],
        { cwd: repoPath }
      );
      return { ok: true };
    } catch (innerError) {
      const innerMessage = innerError instanceof Error ? innerError.message : String(innerError);
      if (innerMessage.includes('already checked out')) {
        return { ok: false, kind: 'checkedOutElsewhere' };
      }
      return { ok: false, kind: 'createFailed', outerMessage, innerMessage };
    }
  }
}

/**
 * Check that a worktree made outside KPM can back a board session: it must be
 * a linked worktree of this repo (not the primary checkout, not another repo)
 * with a branch checked out, since sessions track work by branch.
 */
export async function inspectAttachableWorktree(params: {
  worktreePath: string;
  repoPath: string;
}): Promise<ServiceResult<{ worktreePath: string; branchName: string }>> {
  if (!fs.existsSync(params.worktreePath)) {
    return failure(`Worktree not found at ${params.worktreePath}`);
  }
  const [worktreePath, primaryRepoPath] = await Promise.all([
    fs.promises.realpath(params.worktreePath),
    fs.promises.realpath(params.repoPath),
  ]);
  if (worktreePath === primaryRepoPath) {
    return failure('The main checkout cannot be attached. Pick a separate worktree.');
  }

  try {
    const [topLevel, commonDir, primaryCommonDir] = await Promise.all([
      gitExec(['rev-parse', '--show-toplevel'], { cwd: worktreePath }),
      gitExec(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: worktreePath }),
      gitExec(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: primaryRepoPath }),
    ]);
    if (await fs.promises.realpath(topLevel.stdout.trim()) !== worktreePath) {
      return failure(`${worktreePath} is inside a worktree, not the root of one.`);
    }
    const [common, primaryCommon] = await Promise.all([
      fs.promises.realpath(commonDir.stdout.trim()),
      fs.promises.realpath(primaryCommonDir.stdout.trim()),
    ]);
    if (common !== primaryCommon) {
      return failure(`${worktreePath} belongs to a different repository.`);
    }
    // The connected path can itself be a linked worktree, so the check above
    // does not catch git's own main checkout, which owns the shared .git dir.
    if (path.basename(common) === '.git' && path.dirname(common) === worktreePath) {
      return failure('The main checkout cannot be attached. Pick a separate worktree.');
    }
  } catch {
    return failure(`${worktreePath} is not a git worktree.`);
  }

  const branchName = await resolveCurrentBranch(worktreePath);
  if (!branchName) {
    return failure(`${worktreePath} has no branch checked out. Check out a branch first.`);
  }
  return success({ worktreePath, branchName });
}

export async function assertSessionWorktreeCheckout(params: {
  session: DevSession;
  repoPath: string;
}): Promise<ServiceResult<{ cwd: string }>> {
  const { session, repoPath } = params;
  const expectedWorktreePath = path.resolve(session.worktree_path);
  const primaryRepoPath = path.resolve(repoPath);

  if (!fs.existsSync(expectedWorktreePath)) {
    return failure(`Cannot use session worktree: path does not exist at ${expectedWorktreePath}`);
  }

  const [resolvedWorktreePath, resolvedPrimaryRepoPath] = await Promise.all([
    fs.promises.realpath(expectedWorktreePath),
    fs.promises.realpath(primaryRepoPath),
  ]);

  if (resolvedWorktreePath === resolvedPrimaryRepoPath) {
    return failure(
      `Refusing task run: session worktree resolves to the primary checkout (${resolvedPrimaryRepoPath}).`
    );
  }

  const { stdout: topLevelStdout } = await gitExec(['rev-parse', '--show-toplevel'], {
    cwd: resolvedWorktreePath,
  });
  const gitTopLevel = await fs.promises.realpath(topLevelStdout.trim());
  if (gitTopLevel !== resolvedWorktreePath) {
    return failure(
      `Refusing task run: git cwd resolved to ${gitTopLevel}, expected session worktree ${resolvedWorktreePath}.`
    );
  }

  const currentBranch = await resolveCurrentBranch(resolvedWorktreePath);
  if (currentBranch !== session.branch_name) {
    return failure(
      `Refusing task run: ${resolvedWorktreePath} is on branch '${currentBranch ?? 'detached HEAD'}', ` +
      `expected '${session.branch_name}'.`
    );
  }

  return success({ cwd: resolvedWorktreePath });
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', ref], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the lower bound for a session's commit/diff range. Prefers the
 * immutable fork-point SHA captured when the worktree was created. For legacy
 * rows without a stored SHA, falls back to the merge-base with the current base
 * branch, then to the upstream-resolved base branch name.
 */
export async function resolveSessionBaseRef(session: DevSession): Promise<string> {
  if (session.base_sha) {
    return session.base_sha;
  }
  try {
    return await getMergeBase(session.worktree_path, session.base_branch);
  } catch {
    return resolveUpstreamBranch(session.worktree_path, session.base_branch);
  }
}

/**
 * Build rev-list/log arguments for commits that belong to this session. The
 * stored base SHA keeps legacy fork-point attribution stable, while `--not
 * <current-upstream>` removes base-branch commits that entered the task branch
 * through a rebase/fast-forward after the session was created.
 */
export async function resolveSessionCommitRangeArgs(session: DevSession): Promise<string[]> {
  const baseRef = await resolveSessionBaseRef(session);
  const args = [`${baseRef}..HEAD`];

  if (!session.base_sha || !session.base_branch) {
    return args;
  }

  const currentBaseRef = await resolveUpstreamBranch(session.worktree_path, session.base_branch);
  if (currentBaseRef && (await refExists(session.worktree_path, currentBaseRef))) {
    args.push('--not', currentBaseRef);
  }

  return args;
}
