/**
 * Git Utilities
 *
 * Reusable git operations for PR description generation, worktree management,
 * and review assessment. Uses execFile (no shell) to prevent command injection.
 *
 * Note: KPM does NOT perform end-user git operations (pull, push, commit,
 * stage, status, branch sync). Users manage those through their own tooling.
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

/**
 * Resolve the merge-base between a base branch and HEAD.
 */
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
 * Get the diff between a base branch's merge-base and the current worktree.
 * This includes committed, staged, and unstaged tracked changes so PR
 * generation reflects the live dev-session worktree, not just HEAD.
 * Returns the diff output, truncated if very large.
 */
export async function getDiff(
  repoPath: string,
  baseBranch: string,
): Promise<string> {
  const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
  const mergeBase = await getMergeBase(repoPath, effectiveBranch);
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
  const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
  const { stdout } = await gitExec(
    ['log', `${effectiveBranch}..HEAD`, '--oneline'],
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
 * Resolve the effective base branch: verify the declared branch exists in the
 * repo; if it doesn't (e.g. a session created against 'main' in a 'master'
 * repo), fall back to detectBaseBranch.
 */
export async function resolveBaseBranch(
  repoPath: string,
  declared?: string | null
): Promise<string> {
  if (declared) {
    try {
      await gitExec(['rev-parse', '--verify', declared], { cwd: repoPath });
      return declared;
    } catch {
      // branch doesn't exist in this repo — fall through to detection
    }
  }
  return detectBaseBranch(repoPath);
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
 * Check if a branch has any commits ahead of a base branch.
 */
export async function hasCommitsAhead(
  repoPath: string,
  baseBranch: string
): Promise<boolean> {
  try {
    const effectiveBranch = await resolveUpstreamBranch(repoPath, baseBranch);
    const { stdout } = await gitExec(
      ['rev-list', '--count', `${effectiveBranch}..HEAD`],
      { cwd: repoPath }
    );
    return parseInt(stdout.trim(), 10) > 0;
  } catch {
    return false;
  }
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
