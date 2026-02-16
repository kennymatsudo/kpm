import fs from 'fs';
import path from 'path';
import type { FileNode } from '../../../shared/types';

const CASE_INSENSITIVE_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });
const DIRECTORY_ENTRY_READ_CONCURRENCY = 16;

export interface ScopedPathResult {
  valid: boolean;
  fullPath: string;
}

export interface ListScopedDirectoryOptions {
  rootPath: string;
  directoryPath: string;
  recursive: boolean;
  maxDepth: number;
  currentDepth?: number;
  shouldHideEntry: (entryName: string) => boolean;
  onEntryReadError?: (entryPath: string, error: unknown) => void;
}

function isExplicitAbsolutePath(targetPath: string): boolean {
  return (
    path.isAbsolute(targetPath)
    || path.win32.isAbsolute(targetPath)
    || /^[a-zA-Z]:/.test(targetPath)
  );
}

/**
 */
export function resolveScopedPath(basePath: string, targetPath: string): ScopedPathResult {
  const normalizedBase = path.resolve(basePath);
  const candidatePath = path.resolve(basePath, targetPath);

  if (targetPath.includes('\0') || isExplicitAbsolutePath(targetPath)) {
    return { valid: false, fullPath: candidatePath };
  }

  const isValid = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));

}

/**
 * Async variant — ensures parent directory exists for non-blocking write paths.
 */
export async function ensureParentDirectory(fullPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
}

/**
 * Async path existence check without blocking the event loop.
 */
export async function pathExists(fullPath: string): Promise<boolean> {
  try {
    await fs.promises.lstat(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build FileNode info for a single path with symlink-awareness.
 */
export async function getScopedEntryInfo(
  fullPath: string,
  relativePath: string,
  fallbackName?: string
): Promise<FileNode> {
  const stats = await fs.promises.lstat(fullPath);
  const isSymlink = stats.isSymbolicLink();
  let isDirectory = stats.isDirectory();
  let symlinkTarget: string | undefined;
  let isSymlinkBroken = false;

  if (isSymlink) {
    try {
      symlinkTarget = await fs.promises.readlink(fullPath);
      const realStats = await fs.promises.stat(fullPath);
      isDirectory = realStats.isDirectory();
    } catch {
      isSymlinkBroken = true;
    }
  }

  return {
    name: path.basename(relativePath) || fallbackName || path.basename(fullPath),
    path: relativePath,
    isDirectory,
    isSymlink,
    symlinkTarget,
    isSymlinkBroken,
    modifiedAt: stats.mtime.toISOString(),
    size: stats.size,
  };
}

async function readDirectoryIfExists(dirPath: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function toFileNode(
  absolutePath: string,
  relativePath: string,
  hintedIsDirectory: boolean
): Promise<FileNode> {
  const stats = await fs.promises.lstat(absolutePath);
  const isSymlink = stats.isSymbolicLink();
  let isDirectory = hintedIsDirectory;
  let symlinkTarget: string | undefined;
  let isSymlinkBroken = false;

  if (isSymlink) {
    try {
      symlinkTarget = await fs.promises.readlink(absolutePath);
      const realStats = await fs.promises.stat(absolutePath);
      isDirectory = realStats.isDirectory();
    } catch {
      isSymlinkBroken = true;
    }
  }

  return {
    name: path.basename(absolutePath),
    path: relativePath,
    isDirectory,
    isSymlink,
    symlinkTarget,
    isSymlinkBroken,
    modifiedAt: stats.mtime.toISOString(),
    size: stats.size,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = new Array(safeConcurrency).fill(null).map(async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

function sortFileNodes(nodes: FileNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return CASE_INSENSITIVE_COLLATOR.compare(a.name, b.name);
  });
}

/**
 * Build a directory tree rooted at `directoryPath` with path scoping to `rootPath`.
 * Uses async fs APIs to avoid blocking the Electron main thread during large scans.
 */
export async function listScopedDirectory(options: ListScopedDirectoryOptions): Promise<FileNode[]> {
  const {
    rootPath,
    directoryPath,
    recursive,
    maxDepth,
    currentDepth = 0,
    shouldHideEntry,
    onEntryReadError,
  } = options;

  const entries = await readDirectoryIfExists(directoryPath);
  const visibleEntries = entries.filter((entry) => !shouldHideEntry(entry.name));
  const nodesOrNull = await mapWithConcurrency(
    visibleEntries,
    DIRECTORY_ENTRY_READ_CONCURRENCY,
    async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = path.relative(scopedRootPath, entryPath);

      try {
        const node = await toFileNode(entryPath, relativePath, entry.isDirectory());

        if (node.isDirectory && recursive && currentDepth < maxDepth && !node.isSymlinkBroken) {
          if (!scopedEntry.valid) {
            return node;
          }

          node.children = await listScopedDirectory({
            ...options,
            rootPath: scopedRootPath,
            directoryPath: scopedEntry.fullPath,
            currentDepth: currentDepth + 1,
          });
        }

        return node;
      } catch (error) {
        onEntryReadError?.(entryPath, error);
        return null;
      }
    }
  );
  const nodes = nodesOrNull.filter((node): node is FileNode => node !== null);

  sortFileNodes(nodes);
  return nodes;
}
