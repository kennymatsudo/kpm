import { ipcMain } from 'electron';
import { WorktreeSchemas } from '../validation';
import type { createWorktreeService } from '../../services/repo/WorktreeService';
import { unwrapOrThrow } from '../../services/result';

type WorktreeService = ReturnType<typeof createWorktreeService>;

export function registerWorktreeHandlers(worktreeService: WorktreeService): void {
    const { projectId } = WorktreeSchemas.getByProject.parse(params);
    return worktreeService.getByProject(projectId);
  });

    const { planItemId } = WorktreeSchemas.getByPlanItem.parse(params);
    return worktreeService.getByPlanItem(planItemId);
  });

    const { worktreeId } = WorktreeSchemas.openEditor.parse(params);
  });

    const { worktreeId } = WorktreeSchemas.getStatus.parse(params);
    return unwrapOrThrow(await worktreeService.getStatus(worktreeId));
  });

    const { worktreeId, force } = WorktreeSchemas.delete.parse(params);
    return toIpcResponse(await worktreeService.deleteWorktree(worktreeId, force));
  });

    const { worktreeId } = WorktreeSchemas.push.parse(params);
    return toIpcResponse(await worktreeService.pushBranch(worktreeId));
  });

    const { worktreeId } = WorktreeSchemas.destroy.parse(params);
    return toIpcResponse(await worktreeService.destroyWorktree(worktreeId));
  });
}
