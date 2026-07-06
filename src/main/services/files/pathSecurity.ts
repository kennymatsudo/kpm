/**
 * Realpath-aware security checks for file explorer operations.
 *
 * FileExplorerService first enforces lexical containment (the relative path
 * can't escape the project root with `..`). Once that passes, this module
 * decides whether the operation is allowed to touch the actual on-disk target
 * a symlink might point at:
 *
 * 1. The realpath of the target (or its nearest existing ancestor for paths
 *    that don't exist yet) is computed.
 * 2. If it falls inside one of the configured `deniedRealpathRoots`
 *    (defaults cover SSH keys, cloud creds, GPG, keychains, etc.), the
 *    operation is rejected.
 * 3. If the realpath is outside the project root, the result is marked
 *    `external: true` so callers can emit an audit event.
 *
 * This is the second-pass check called by `FileExplorerService` on every
 * operation that touches file content. It is deliberately separate from
 * lexical path validation, so listing performance and dry-run validation
 * don't pay a `realpath` syscall per entry.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getConfig } from '../../config';

/** Best-effort realpath: walks up to the nearest existing ancestor. */
export async function resolveBestEffortRealpath(targetPath: string): Promise<string> {
  const missing: string[] = [];
  let current = path.resolve(targetPath);

  while (true) {
    try {
      const real = await fs.promises.realpath(current);
      return missing.length === 0 ? real : path.resolve(real, ...missing);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(targetPath);
      }
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

export function defaultDeniedRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.ssh'),
    path.join(home, '.aws'),
    path.join(home, '.gnupg'),
    path.join(home, '.config', 'gh'),
    path.join(home, '.config', 'git-credential'),
    path.join(home, '.netrc'),
    path.join(home, '.kube'),
    path.join(home, '.docker'),
    path.join(home, 'Library', 'Keychains'),
    path.join(home, 'Library', 'Application Support', 'Authy Desktop'),
    path.join(home, 'Library', 'Application Support', '1Password'),
    path.join(home, 'Library', 'Group Containers', 'group.com.apple.secure-control-center-preferences'),
    '/etc/ssh',
    '/etc/sudoers',
    '/etc/sudoers.d',
    '/etc/shadow',
    '/private/etc/sudoers',
  ];
}

function isInsideRoot(candidate: string, root: string): boolean {
  if (candidate === root) return true;
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Expand a leading `~` / `~/` to the current user's home directory. `realpath`
 * does not expand `~`, so a candidate like `~/.ssh/id_rsa` must be expanded
 * before it can be resolved and compared against the denied roots.
 */
export function expandTilde(candidatePath: string): string {
  if (candidatePath === '~') return os.homedir();
  if (candidatePath.startsWith('~/')) return path.join(os.homedir(), candidatePath.slice(2));
  return candidatePath;
}

/**
 * True when `candidatePath` (after `~` expansion and realpath resolution)
 * resolves inside one of the denied credential roots. Optionally resolves a
 * relative candidate against `baseDir` first (defaults to the process cwd).
 */
export async function pathResolvesIntoDeniedRoot(
  candidatePath: string,
  baseDir?: string
): Promise<boolean> {
  const expanded = expandTilde(candidatePath);
  const absolute = path.isAbsolute(expanded)
    ? expanded
    : path.resolve(baseDir ?? process.cwd(), expanded);
  const realpath = await resolveBestEffortRealpath(absolute);
  for (const denied of await getDeniedRealpathRootsAsync()) {
    if (isInsideRoot(realpath, denied)) return true;
  }
  return false;
}

/**
 * Lexical check for a `.git/hooks` path segment. A file whose path passes
 * through a `.git/hooks` directory is an executable git hook — writing one
 * turns "write a file" into "run code on the next commit". Reads are not
 * affected by this (hooks may legitimately need to be read).
 */
export function isGitHooksPath(fullPath: string): boolean {
  const segments = path.resolve(fullPath).split(path.sep);
  for (let i = 0; i + 1 < segments.length; i++) {
    if (segments[i] === '.git' && segments[i + 1] === 'hooks') return true;
  }
  return false;
}

/**
 * Returns the merged, realpath-normalized list of denied roots
 * (platform defaults + user config). Each entry is run through realpath when
 * it exists — important on macOS where e.g. `/var` resolves to `/private/var`,
 * so a denied root passed in as `/var/...` would otherwise never match a
 * realpath that returned `/private/var/...`. Non-existent entries are kept
 * lexically so the list stays useful before any sensitive dir is created.
 */
export async function getDeniedRealpathRootsAsync(): Promise<string[]> {
  const extras = getConfig().fileExplorer?.deniedRealpathRoots ?? [];
  const merged = [...defaultDeniedRoots(), ...extras];
  const normalized = await Promise.all(
    merged.map(async (p) => {
      const lexical = path.resolve(p);
      try {
        return await fs.promises.realpath(lexical);
      } catch {
        return lexical;
      }
    })
  );
  return Array.from(new Set(normalized));
}

export interface RealpathAccessResult {
  allowed: boolean;
  /** Human-readable reason populated when `allowed: false`. */
  reason?: string;
  /** True when the resolved realpath is outside the project root. */
  external: boolean;
  /** Best-effort realpath of the candidate (resolved through any symlinks). */
  realpath: string;
}

/**
 * Decide whether a file explorer operation may touch `fullPath`. Pass the
 * project's folder so we can flag cross-boundary access for the audit feed.
 */
export async function checkRealpathAccess(
  fullPath: string,
  projectFolder: string,
  opts?: { denyGitHooksWrite?: boolean }
): Promise<RealpathAccessResult> {
  const realpath = await resolveBestEffortRealpath(fullPath);
  const realBase = await resolveBestEffortRealpath(projectFolder);

  const external = !isInsideRoot(realpath, realBase);

  if (opts?.denyGitHooksWrite && (isGitHooksPath(realpath) || isGitHooksPath(fullPath))) {
    return {
      allowed: false,
      reason: 'Access denied: writing git hooks is not permitted',
      external,
      realpath,
    };
  }

  for (const denied of await getDeniedRealpathRootsAsync()) {
    if (isInsideRoot(realpath, denied)) {
      return {
        allowed: false,
        reason: `Access denied: path resolves inside a protected location (${denied})`,
        external,
        realpath,
      };
    }
  }

  return { allowed: true, external, realpath };
}

/**
 * Check an arbitrary absolute target (e.g. the destination of a new symlink
 * or the source of a `copyExternalFile`). Returns `allowed: false` when the
 * realpath lands inside a denied root. Does not classify cross-boundary —
 * such targets are explicitly external by purpose.
 */
export async function checkExternalTargetAllowed(
  absoluteTarget: string
): Promise<{ allowed: boolean; reason?: string; realpath: string }> {
  const realpath = await resolveBestEffortRealpath(absoluteTarget);
  for (const denied of await getDeniedRealpathRootsAsync()) {
    if (isInsideRoot(realpath, denied)) {
      return {
        allowed: false,
        reason: `Access denied: target resolves inside a protected location (${denied})`,
        realpath,
      };
    }
  }
  return { allowed: true, realpath };
}
