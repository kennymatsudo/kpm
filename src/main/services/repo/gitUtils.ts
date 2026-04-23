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
