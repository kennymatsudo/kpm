import { ipcMain } from 'electron';
import { WorktreeSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import type { createWorktreeService } from '../../services/repo/WorktreeService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse, toIpcResponseAsync } from '../response';

type WorktreeService = ReturnType<typeof createWorktreeService>;

export function registerWorktreeHandlers(worktreeService: WorktreeService): void {
  ipcMain.handle(IPC_CHANNELS.worktree.getByProject, (_event, params: unknown) => {
    const { projectId } = WorktreeSchemas.getByProject.parse(params);
    return worktreeService.getByProject(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.worktree.getByPlanItem, (_event, params: unknown) => {
    const { planItemId } = WorktreeSchemas.getByPlanItem.parse(params);
    return worktreeService.getByPlanItem(planItemId);
  });

  ipcMain.handle(IPC_CHANNELS.worktree.openEditor, async (_event, params: unknown) => {
    const { worktreeId } = WorktreeSchemas.openEditor.parse(params);
    return toIpcResponseAsync(worktreeService.openInEditor(worktreeId));
  });

  ipcMain.handle(IPC_CHANNELS.worktree.getStatus, async (_event, params: unknown) => {
    const { worktreeId } = WorktreeSchemas.getStatus.parse(params);
    return unwrapOrThrow(await worktreeService.getStatus(worktreeId));
  });

  ipcMain.handle(IPC_CHANNELS.worktree.delete, async (_event, params: unknown) => {
    const { worktreeId, force } = WorktreeSchemas.delete.parse(params);
    return toIpcResponse(await worktreeService.deleteWorktree(worktreeId, force));
  });

  ipcMain.handle(IPC_CHANNELS.worktree.push, async (_event, params: unknown) => {
    const { worktreeId } = WorktreeSchemas.push.parse(params);
    return toIpcResponse(await worktreeService.pushBranch(worktreeId));
  });

  ipcMain.handle(IPC_CHANNELS.worktree.destroy, async (_event, params: unknown) => {
    const { worktreeId } = WorktreeSchemas.destroy.parse(params);
    return toIpcResponse(await worktreeService.destroyWorktree(worktreeId));
  });
}
