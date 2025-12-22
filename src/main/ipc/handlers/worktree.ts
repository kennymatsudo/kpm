import { ipcMain } from 'electron';

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
  });

    const { worktreeId } = WorktreeSchemas.push.parse(params);
  });
}
