/**
 * Every git invocation that moves a branch ref, locally or on a remote.
 *
 * The interface is intentions — publish this branch, delete that one — and the
 * policy, the argv, and the process invocation are all private to it. That
 * matters because these are the operations KPM cannot undo for the user: before
 * this module existed, `push origin --delete` ran from session teardown inside a
 * bare `catch {}`, consulting no guard and reporting nothing.
 *
 * Every caller has to say why it is allowed to move the ref (`WriteAuthorization`),
 * so a new call site cannot quietly inherit someone else's consent.
 */

import type { WriteDecision } from '../../chat/writeGrants';
import { classifyPushTarget, hasUpstream, protectedBranchReason } from './branchFacts';
import { gitExecCaptured } from './gitUtils';

export type GitWriteOutcome =
  | { ok: true; summary: string; setUpstream: boolean }
  /** Policy or consent said no. Nothing ran. */
  | { ok: false; kind: 'refused'; reason: string }
  /** The ref was already gone, which is success for a delete. */
  | { ok: false; kind: 'missingRef'; reason: string }
  | { ok: false; kind: 'failed'; reason: string };

/**
 * Why this caller may move the ref. Chat holds a conversation-wide grant it must
 * request on first use; board session teardown is the user's own click on a
 * session they created, so it carries no prompt.
 */
export type WriteAuthorization =
  | { kind: 'boardSession' }
  | { kind: 'projectWriteGrant'; request: () => Promise<WriteDecision> };

interface RemoteBranchTarget {
  repoPath: string;
  remote: string;
  /** `null` when nothing is checked out; every entry point rejects it. */
  branch: string | null;
  authorization: WriteAuthorization;
}

/** A leading dash would be read by git as a flag rather than a remote name. */
const SAFE_REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** git's several ways of saying the ref was not there. */
const MISSING_REF = /not found|does not exist|no such ref|unable to delete/i;

async function authorize(authorization: WriteAuthorization): Promise<GitWriteOutcome | null> {
  if (authorization.kind === 'boardSession') return null;

  const decision = await authorization.request();
  return decision.allowed ? null : { ok: false, kind: 'refused', reason: decision.reason };
}

function summarize(result: { stdout: string; stderr: string }): string {
  // git reports the ref update summary on stderr even when the push succeeds,
  // so both streams are part of the answer.
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
}

async function runRefUpdate(
  args: string[],
  repoPath: string,
  setUpstream: boolean
): Promise<GitWriteOutcome> {
  const result = await gitExecCaptured(args, { cwd: repoPath });
  const summary = summarize(result);

  if (result.exitCode === 0) return { ok: true, summary, setUpstream };
  if (MISSING_REF.test(summary)) return { ok: false, kind: 'missingRef', reason: summary };
  return { ok: false, kind: 'failed', reason: summary || `git exited ${result.exitCode}` };
}

/**
 * Publish `branch` to `remote`, setting the upstream when it has none. There is
 * no force and no refspec: the branch name is the whole target.
 */
export async function publishBranch(target: RemoteBranchTarget): Promise<GitWriteOutcome> {
  const { repoPath, remote, branch, authorization } = target;

  if (!SAFE_REMOTE_NAME.test(remote)) {
    return { ok: false, kind: 'refused', reason: `"${remote}" is not a valid remote name.` };
  }

  const pushTarget = await classifyPushTarget(repoPath, branch);
  if (!pushTarget.ok) return { ok: false, kind: 'refused', reason: pushTarget.reason };

  const denied = await authorize(authorization);
  if (denied) return denied;

  const setUpstream = !(await hasUpstream(repoPath, pushTarget.branch));
  const args = ['push', ...(setUpstream ? ['--set-upstream'] : []), remote, '--', pushTarget.branch];
  return runRefUpdate(args, repoPath, setUpstream);
}

/** Delete `branch` on `remote`. Refuses a protected or default branch. */
export async function deleteRemoteBranch(target: RemoteBranchTarget): Promise<GitWriteOutcome> {
  const { repoPath, remote, branch, authorization } = target;

  if (!SAFE_REMOTE_NAME.test(remote)) {
    return { ok: false, kind: 'refused', reason: `"${remote}" is not a valid remote name.` };
  }
  if (!branch) {
    return { ok: false, kind: 'refused', reason: 'No branch to delete.' };
  }
  if (await protectedBranchReason(repoPath, branch)) {
    return {
      ok: false,
      kind: 'refused',
      reason: `"${branch}" is a protected or default branch — refusing to delete it on ${remote}.`,
    };
  }

  const denied = await authorize(authorization);
  if (denied) return denied;

  return runRefUpdate(['push', remote, '--delete', '--', branch], repoPath, false);
}

/** Force-delete a local branch, ignoring merge state. Refuses a protected or default branch. */
export async function deleteLocalBranch(target: {
  repoPath: string;
  branch: string | null;
  authorization: WriteAuthorization;
}): Promise<GitWriteOutcome> {
  const { repoPath, branch, authorization } = target;

  if (!branch) {
    return { ok: false, kind: 'refused', reason: 'No branch to delete.' };
  }
  if (await protectedBranchReason(repoPath, branch)) {
    return {
      ok: false,
      kind: 'refused',
      reason: `"${branch}" is a protected or default branch — refusing to delete it.`,
    };
  }

  const denied = await authorize(authorization);
  if (denied) return denied;

  return runRefUpdate(['branch', '-D', '--', branch], repoPath, false);
}
