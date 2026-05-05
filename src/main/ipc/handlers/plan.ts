import { ipcMain } from 'electron';
import type { PlanAction } from '../../../shared/types';
import type { PlanService } from '../../services/core/PlanService';
import { createIpcHandler, PlanSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerPlanHandlers(planService: PlanService): void {
  ipcMain.handle(
    IPC_CHANNELS.plan.listItems,
    createIpcHandler(
      PlanSchemas.listItems,
      ({ projectId }) => ({ items: planService.listItems(projectId) }),
      'Failed to list plan items',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.executeActions,
    createIpcHandler(
      PlanSchemas.executeActions,
      ({ projectId, actions }) => ({ result: planService.executeActions(projectId, actions as PlanAction[]) }),
      'Failed to execute plan actions',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.addRelation,
    createIpcHandler(
      PlanSchemas.addRelation,
      (relation) => {
        const result = planService.addRelation(relation);
        if (!result.ok) throw new Error(result.error);
        return { relation: result.data };
      },
      'Failed to add plan relation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.removeRelation,
    createIpcHandler(
      PlanSchemas.removeRelation,
      ({ relationId }) => {
        const result = planService.removeRelation(relationId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to remove plan relation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.getRelations,
    createIpcHandler(
      PlanSchemas.getRelations,
      ({ projectId }) => ({ relations: planService.getRelations(projectId) }),
      'Failed to get plan relations',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.updatePosition,
    createIpcHandler(
      PlanSchemas.updatePosition,
      ({ itemId, x, y }) => {
        const result = planService.updatePosition(itemId, x, y);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to update plan position',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.updatePositions,
    createIpcHandler(
      PlanSchemas.updatePositions,
      ({ updates }) => {
        const result = planService.updatePositions(updates);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to update plan positions',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.updateItem,
    createIpcHandler(
      PlanSchemas.updateItem,
      ({ itemId, updates }) => {
        const result = planService.updateItem(itemId, updates);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to update plan item',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.deleteItem,
    createIpcHandler(
      PlanSchemas.deleteItem,
      ({ itemId }) => {
        const result = planService.deleteItem(itemId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to delete plan item',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.deleteItemWithDescendants,
    createIpcHandler(
      PlanSchemas.deleteItemWithDescendants,
      ({ itemId }) => {
        const result = planService.deleteItemWithDescendants(itemId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to delete plan item with descendants',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.getChildCount,
    createIpcHandler(
      PlanSchemas.getChildCount,
      ({ itemId }) => {
        const result = planService.getChildCount(itemId);
        if (!result.ok) throw new Error(result.error);
        return { count: result.data };
      },
      'Failed to get plan child count',
    ),
  );
}
