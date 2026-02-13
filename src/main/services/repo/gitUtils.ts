/**
 * Git Utilities
 *
 */

import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Execute a git command safely without shell interpolation.
 */
export async function gitExec(
  args: string[],
  options: { cwd: string; maxBuffer?: number }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, options);
}

/**
 * Returns the diff output, truncated if very large.
 */
export async function getDiff(
  repoPath: string,
  baseBranch: string,
): Promise<string> {
  const { stdout } = await gitExec(
    { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
  );
  if (stdout.length > maxChars) {
    return stdout.slice(0, maxChars) + '\n\n... (diff truncated)';
  }
  return stdout;
}

/**
 * Get the commit log between a base branch and HEAD.
 */
export async function getCommitLog(
  repoPath: string,
  baseBranch: string
): Promise<string> {
  const { stdout } = await gitExec(
    { cwd: repoPath }
  );
  return stdout.trim();
}

/**
 * Get the current branch name.
 */
export async function getCurrentBranch(
  repoPath: string
): Promise<string | null> {
  try {
    const { stdout } = await gitExec(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: repoPath }
    );
    const branch = stdout.trim();
    return branch === 'HEAD' ? null : branch;
  } catch {
    return null;
  }
}

/**
 * Detect the default branch (main or master) of a repo.
 */
export async function detectBaseBranch(
  repoPath: string
): Promise<string> {
  // Check if 'main' exists
  try {
    await gitExec(['rev-parse', '--verify', 'main'], { cwd: repoPath });
    return 'main';
  } catch {
    // fall through
  }

  // Check if 'master' exists
  try {
    await gitExec(['rev-parse', '--verify', 'master'], { cwd: repoPath });
    return 'master';
  } catch {
    // fall through
  }

  // Default to 'main'
  return 'main';
}

/**
 * Get recent commits from a repo (last N weeks).
 */
export async function getRecentCommits(
  repoPath: string,
  since = '2 weeks ago'
): Promise<string> {
  try {
    const { stdout } = await gitExec(
      ['log', `--since=${since}`, '--oneline', '--max-count=20'],
      { cwd: repoPath }
    );
    return stdout.trim();
  } catch {
    return '';
  }
}
