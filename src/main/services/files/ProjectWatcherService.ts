/**
 * Project Watcher Service
 *
 * Watches project folders for external file changes (Finder, terminal, etc.)
 * and emits events to refresh the file tree in real-time.
 *
 * Uses @parcel/watcher (native FSEvents/inotify/ReadDirectoryChangesW). Node's
 * `fs.watch({ recursive: true })` has long-standing event-delivery bugs on
 * macOS (libuv-level); @parcel/watcher is what VS Code, webpack/watchpack, and
 * Nx use for exactly this case.
 */

import * as fs from 'fs';
import * as path from 'path';
import { subscribe, type AsyncSubscription, type Event as WatcherEvent } from '@parcel/watcher';
import type { BrowserWindow } from 'electron';
import { getConfig } from '../../config';

/** Glob patterns the watcher ignores natively (no event delivery for these). */

// =============================================================================
// Dependencies
// =============================================================================

export interface ProjectWatcherServiceDeps {
  getMainWindow: () => BrowserWindow | null;
  getProjectFolder: (projectId: string) => string | null;
  /** Optional callback invoked for each external file change after the renderer is notified */
  onExternalFileChange?: (event: {
    projectId: string;
    type: 'created' | 'updated' | 'deleted';
    path: string;
    isDirectory: boolean;
  }) => void;
}

type ChangeType = 'created' | 'updated' | 'deleted';

// =============================================================================
// Factory
// =============================================================================

export function createProjectWatcherService(deps: ProjectWatcherServiceDeps) {
  let watchedProjectId: string | null = null;
  let subscription: AsyncSubscription | null = null;
  let subscribeOperation: Promise<void> | null = null;
  let watchGeneration = 0;
  let debounceTimer: NodeJS.Timeout | null = null;
  const pendingChanges = new Map<string, { type: ChangeType; isDirectory: boolean }>();
  const pendingWatcherOperations = new Set<Promise<void>>();

  function emitFileChange(
    projectId: string,
    type: ChangeType,
    relativePath: string,
    isDirectory: boolean
  ): void {
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-explorer:file-changed', {
        projectId,
        type,
        path: relativePath,
        isDirectory,
      });
    }
  }

  function flushPendingChanges(projectId: string): void {
    for (const [relativePath, { type, isDirectory }] of pendingChanges) {
      emitFileChange(projectId, type, relativePath, isDirectory);
      deps.onExternalFileChange?.({ projectId, type, path: relativePath, isDirectory });
    }
    pendingChanges.clear();
  }

  async function handleEvents(
    projectId: string,
    projectFolder: string,
    events: WatcherEvent[]
  ): Promise<void> {
    for (const event of events) {
      const relativePath = path.relative(projectFolder, event.path);
      if (!relativePath || relativePath.startsWith('..')) continue;

      const changeType: ChangeType =
        event.type === 'create' ? 'created' : event.type === 'update' ? 'updated' : 'deleted';

      let isDirectory = false;
      if (changeType !== 'deleted') {
        try {
          const stats = await fs.promises.stat(event.path);
          isDirectory = stats.isDirectory();
        } catch {
          // File was created and removed before we could stat — treat as deleted.
          pendingChanges.set(relativePath, { type: 'deleted', isDirectory: false });
          continue;
        }
      }

      pendingChanges.set(relativePath, { type: changeType, isDirectory });
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushPendingChanges(projectId);
    }, getConfig().watcher.projectDebounceMs);
  }

  function trackWatcherOperation(operation: Promise<void>): Promise<void> {
    pendingWatcherOperations.add(operation);
    operation.then(
      () => pendingWatcherOperations.delete(operation),
      () => pendingWatcherOperations.delete(operation),
    );
    return operation;
  }

  function unsubscribeWatcher(sub: AsyncSubscription): Promise<void> {
    return trackWatcherOperation(
      sub.unsubscribe().catch((error) => {
        console.error('[ProjectWatcher] Failed to unsubscribe:', error);
      }),
    );
  }

  async function waitForWatcherOperations(): Promise<void> {
    while (pendingWatcherOperations.size > 0) {
      await Promise.all(Array.from(pendingWatcherOperations));
    }
  }

  async function stopWatching(): Promise<void> {
    watchGeneration += 1;

    if (subscription) {
      const sub = subscription;
      subscription = null;
      await unsubscribeWatcher(sub);
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingChanges.clear();
    if (watchedProjectId) {
      console.log(`[ProjectWatcher] Stopped watching project: ${watchedProjectId}`);
      watchedProjectId = null;
    }
    if (subscribeOperation) {
      await subscribeOperation;
    }
    await waitForWatcherOperations();
  }

  return {
    /**
     * Start watching a project folder for file changes. Only one project is
     * watched at a time; existing subscription is torn down first.
     */
    async watchProject(projectId: string): Promise<{ success: boolean; error?: string }> {
      await stopWatching();

      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return { success: false, error: 'Project not found' };
      }
      if (!fs.existsSync(projectFolder)) {
        return { success: false, error: 'Project folder does not exist' };
      }

      const generation = watchGeneration + 1;
      watchGeneration = generation;

      const startPromise = (async (): Promise<{ success: boolean; error?: string }> => {
        try {
          const sub = await subscribe(
            projectFolder,
            (err, events) => {
              if (watchGeneration !== generation) {
                return;
              }
              if (err) {
                console.error(`[ProjectWatcher] Watch error for ${projectFolder}:`, err);
                return;
              }
              void handleEvents(projectId, projectFolder, events);
            },
            { ignore: IGNORE_GLOBS }
          );

          if (watchGeneration !== generation) {
            await unsubscribeWatcher(sub);
            return { success: false, error: 'Watch cancelled' };
          }

          subscription = sub;
          watchedProjectId = projectId;
          console.log(`[ProjectWatcher] Watching: ${projectFolder}`);
          return { success: true };
        } catch (error) {
          console.error(`[ProjectWatcher] Failed to watch ${projectFolder}:`, error);
          return { success: false, error: `Failed to watch project: ${error}` };
        }
      })();

      const pendingStart = trackWatcherOperation(startPromise.then(() => undefined));
      subscribeOperation = pendingStart;
      const result = await startPromise;
      if (subscribeOperation === pendingStart) {
        subscribeOperation = null;
      }
      return result;
    },

    async unwatchProject(): Promise<void> {
      await stopWatching();
    },

    getWatchedProjectId(): string | null {
      return watchedProjectId;
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type ProjectWatcherService = ReturnType<typeof createProjectWatcherService>;
