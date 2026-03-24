/**
 * GitHub CLI Utilities
 *
 * Reusable GitHub operations via the `gh` CLI.
 * Uses execFile (no shell) to prevent command injection.
 * Mirrors the pattern in gitUtils.ts.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { gitExec } from './gitUtils';

const execFileAsync = promisify(execFile);

// =============================================================================
// Types
// =============================================================================

export interface GhAuthResult {
  authenticated: boolean;
  account?: string;
}

export interface GhPrCreateResult {
  number: number;
  url: string;
}

export interface GhPrStatus {
  number: number;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  checksStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  additions: number;
  deletions: number;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
}

// =============================================================================
// Core Execution
// =============================================================================

/**
 * Execute a gh CLI command safely without shell interpolation.
 */
  args: string[],
  options: { cwd: string; maxBuffer?: number }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('gh', args, options);
}

// =============================================================================
// Auth
// =============================================================================

/**
 * Check if the user is authenticated with GitHub CLI.
 */
export async function checkGhAuth(cwd: string): Promise<GhAuthResult> {
  try {
    const { stdout, stderr } = await ghExec(
      ['auth', 'status', '--hostname', 'github.com'],
      { cwd }
    );
    // gh auth status writes account info to stderr (not stdout)
    const output = stdout + stderr;
    const accountMatch = /Logged in to github\.com account (\S+)/.exec(output);
    return {
      authenticated: true,
      account: accountMatch?.[1],
    };
  } catch (error) {
    // gh auth status exits non-zero when not authenticated
    if (error instanceof Error && 'stderr' in error) {
      const stderr = (error as { stderr: string }).stderr;
      const accountMatch = /Logged in to github\.com account (\S+)/.exec(stderr);
      if (accountMatch) {
        return { authenticated: true, account: accountMatch[1] };
      }
    }
    return { authenticated: false };
  }
}

// =============================================================================
// Repository Info
// =============================================================================

/**
 * Get the owner/repo slug for a repository (e.g., "octocat/hello-world").
 */
  const { stdout } = await ghExec(
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { cwd }
  );
  return stdout.trim();
}

// =============================================================================
// Pull Requests
// =============================================================================

  const args = [
    'pr', 'create',
    '--head', opts.head,
    '--base', opts.base,
    '--title', opts.title,
    '--body', opts.body,
  ];
  if (opts.draft) {
    args.push('--draft');
  }

  const { stdout } = await ghExec(args, { cwd });
}

/**
 * Get PR status for a branch. Returns null if no PR exists.
 */
export async function getPrForBranch(
  cwd: string,
  branch: string
): Promise<GhPrStatus | null> {
  try {
    const { stdout } = await ghExec(
      [
        'pr', 'view', branch,
      ],
      { cwd }
    );

  } catch {
    // gh pr view exits non-zero when no PR exists for the branch
    return null;
  }
}

// =============================================================================
// Git Operations
// =============================================================================

/**
 * Push a branch to origin with upstream tracking.
 */
export async function pushBranch(cwd: string, branch: string): Promise<void> {
  await gitExec(['push', '-u', 'origin', branch], { cwd });
}

/**
 * Check if a branch has been pushed to the remote.
 */
export async function isBranchPushed(cwd: string, branch: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', `origin/${branch}`], { cwd });
    return true;
  } catch {
    return false;
  }
}
