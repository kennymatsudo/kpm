import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';
import type { RepoService } from '../../services/repo/RepoService';
import { RepoSchemas, createIpcHandler, createSimpleIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';
import { toIpcResponseAsync } from '../response';

export function registerRepoHandlers(
  getMainWindow: () => BrowserWindow | null,
  repoService: RepoService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.repo.add,
    createIpcHandler(
      RepoSchemas.add,
      ({ projectId, path: repoPath }) => {
        const result = repoService.add(projectId, repoPath);
        if (!result.ok) throw new Error(result.error);
        return { repo: result.data };
      },
      'Failed to add repository',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.remove,
    createIpcHandler(
      RepoSchemas.remove,
      ({ repoId }) => {
        const result = repoService.remove(repoId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to remove repository',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.list,
    createIpcHandler(
      RepoSchemas.list,
      ({ projectId }) => {
        const result = repoService.list(projectId);
        if (!result.ok) throw new Error(result.error);
        return { repos: result.data };
      },
      'Failed to list repositories',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.selectDialog,
    createSimpleIpcHandler(async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { paths: [] };
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections'],
        title: 'Select Repositories',
      });
      return { paths: result.canceled ? [] : result.filePaths };
    }, 'Failed to select repositories'),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.getBranch,
    createIpcHandler(
      RepoSchemas.getBranch,
      ({ path: repoPath }) => {
        const result = repoService.getBranch(repoPath);
        if (!result.ok) throw new Error(result.error);
        return { branch: result.data };
      },
      'Failed to get repository branch',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.getBranches,
    createIpcHandler(
      RepoSchemas.getBranches,
      async ({ paths }) => {
        const result = await repoService.getBranchesAsync(paths);
        if (!result.ok) throw new Error(result.error);
        return { branches: result.data };
      },
      'Failed to get repository branches',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.watch,
    createIpcHandler(
      RepoSchemas.watch,
      ({ repoId, path: repoPath }) => {
        const result = repoService.watch(repoId, repoPath);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to watch repository',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.unwatch,
    createIpcHandler(
      RepoSchemas.unwatch,
      ({ path: repoPath }) => {
        const result = repoService.unwatch(repoPath);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to unwatch repository',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.updateEnvironmentMode,
    createIpcHandler(
      RepoSchemas.updateEnvironmentMode,
      ({ repoId, mode }) => {
        const result = repoService.updateEnvironmentMode(repoId, mode);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to update repository environment mode',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.listDirectories,
    createIpcHandler(
      RepoSchemas.listDirectories,
      ({ repoPath, prefix, depth }) => {
        const result = repoService.listDirectories(repoPath, prefix, depth);
        if (!result.ok) throw new Error(result.error);
        return { directories: result.data };
      },
      'Failed to list repository directories',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.listAllBranches,
    createIpcHandler(
      RepoSchemas.listAllBranches,
      async ({ repoPath }) => {
        const result = await repoService.listAllBranches(repoPath);
        if (!result.ok) throw new Error(result.error);
        return { branches: result.data };
      },
      'Failed to list local branches',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.listWorktrees,
    createIpcHandler(
      RepoSchemas.listWorktrees,
      async ({ repoPath }) => {
        const result = await repoService.listWorktrees(repoPath);
        if (!result.ok) throw new Error(result.error);
        return { worktrees: result.data };
      },
      'Failed to list worktrees',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.setActiveWorktreePath,
    createIpcHandler(
      RepoSchemas.setActiveWorktreePath,
      ({ repoId, worktreePath }) => {
        const result = repoService.setActiveWorktreePath(repoId, worktreePath);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to set active worktree path',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.repo.showInFolder,
    createIpcHandler(
      RepoSchemas.showInFolder,
      ({ repoId }) => {
        const result = repoService.getPath(repoId);
        if (!result.ok) throw new Error(result.error);
        shell.showItemInFolder(result.data);
      },
      'Failed to show repository in folder',
    ),
  );

  ipcMain.handle(IPC_CHANNELS.repo.openEditor, async (_event, params: unknown) => {
    const { repoId } = RepoSchemas.openEditor.parse(params);
    return toIpcResponseAsync(repoService.openInEditor(repoId));
  });
}
