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
  let debounceTimer: NodeJS.Timeout | null = null;
  const pendingChanges = new Map<string, { type: ChangeType; isDirectory: boolean }>();

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

  async function stopWatching(): Promise<void> {
    if (subscription) {
      subscription = null;
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

      }
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
