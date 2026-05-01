/**
 * Project Watcher Service
 *
 * Watches project folders for external file changes (Finder, terminal, etc.)
 * and emits events to refresh the file tree in real-time.
 *
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';
import { getConfig } from '../../config';


// =============================================================================
// Dependencies
// =============================================================================

export interface ProjectWatcherServiceDeps {
  getMainWindow: () => BrowserWindow | null;
  getProjectFolder: (projectId: string) => string | null;
}

// =============================================================================
// =============================================================================

export function createProjectWatcherService(deps: ProjectWatcherServiceDeps) {
  let watchedProjectId: string | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  function emitFileChange(
    projectId: string,
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
    }
    pendingChanges.clear();
  }

    projectId: string,
    projectFolder: string,
  ): Promise<void> {

    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushPendingChanges(projectId);
    }, getConfig().watcher.projectDebounceMs);
  }

  return {
    /**
     */

      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return { success: false, error: 'Project not found' };
      }
      if (!fs.existsSync(projectFolder)) {
        return { success: false, error: 'Project folder does not exist' };
      }

      }
    },

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
