/**
 * Git Utilities
 *
 * Reusable git operations for PR description generation, worktree management,
 * and review assessment. Uses execFile (no shell) to prevent command injection.
 *
 * Note: KPM does not manage the user's working tree for them (pull, stage,
 * branch sync stay theirs). The exceptions are deliberate and gated elsewhere:
 * board sessions commit inside their worktree, and `git_push` publishes a branch
 * once the conversation has write access.
 */

import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Batch-check which paths are ignored by git using `git check-ignore --stdin`.
 * Paths must be relative to `repoRoot`. Returns a Set of the ignored ones.
 * Resolves to an empty Set when no paths are ignored (exit code 1) or when
 * git is unavailable — always fails open so the UI stays functional.
 */
export function getIgnoredPaths(repoRoot: string, relativePaths: string[]): Promise<Set<string>> {
  if (relativePaths.length === 0) return Promise.resolve(new Set());
  return new Promise((resolve) => {
    const proc = spawn('git', ['check-ignore', '--stdin'], { cwd: repoRoot });
    let stdout = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.on('close', () => {
      // exit 1 means no paths were ignored — treat the same as exit 0
      resolve(new Set(stdout.split('\n').filter(Boolean)));
    });
    proc.on('error', () => resolve(new Set()));
    proc.stdin.write(relativePaths.join('\n'));
    proc.stdin.end();
  });
}

/**
 * Walk up from `startPath` looking for a `.git` entry (directory for normal
 * repos, file for worktree gitlinks). Returns the directory containing the
 * `.git` entry, or `null` if no repo is found before hitting the filesystem
 * root.
 *
 * `startPath` itself is checked first — so if `startPath` *is* a repo root,
 * that path is returned.
 */
export function findEnclosingGitRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Execute a git command safely without shell interpolation.
 */
export async function gitExec(
  args: string[],
  options: { cwd: string; maxBuffer?: number }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, options);
}

export interface GitCapturedResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run git and return its exit code alongside the output instead of throwing.
 * A non-zero exit is ordinary for many commands — `grep` with no matches,
 * `diff --exit-code`, `rev-parse @{u}` on a branch with no upstream — so the
 * caller decides what the code means.
 */
export async function gitExecCaptured(
  args: string[],
  options: { cwd: string; maxBuffer?: number }
): Promise<GitCapturedResult> {
  try {
    const { stdout, stderr } = await gitExec(args, options);
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: unknown; message?: string };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? String(error),
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
    };
  }
}

/**
 * Resolve the merge-base between a base branch and HEAD.
 */
export async function getMergeBase(
  repoPath: string,
  baseBranch: string
): Promise<string> {
  const { stdout } = await gitExec(
    ['merge-base', baseBranch, 'HEAD'],
    { cwd: repoPath }
  );
  return stdout.trim();
}

/**
 * Resolve the immutable fork-point SHA for a worktree, to be captured once when
 * the worktree is created and stored on the session. For a freshly created
 * branch HEAD equals the base, so the merge-base is exactly the fork point;
 * computing it also stays correct if the agent has already committed. Falls back
 * to the base branch's current tip, then to HEAD, so a SHA is always returned.
 */
export async function resolveBaseSha(
  repoPath: string,
  baseBranch: string
): Promise<string | null> {
  try {
    return await getMergeBase(repoPath, baseBranch);
  } catch {
    // No common ancestor (e.g. unrelated histories) — fall through.
  }
  for (const ref of [baseBranch, 'HEAD']) {
    try {
      const { stdout } = await gitExec(['rev-parse', ref], { cwd: repoPath });
      const sha = stdout.trim();
      if (sha) return sha;
    } catch {
      // try next ref
    }
  }
  return null;
}

/**
 * Get the diff between a base branch's merge-base and the current worktree.
 * This includes committed, staged, and unstaged tracked changes so PR
 * generation reflects the live dev-session worktree, not just HEAD.
 * Returns the diff output, truncated if very large.
 */
export async function getDiff(
  repoPath: string,
  baseBranch: string,
  // Named rather than positional: two different size limits live here, and a
  // caller passing a buffer size as the character cap reads as valid.
  options: { maxChars?: number; maxBuffer?: number; excludePathspecs?: string[] } = {}
): Promise<string> {
  const { maxChars = 100_000, maxBuffer = 10 * 1024 * 1024, excludePathspecs = [] } = options;
  const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
  const mergeBase = await getMergeBase(repoPath, effectiveBranch);
  // A positive `.` pathspec plus negative `:(exclude)` pathspecs keeps every
  // tracked path except the excluded ones. Empty list => no `--` separator, so
  // behavior is unchanged for existing callers (e.g. PR generation).
  const pathspecArgs = excludePathspecs.length > 0 ? ['--', '.', ...excludePathspecs] : [];
  const { stdout } = await gitExec(
    ['diff', mergeBase, ...pathspecArgs],
    { cwd: repoPath, maxBuffer }
  );
  if (stdout.length > maxChars) {
    return stdout.slice(0, maxChars) + '\n\n... (diff truncated)';
  }
  return stdout;
}

/**
 * Get the diff for committed PR contents only.
 * This intentionally excludes staged and unstaged worktree changes so generated
 * PR text describes exactly what `git push` will put on the branch.
 */
export async function getCommittedDiff(
  repoPath: string,
  baseBranch: string,
  maxChars = 100_000
): Promise<string> {
  const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
  const mergeBase = await getMergeBase(repoPath, effectiveBranch);
  const { stdout } = await gitExec(
    ['diff', mergeBase, 'HEAD'],
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
  const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
  const { stdout } = await gitExec(
    ['log', `${effectiveBranch}..HEAD`, '--oneline'],
    { cwd: repoPath }
  );
  return stdout.trim();
}

/**
 * Prefer the remote tracking branch over the local branch name.
 * After rebasing onto origin/master outside of KPM, the local base branch
 * ref (e.g. 'master') can be stale while origin/master points to the actual
 * rebase target. Using the upstream avoids showing master's new commits as
 * "ours" in the log and diff.
 */
export async function resolveUpstreamBranch(
  repoPath: string,
  baseBranch: string
): Promise<string> {
  try {
    const { stdout } = await gitExec(
      ['rev-parse', '--abbrev-ref', `${baseBranch}@{u}`],
      { cwd: repoPath }
    );
    const upstream = stdout.trim();
    if (upstream) return upstream;
  } catch {
    // No upstream configured for this branch
  }
  return baseBranch;
}

/**
 * How many commits HEAD is ahead of a base branch, or `null` when git could not
 * answer — an unresolvable base ref is not the same fact as "nothing committed
 * yet", and telling the user to commit work they already committed is the bug
 * that collapsing the two produced.
 */
export async function countCommitsAhead(
  repoPath: string,
  baseBranch: string
): Promise<number | null> {
  const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
  const counted = await gitExecCaptured(
    ['rev-list', '--count', `${effectiveBranch}..HEAD`],
    { cwd: repoPath }
  );
  if (counted.exitCode !== 0) return null;

  const ahead = parseInt(counted.stdout.trim(), 10);
  return Number.isNaN(ahead) ? null : ahead;
}

/**
 * Find and read a PR template from standard locations in a repo.
 * Searches: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md,
 * PULL_REQUEST_TEMPLATE.md, pull_request_template.md,
 * docs/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE/ (first .md file).
 */
export async function readPrTemplate(repoPath: string): Promise<string | null> {
  const { readFile, readdir } = await import('fs/promises');
  const { join } = await import('path');

  const candidates = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'PULL_REQUEST_TEMPLATE.md',
    'pull_request_template.md',
    'docs/pull_request_template.md',
  ];

  for (const candidate of candidates) {
    try {
      const content = await readFile(join(repoPath, candidate), 'utf-8');
      return content.trim();
    } catch {
      // File doesn't exist, try next
    }
  }

  // Check .github/PULL_REQUEST_TEMPLATE/ directory for first .md file
  try {
    const templateDir = join(repoPath, '.github', 'PULL_REQUEST_TEMPLATE');
    const files = await readdir(templateDir);
    const mdFile = files.find(f => f.endsWith('.md'));
    if (mdFile) {
      const content = await readFile(join(templateDir, mdFile), 'utf-8');
      return content.trim();
    }
  } catch {
    // Directory doesn't exist
  }

  return null;
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
