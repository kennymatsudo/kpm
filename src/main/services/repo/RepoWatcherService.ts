/**
 * Repo Watcher Service
 *
 * Tracks git branch changes for connected repositories.
 * Watches .git/HEAD files and notifies renderer of branch changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';

// =============================================================================
// Dependencies
// =============================================================================

export interface RepoWatcherServiceDeps {
  /** Function to get the main window for IPC */
  getMainWindow: () => BrowserWindow | null;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRepoWatcherService(deps: RepoWatcherServiceDeps) {
  /** Map of repo paths to their file watchers */
  const watchers = new Map<string, fs.FSWatcher>();

  /** Map of repo paths to their current branch (cached) */
  const branchCache = new Map<string, string | null>();

  /** Debounce timers to prevent rapid-fire events */
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  function parseBranchFromHead(headContents: string): string | null {
    const trimmed = headContents.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('ref:')) {
      const refPath = trimmed.slice(4).trim();
      if (!refPath) return null;
      const headsPrefix = 'refs/heads/';
      return refPath.startsWith(headsPrefix) ? refPath.slice(headsPrefix.length) : refPath;
    }

    // Detached HEAD - match `git rev-parse --abbrev-ref HEAD` behavior.
    return 'HEAD';
  }

  function resolveGitDirSync(repoPath: string): string | null {
    const gitPath = path.join(repoPath, '.git');
    try {
      const stats = fs.statSync(gitPath);
      if (stats.isDirectory()) return gitPath;
      if (stats.isFile()) {
        const contents = fs.readFileSync(gitPath, 'utf-8');
        const match = /^gitdir:\s*(.+)$/m.exec(contents);
        if (!match) return null;
        const gitDirPath = match[1].trim();
        return path.isAbsolute(gitDirPath) ? gitDirPath : path.resolve(repoPath, gitDirPath);
      }
    } catch {
      return null;
    }
    return null;
  }

  async function resolveGitDir(repoPath: string): Promise<string | null> {
    const gitPath = path.join(repoPath, '.git');
    try {
      const stats = await fs.promises.stat(gitPath);
      if (stats.isDirectory()) return gitPath;
      if (stats.isFile()) {
        const contents = await fs.promises.readFile(gitPath, 'utf-8');
        const match = /^gitdir:\s*(.+)$/m.exec(contents);
        if (!match) return null;
        const gitDirPath = match[1].trim();
        return path.isAbsolute(gitDirPath) ? gitDirPath : path.resolve(repoPath, gitDirPath);
      }
    } catch {
      return null;
    }
    return null;
  }

  function readBranchFromGitDirSync(gitDir: string): string | null {
    try {
      const headPath = path.join(gitDir, 'HEAD');
      const headContents = fs.readFileSync(headPath, 'utf-8');
      return parseBranchFromHead(headContents);
    } catch {
      return null;
    }
  }

  async function readBranchFromGitDir(gitDir: string): Promise<string | null> {
    try {
      const headPath = path.join(gitDir, 'HEAD');
      const headContents = await fs.promises.readFile(headPath, 'utf-8');
      return parseBranchFromHead(headContents);
    } catch {
      return null;
    }
  }

  /**
   * Get the current git branch for a repository path.
   * Returns null if not a git repo or on error.
   */
  function getBranch(repoPath: string): string | null {
    const gitDir = resolveGitDirSync(repoPath);
    if (!gitDir) return null;
    return readBranchFromGitDirSync(gitDir);
  }

  async function getBranchAsync(repoPath: string): Promise<string | null> {
    const gitDir = await resolveGitDir(repoPath);
    if (!gitDir) return null;
    return readBranchFromGitDir(gitDir);
  }

  /**
   * Handle a branch change event.
   */
  function handleBranchChange(repoId: string, repoPath: string): void {
    const newBranch = getBranch(repoPath);
    const oldBranch = branchCache.get(repoPath);

    // Only emit if branch actually changed
    if (newBranch !== oldBranch) {
      branchCache.set(repoPath, newBranch);
      console.log(`[RepoWatcher] Branch changed: ${repoPath} (${oldBranch} -> ${newBranch})`);

      // Notify renderer
      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('repo:branch-changed', {
          repoId,
          repoPath,
          branch: newBranch,
        });
      }
    }
  }

  return {
    /**
     * Get the current git branch for a repository path.
     * Returns null if not a git repo or on error.
     */
    getBranch,

    /**
     * Get branches for multiple repos at once.
     * More efficient than calling getBranch repeatedly.
     */
    getBranches(repoPaths: string[]): Record<string, string | null> {
      const result: Record<string, string | null> = {};
      for (const repoPath of repoPaths) {
        result[repoPath] = getBranch(repoPath);
      }
      return result;
    },

    async getBranchesAsync(repoPaths: string[]): Promise<Record<string, string | null>> {
      const entries = await Promise.all(
        repoPaths.map(async (repoPath) => [repoPath, await getBranchAsync(repoPath)] as const)
      );
      return Object.fromEntries(entries);
    },

    /**
     * Start watching a repository for branch changes.
     */
    watchRepo(repoId: string, repoPath: string): void {
      // Don't double-watch
      if (watchers.has(repoPath)) {
        return;
      }

      const gitHeadPath = path.join(repoPath, '.git', 'HEAD');

      // Check if .git/HEAD exists
      if (!fs.existsSync(gitHeadPath)) {
        console.log(`[RepoWatcher] Not a git repo, skipping watch: ${repoPath}`);
        return;
      }

      // Get initial branch and cache it
      const initialBranch = getBranch(repoPath);
      branchCache.set(repoPath, initialBranch);

      try {
        const watcher = fs.watch(gitHeadPath, (eventType) => {
          // Handle both 'change' and 'rename' events
          // macOS often fires 'rename' when files are rewritten (which git does on branch switch)
          if (eventType !== 'change' && eventType !== 'rename') return;

          // Debounce to prevent rapid-fire events (some systems fire multiple)
          const existingTimer = debounceTimers.get(repoPath);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          debounceTimers.set(
            repoPath,
            setTimeout(() => {
              debounceTimers.delete(repoPath);
              handleBranchChange(repoId, repoPath);
          );
        });

        watcher.on('error', (error) => {
          console.error(`[RepoWatcher] Watch error for ${repoPath}:`, error);
          // Clean up on error
          this.unwatchRepo(repoPath);
        });

        watchers.set(repoPath, watcher);
        console.log(`[RepoWatcher] Watching: ${repoPath} (branch: ${initialBranch})`);
      } catch (error) {
        console.error(`[RepoWatcher] Failed to watch ${repoPath}:`, error);
      }
    },

    /**
     * Stop watching a repository.
     */
    unwatchRepo(repoPath: string): void {
      const watcher = watchers.get(repoPath);
      if (watcher) {
        watcher.close();
        watchers.delete(repoPath);
        branchCache.delete(repoPath);
        console.log(`[RepoWatcher] Stopped watching: ${repoPath}`);
      }

      // Clean up any pending debounce timer
      const timer = debounceTimers.get(repoPath);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(repoPath);
      }
    },

    /**
     * Stop watching all repositories.
     * Call this on app shutdown.
     */
    unwatchAll(): void {
      for (const repoPath of watchers.keys()) {
        this.unwatchRepo(repoPath);
      }
      console.log('[RepoWatcher] Stopped all watchers');
    },

    /**
     * Get the cached branch for a repo (if being watched).
     */
    getCachedBranch(repoPath: string): string | null | undefined {
      return branchCache.get(repoPath);
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type RepoWatcherService = ReturnType<typeof createRepoWatcherService>;

// =============================================================================
// Singleton Instance and Backwards-Compatible Exports
// =============================================================================

/** Module-level main window getter (set via init) */
let _getMainWindow: (() => BrowserWindow | null) | null = null;

/** Lazy singleton instance */
let _defaultService: RepoWatcherService | null = null;

function getDefaultService(): RepoWatcherService {
  if (!_defaultService) {
    if (!_getMainWindow) {
      throw new Error('RepoWatcherService not initialized. Call init() first.');
    }
    _defaultService = createRepoWatcherService({ getMainWindow: _getMainWindow });
  }
  return _defaultService;
}

/**
 * Initialize the RepoWatcher service with a window getter.
 * Must be called before using other methods.
 */
export function init(getMainWindow: () => BrowserWindow | null): void {
  _getMainWindow = getMainWindow;
  // Pre-create the service to validate initialization
  getDefaultService();
  console.log('[RepoWatcher] Initialized');
}

/** Get the current git branch for a repository path */
export function getBranch(repoPath: string): string | null {
  return getDefaultService().getBranch(repoPath);
}

/** Get branches for multiple repos at once */
export function getBranches(repoPaths: string[]): Record<string, string | null> {
  return getDefaultService().getBranches(repoPaths);
}

/** Get branches for multiple repos at once (async) */
export async function getBranchesAsync(repoPaths: string[]): Promise<Record<string, string | null>> {
  return getDefaultService().getBranchesAsync(repoPaths);
}

/** Start watching a repository for branch changes */
export function watchRepo(repoId: string, repoPath: string): void {
  getDefaultService().watchRepo(repoId, repoPath);
}

/** Stop watching a repository */
export function unwatchRepo(repoPath: string): void {
  getDefaultService().unwatchRepo(repoPath);
}

/** Stop watching all repositories */
export function unwatchAll(): void {
  getDefaultService().unwatchAll();
}

/** Get the cached branch for a repo (if being watched) */
export function getCachedBranch(repoPath: string): string | null | undefined {
  return getDefaultService().getCachedBranch(repoPath);
}
