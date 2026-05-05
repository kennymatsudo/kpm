import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import type { RepoEnvironmentMode } from '../../../shared/types';

const execFileAsync = promisify(execFile);

type CapturedEnv = Record<string, string>;

async function captureDirenv(cwd: string): Promise<CapturedEnv> {
  try {
    const { stdout } = await execFileAsync('direnv', ['export', 'json'], { cwd });
    const trimmed = stdout.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed) as Record<string, string | null>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== null) as [string, string][]
    );
  } catch {
    return {};
  }
}

/**
 * Capture environment variables for a worktree based on the configured mode.
 * Result is merged into the agent's env at session start.
 */
export async function captureRepoEnvironment(
  mode: RepoEnvironmentMode,
  worktreePath: string,
): Promise<CapturedEnv> {
  if (mode === 'none') return {};
  if (mode === 'direnv') return captureDirenv(worktreePath);
  if (mode === 'auto') {
    return existsSync(path.join(worktreePath, '.envrc'))
      ? captureDirenv(worktreePath)
      : {};
  }
  // nix: not yet implemented
  return {};
}
