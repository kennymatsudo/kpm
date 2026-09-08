import path from 'path';
import type { FileNode } from '../../../shared/types';
import { findEnclosingGitRoot, getIgnoredPaths } from './gitUtils';

const IGNORE_CACHE_TTL_MS = 30_000;

/**
 * A recursive listing caches one entry per node, so a large connected repo would
 * otherwise retain every path it has ever listed. Dropping a repo's whole cache
 * costs one `git check-ignore` to rebuild.
 */
const MAX_CACHED_PATHS_PER_ROOT = 20_000;

interface IgnoreEntry {
  ignored: boolean;
  expiresAt: number;
}

const ignoreCacheByRoot = new Map<string, Map<string, IgnoreEntry>>();

export async function resolveIgnoredPaths(
  gitRoot: string,
  relativePaths: string[]
): Promise<Set<string>> {
  if (relativePaths.length === 0) return new Set();

  const now = Date.now();
  let repoCache = ignoreCacheByRoot.get(gitRoot);
  if (!repoCache) {
    repoCache = new Map();
    ignoreCacheByRoot.set(gitRoot, repoCache);
  }

  const result = new Set<string>();
  const unknown: string[] = [];
  for (const relativePath of relativePaths) {
    const entry = repoCache.get(relativePath);
    if (entry && entry.expiresAt > now) {
      if (entry.ignored) result.add(relativePath);
    } else {
      unknown.push(relativePath);
    }
  }

  if (unknown.length === 0) return result;

  const ignored = await getIgnoredPaths(gitRoot, unknown);
  const expiresAt = Date.now() + IGNORE_CACHE_TTL_MS;
  if (repoCache.size + unknown.length > MAX_CACHED_PATHS_PER_ROOT) {
    repoCache.clear();
  }
  for (const relativePath of unknown) {
    const isIgnored = ignored.has(relativePath);
    repoCache.set(relativePath, { ignored: isIgnored, expiresAt });
    if (isIgnored) result.add(relativePath);
  }

  return result;
}

export function invalidateIgnoreCache(gitRoot?: string): void {
  if (gitRoot) {
    ignoreCacheByRoot.delete(gitRoot);
  } else {
    ignoreCacheByRoot.clear();
  }
}

interface GitRootEntry {
  root: string | null;
  expiresAt: number;
}

const gitRootCache = new Map<string, GitRootEntry>();

export function resolveGitRoot(startPath: string): string | null {
  const now = Date.now();
  const cached = gitRootCache.get(startPath);
  if (cached && cached.expiresAt > now) {
    return cached.root;
  }

  const root = findEnclosingGitRoot(startPath);
  gitRootCache.set(startPath, { root, expiresAt: now + IGNORE_CACHE_TTL_MS });
  return root;
}

function flattenNodes(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  const walk = (ns: FileNode[]) => ns.forEach(n => { result.push(n); if (n.children) walk(n.children); });
  walk(nodes);
  return result;
}

export async function markIgnoredNodes(nodes: FileNode[], root: string, gitRoot: string): Promise<void> {
  const flat = flattenNodes(nodes);
  if (flat.length === 0) return;
  const relToGit = flat.map(n => path.relative(gitRoot, path.join(root, n.path)));
  const ignored = await resolveIgnoredPaths(gitRoot, relToGit);
  flat.forEach((n, i) => { if (ignored.has(relToGit[i])) n.isIgnored = true; });
}
