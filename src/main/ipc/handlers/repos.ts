import { dialog, shell, type BrowserWindow } from 'electron';
import type { z } from 'zod';
import type { RepoService } from '../../services/repo/RepoService';
import { RepoSchemas } from '../validation/project';
import { createRegistryIpcHandlers } from '../validation/utils';
import { repoEndpoints, type RepoEndpointName } from '../../../shared/ipc/repoEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';

/**
 * One handler per `repoEndpoints` entry. A registry entry without a matching
 * key here is a compile error, not a runtime "no handler" failure.
 */
type RepoHandlers = { [K in RepoEndpointName]: UnwrappedHandlerFor<typeof repoEndpoints, K> };

function buildRepoHandlers(getMainWindow: () => BrowserWindow | null, repoService: RepoService): RepoHandlers {
  return {
    add: ({ projectId, path: repoPath }) => {
      const result = repoService.add(projectId, repoPath);
      if (!result.ok) throw new Error(result.error);
      return { repo: result.data };
    },

    remove: ({ repoId }) => {
      const result = repoService.remove(repoId);
      if (!result.ok) throw new Error(result.error);
    },

    list: ({ projectId }) => {
      const result = repoService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return { repos: result.data };
    },

    selectDialog: async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { paths: [] };
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections'],
        title: 'Select Repositories',
      });
      return { paths: result.canceled ? [] : result.filePaths };
    },

    getBranch: ({ path: repoPath }) => {
      const result = repoService.getBranch(repoPath);
      if (!result.ok) throw new Error(result.error);
      return { branch: result.data };
    },

    getBranches: async ({ paths }) => {
      const result = await repoService.getBranchesAsync(paths);
      if (!result.ok) throw new Error(result.error);
      return { branches: result.data };
    },

    watch: ({ repoId, path: repoPath }) => {
      const result = repoService.watch(repoId, repoPath);
      if (!result.ok) throw new Error(result.error);
    },

    unwatch: ({ path: repoPath }) => {
      const result = repoService.unwatch(repoPath);
      if (!result.ok) throw new Error(result.error);
    },

    updateEnvironmentMode: ({ repoId, mode }) => {
      const result = repoService.updateEnvironmentMode(repoId, mode);
      if (!result.ok) throw new Error(result.error);
    },

    listDirectories: ({ repoPath, prefix, depth }) => {
      const result = repoService.listDirectories(repoPath, prefix, depth);
      if (!result.ok) throw new Error(result.error);
      return { directories: result.data };
    },

    listAllBranches: async ({ repoPath }) => {
      const result = await repoService.listAllBranches(repoPath);
      if (!result.ok) throw new Error(result.error);
      return { branches: result.data };
    },

    listWorktrees: async ({ repoPath }) => {
      const result = await repoService.listWorktrees(repoPath);
      if (!result.ok) throw new Error(result.error);
      return { worktrees: result.data };
    },

    setActiveWorktreePath: ({ repoId, worktreePath }) => {
      const result = repoService.setActiveWorktreePath(repoId, worktreePath);
      if (!result.ok) throw new Error(result.error);
    },

    showInFolder: ({ repoId }) => {
      const result = repoService.getPath(repoId);
      if (!result.ok) throw new Error(result.error);
      shell.showItemInFolder(result.data);
    },

    openEditor: async ({ repoId }) => {
      const result = await repoService.openInEditor(repoId);
      if (!result.ok) throw new Error(result.error);
    },
  };
}

export function registerRepoHandlers(getMainWindow: () => BrowserWindow | null, repoService: RepoService): void {
  // `repoEndpoints`' own `params` only checks path-carrying fields are
  // absolute (shared/renderer-safe); these six endpoints layer
  // `RepoSchemas`' directory-existence refine on top, same as pre-migration.
  const validationOverrides: Partial<Record<RepoEndpointName, { safeParse: (input: unknown) => z.ZodSafeParseResult<unknown> }>> = {
    add: RepoSchemas.add,
    getBranch: RepoSchemas.getBranch,
    getBranches: RepoSchemas.getBranches,
    watch: RepoSchemas.watch,
    unwatch: RepoSchemas.unwatch,
    listDirectories: RepoSchemas.listDirectories,
    listAllBranches: RepoSchemas.listAllBranches,
    listWorktrees: RepoSchemas.listWorktrees,
  };

  createRegistryIpcHandlers(
    repoEndpoints,
    buildRepoHandlers(getMainWindow, repoService),
    'Repository operation failed',
    validationOverrides
  );
}
