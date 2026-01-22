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

    try {
      }


    } catch {
      return null;
    }
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
