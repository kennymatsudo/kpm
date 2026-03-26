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

    return parsePrViewOutput(stdout);
  } catch {
    // gh pr view exits non-zero when no PR exists for the branch
    return null;
  }
}

/**
 * Get PR status by PR number. Returns null if no PR exists.
 */
export async function getPrByNumber(
  cwd: string,
  prNumber: number
): Promise<GhPrStatus | null> {
  try {
    const { stdout } = await ghExec(
      [
        'pr', 'view', String(prNumber),
      ],
      { cwd }
    );

    return parsePrViewOutput(stdout);
  } catch {
    return null;
  }
}

/**
 * Parse a PR identifier string into a PR number.
 * Accepts: bare number, #number, or GitHub PR URL.
 */
export function parsePrIdentifier(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^#\d+$/.test(trimmed)) return parseInt(trimmed.slice(1), 10);
  const urlMatch = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/.exec(trimmed);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  return null;
}

/**
 * Parse `gh pr view --json` output into a GhPrStatus object.
 */
function parsePrViewOutput(stdout: string): GhPrStatus {
  const raw = JSON.parse(stdout) as {
    number: number;
    url: string;
    state: string;
    reviewDecision: string;
    statusCheckRollup: { state: string }[] | null;
    additions: number;
    deletions: number;
    mergeable: string;
  };

  let checksStatus: GhPrStatus['checksStatus'] = null;
  if (raw.statusCheckRollup && raw.statusCheckRollup.length > 0) {
    const states = raw.statusCheckRollup.map(c => c.state);
    if (states.every(s => s === 'SUCCESS')) {
      checksStatus = 'SUCCESS';
    } else if (states.some(s => s === 'FAILURE' || s === 'ERROR')) {
      checksStatus = 'FAILURE';
    } else {
      checksStatus = 'PENDING';
    }
  }

  return {
    number: raw.number,
    url: raw.url,
    state: raw.state as GhPrStatus['state'],
    reviewDecision: (raw.reviewDecision || null) as GhPrStatus['reviewDecision'],
    checksStatus,
    additions: raw.additions,
    deletions: raw.deletions,
    mergeable: (raw.mergeable || 'UNKNOWN') as GhPrStatus['mergeable'],
  };
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
