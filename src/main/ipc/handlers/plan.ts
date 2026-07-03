import { ipcMain } from 'electron';
import type { PlanService } from '../../services/core/PlanService';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import { createIpcHandler, PlanSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerPlanHandlers(
  planService: PlanService,
  planItems: IPlanItemRepository,
  planRelations: IPlanRelationRepository,
): void {
  ipcMain.handle(
    IPC_CHANNELS.plan.listItems,
    createIpcHandler(
      PlanSchemas.listItems,
      ({ projectId }) => ({ items: planItems.getByProject(projectId) }),
      'Failed to list plan items',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.executeActions,
    createIpcHandler(
      PlanSchemas.executeActions,
      ({ projectId, actions }) => ({ result: planService.executeActions(projectId, actions) }),
      'Failed to execute plan actions',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.addRelation,
    createIpcHandler(
      PlanSchemas.addRelation,
      (relation) => ({ relation: planRelations.add(relation) }),
      'Failed to add plan relation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.removeRelation,
    createIpcHandler(
      PlanSchemas.removeRelation,
      ({ relationId }) => {
        planRelations.remove(relationId);
      },
      'Failed to remove plan relation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.getRelations,
    createIpcHandler(
      PlanSchemas.getRelations,
      ({ projectId }) => ({ relations: planRelations.getByProject(projectId) }),
      'Failed to get plan relations',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.updatePosition,
    createIpcHandler(
      PlanSchemas.updatePosition,
      ({ itemId, x, y }) => {
        if (!planItems.get(itemId)) {
          throw new Error(`Item not found: ${itemId}`);
        }
        planItems.updatePosition(itemId, x, y);
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
        if (!planItems.get(itemId)) {
          throw new Error(`Item not found: ${itemId}`);
        }
        planItems.delete(itemId);
      },
      'Failed to delete plan item',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.deleteItemWithDescendants,
    createIpcHandler(
      PlanSchemas.deleteItemWithDescendants,
      ({ itemId }) => {
        if (!planItems.get(itemId)) {
          throw new Error(`Item not found: ${itemId}`);
        }
        planItems.deleteWithDescendants(itemId);
      },
      'Failed to delete plan item with descendants',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.plan.getChildCount,
    createIpcHandler(
      PlanSchemas.getChildCount,
      ({ itemId }) => {
        if (!planItems.get(itemId)) {
          throw new Error(`Item not found: ${itemId}`);
        }
        return { count: planItems.getChildCount(itemId) };
      },
      'Failed to get plan child count',
    ),
  );
}
