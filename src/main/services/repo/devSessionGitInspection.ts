/**
 * Read-side git operations scoped to a session's worktree: diff, commit log,
 * per-commit file stats, and committing changes. Separate from session
 * lifecycle (create/start/stop) — these only need a session's worktree path
 * and branch, not the DevSessionRepository or AgentSessionManager.
 */

import * as fs from 'fs';
import { failure, success, type AsyncResult } from '../result';
import type { DevSession } from '../../../shared/types';
import { gitExec } from './gitUtils';
import { assertSessionWorktreeCheckout, resolveSessionCommitRangeArgs } from './worktreeScaffold';

function commandOutputToString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
  return '';
}

function formatGitExecError(error: unknown): string {
  const commandError = error as { stdout?: unknown; stderr?: unknown };
  const output = [
    commandOutputToString(commandError.stderr),
    commandOutputToString(commandError.stdout),
  ].filter(Boolean).join('\n').trim();

  if (output) return output;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Check if a session's worktree has uncommitted changes.
 * Used to warn before deletion.
 */
export async function checkSessionDirty(
  session: DevSession,
): AsyncResult<{ isDirty: boolean; files: string[] }> {
  try {
    // If worktree doesn't exist, nothing to lose
    if (!fs.existsSync(session.worktree_path)) {
      return success({ isDirty: false, files: [] });
    }

    // Check for uncommitted changes using git status --porcelain
    const { stdout } = await gitExec(
      ['status', '--porcelain'],
      { cwd: session.worktree_path }
    );

    const files = stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.slice(3)); // Remove status prefix (e.g., " M ", "?? ")

    return success({ isDirty: files.length > 0, files });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get git diff for a session's worktree.
 */
export async function getSessionDiff(session: DevSession): AsyncResult<string> {
  try {
    if (!fs.existsSync(session.worktree_path)) {
      return failure(`Worktree not found: ${session.worktree_path}`);
    }

    // Show only truly uncommitted changes (staged + unstaged vs HEAD).
    // Committed branch changes are visible via the commit list below.
    const { stdout } = await gitExec(
      ['diff', 'HEAD'],
      { cwd: session.worktree_path, maxBuffer: 10 * 1024 * 1024 }
    );

    return success(stdout);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get commit count ahead of base branch.
 */
export async function getSessionCommitsAhead(session: DevSession): AsyncResult<number> {
  try {
    if (!fs.existsSync(session.worktree_path)) {
      return success(0);
    }

    const rangeArgs = await resolveSessionCommitRangeArgs(session);
    const { stdout } = await gitExec(
      ['rev-list', '--count', ...rangeArgs],
      { cwd: session.worktree_path }
    );

    return success(parseInt(stdout.trim(), 10) || 0);
  } catch {
    return success(0);
  }
}

/**
 * Commit uncommitted changes in the session's worktree.
 *
 * Stages all changes and commits once. If pre-commit hooks rewrite files
 * and exit non-zero (prettier/eslint/lefthook pattern), re-stages and
 * retries once — mirrors the /commit skill's conversational retry.
 */
export async function commitSessionChanges(
  session: DevSession,
  repoPath: string,
  message: string,
): AsyncResult<{ sha: string }> {
  const target = await assertSessionWorktreeCheckout({ session, repoPath });
  if (!target.ok) {
    return target;
  }
  const cwd = target.data.cwd;

  const extractSha = (stdout: string): string => {
    const shaMatch = /\[[\w/.-]+ ([0-9a-f]{7,})\]/.exec(stdout);
    return shaMatch?.[1] ?? '';
  };

  const isNothingToCommit = (err: unknown): boolean => {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const stdout = (err as { stdout?: string }).stdout ?? '';
    return stderr.includes('nothing to commit') || stdout.includes('nothing to commit');
  };

  const hookChangedWorktree = async (): Promise<boolean> => {
    try {
      const { stdout } = await gitExec(['status', '--porcelain'], { cwd });
      return stdout.split(/\r?\n/).some((line) => {
        if (!line) return false;
        if (line.startsWith('??')) return true;
        return line.length > 1 && line[1] !== ' ';
      });
    } catch {
      return false;
    }
  };

  try {
    await gitExec(['add', '-A'], { cwd });
    try {
      const { stdout } = await gitExec(['commit', '-m', message], { cwd });
      return success({ sha: extractSha(stdout) });
    } catch (firstErr) {
      if (isNothingToCommit(firstErr)) {
        return failure('Nothing to commit — working tree is clean');
      }
      if (await hookChangedWorktree()) {
        // Pre-commit hooks can auto-fix files and exit non-zero to force
        // re-staging. Retry only when the hook actually changed files.
        await gitExec(['add', '-A'], { cwd });
        const { stdout } = await gitExec(['commit', '-m', message], { cwd });
        return success({ sha: extractSha(stdout) });
      }
      return failure(formatGitExecError(firstErr));
    }
  } catch (err) {
    if (isNothingToCommit(err)) {
      return failure('Nothing to commit — working tree is clean');
    }
    return failure(formatGitExecError(err));
  }
}

/**
 * Get the commit log (commits ahead of base branch) for a session's worktree.
 */
export async function getSessionCommitLog(
  session: DevSession,
): AsyncResult<{ sha: string; subject: string; authorName: string; date: string }[]> {
  try {
    if (!fs.existsSync(session.worktree_path)) {
      return success([]);
    }

    const SEP = '\x1f';
    const rangeArgs = await resolveSessionCommitRangeArgs(session);
    const { stdout } = await gitExec(
      ['log', ...rangeArgs, `--format=%h${SEP}%s${SEP}%aN${SEP}%aI`],
      { cwd: session.worktree_path },
    );

    const commits = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, subject, authorName, date] = line.split(SEP);
        return {
          sha: sha ?? '',
          subject: subject ?? '',
          authorName: authorName ?? '',
          date: date ?? '',
        };
      });

    return success(commits);
  } catch (err) {
    return failure(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Get per-file additions/deletions for a single commit in a session's worktree.
 */
export async function getSessionCommitFiles(
  session: DevSession,
  sha: string,
): AsyncResult<{ additions: number; deletions: number; path: string }[]> {
  try {
    if (!fs.existsSync(session.worktree_path)) {
      return success([]);
    }

    const { stdout } = await gitExec(
      ['show', '--numstat', '--format=', sha],
      { cwd: session.worktree_path },
    );

    const files = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t');
        return {
          additions: parseInt(parts[0] ?? '0', 10) || 0,
          deletions: parseInt(parts[1] ?? '0', 10) || 0,
          path: parts[2] ?? '',
        };
      })
      .filter((f) => f.path);

    return success(files);
  } catch (err) {
    return failure(err instanceof Error ? err.message : String(err));
  }
}
