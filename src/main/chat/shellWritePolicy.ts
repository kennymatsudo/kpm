/**
 * The one rule for whether a shell command an agent wants to run needs the
 * project's write grant (P7).
 *
 * Claude and pi both enforce this, and they used to implement it separately:
 * they shared the classifier underneath but each decided on its own what a
 * non-git command meant and when the read-only escape applied, so a change to
 * one left the other stale. Codex chat applies this at app-server approval
 * requests, which is recorded as `inTurnWriteApproval` in
 * `shared/providerCapabilities.ts`.
 *
 * The rule: a shell command needs the grant unless it is provably read-only git.
 * `classifyGitShellCommand` only accepts what it can prove, so an unparseable
 * command costs a consent prompt rather than an unreviewed write.
 */

import { classifyGitShellCommand } from '../services/repo/gitReadOnly';

/**
 * Whether the command mentions git at all. A non-git command can never take the
 * read-only escape, so this skips the tokenizer for the common case.
 */
function invokesGit(command: string): boolean {
  return /(^|[\s;&|()])(?:\S+\/)?git(?:\s|$)/.test(command.trim());
}

export function shellCommandNeedsWriteGrant(command: string): boolean {
  if (!invokesGit(command)) return true;
  return !classifyGitShellCommand(command).ok;
}
