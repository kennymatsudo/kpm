/**
 * Realpath-aware security checks for file explorer operations.
 *
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

function defaultDeniedRoots(): string[] {
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
  projectFolder: string
): Promise<RealpathAccessResult> {
  const realpath = await resolveBestEffortRealpath(fullPath);
  const realBase = await resolveBestEffortRealpath(projectFolder);

  const external = !isInsideRoot(realpath, realBase);

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
