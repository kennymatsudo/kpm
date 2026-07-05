import { worktreeEndpoints, type WorktreeEndpointName } from '../../../shared/ipc/worktreeEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { createWorktreeService } from '../../services/repo/WorktreeService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse, toIpcResponseAsync } from '../response';
import { bindRegistryHandlers } from '../validation/utils';

type WorktreeService = ReturnType<typeof createWorktreeService>;

/**
 * One handler per `worktreeEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 * Response shapes vary per endpoint (raw value, unwrapOrThrow, toIpcResponse)
 * so this binds directly to `ipcMain.handle` rather than going through
 * `createRegistryIpcHandlers`, which would force a uniform `{success, ...}`
 * envelope onto every entry.
 */
type WorktreeHandlers = { [K in WorktreeEndpointName]: HandlerFor<typeof worktreeEndpoints, K> };

function buildWorktreeHandlers(worktreeService: WorktreeService): WorktreeHandlers {
  return {
    getByProject: ({ projectId }) => worktreeService.getByProject(projectId),

    getByPlanItem: ({ planItemId }) => worktreeService.getByPlanItem(planItemId),

    openEditor: ({ worktreeId }) => toIpcResponseAsync(worktreeService.openInEditor(worktreeId)),

    getStatus: async ({ worktreeId }) => unwrapOrThrow(await worktreeService.getStatus(worktreeId)),

    delete: async ({ worktreeId, force }) => toIpcResponse(await worktreeService.deleteWorktree(worktreeId, force)),

    push: async ({ worktreeId }) => toIpcResponse(await worktreeService.pushBranch(worktreeId)),

    destroy: async ({ worktreeId }) => toIpcResponse(await worktreeService.destroyWorktree(worktreeId)),
  };
}

export function registerWorktreeHandlers(worktreeService: WorktreeService): void {
  const handlers = buildWorktreeHandlers(worktreeService);
  bindRegistryHandlers(worktreeEndpoints, handlers);
}
