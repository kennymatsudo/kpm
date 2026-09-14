import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import type { RepoEnvironmentMode } from '../../../shared/types';

const execFileAsync = promisify(execFile);

type CapturedEnv = Record<string, string>;

export interface CapturedRepoEnvironment {
  vars: CapturedEnv;
  /**
   * Set when direnv was the configured source but produced nothing usable —
   * on a fresh worktree that is almost always a missing `direnv allow`, which
   * otherwise looks like a repo whose tests inexplicably fail.
   */
  direnvFailure?: string;
}

async function captureDirenv(cwd: string): Promise<CapturedRepoEnvironment> {
  try {
    const { stdout } = await execFileAsync('direnv', ['export', 'json'], { cwd });
    const trimmed = stdout.trim();
    if (!trimmed) return { vars: {}, direnvFailure: 'direnv exported no variables' };
    const parsed = JSON.parse(trimmed) as Record<string, string | null>;
    return {
      vars: Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== null) as [string, string][]
      ),
    };
  } catch (error) {
    return { vars: {}, direnvFailure: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Capture environment variables for a worktree based on the configured mode.
 * Result is merged into the agent's env at session start.
 */
export async function captureRepoEnvironment(
  mode: RepoEnvironmentMode,
  worktreePath: string,
): Promise<CapturedRepoEnvironment> {
  if (mode === 'none') return { vars: {} };
  if (mode === 'direnv') return captureDirenv(worktreePath);
  if (mode === 'auto') {
    return existsSync(path.join(worktreePath, '.envrc'))
      ? captureDirenv(worktreePath)
      : { vars: {} };
  }
  // nix: not yet implemented
  return { vars: {} };
}
