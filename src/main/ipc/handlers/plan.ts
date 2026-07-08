import { planEndpoints, type PlanEndpointName } from '../../../shared/ipc/planEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { PlanService } from '../../services/core/PlanService';
import type { PlanActionExecutor } from '../../db/domain/PlanActionService';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import { createRegistryIpcHandlers } from '../validation/utils';

/** Throws the standard `Item not found` error when `itemId` doesn't resolve. */
function requirePlanItem(planItems: IPlanItemRepository, itemId: string): void {
  if (!planItems.get(itemId)) {
    throw new Error(`Item not found: ${itemId}`);
  }
}

/**
 * One handler per `planEndpoints` entry. A registry entry without a matching
 * key here is a compile error, not a runtime "no handler" failure.
 */
type PlanHandlers = { [K in PlanEndpointName]: UnwrappedHandlerFor<typeof planEndpoints, K> };

function buildPlanHandlers(
  planService: PlanService,
  planActionExecutor: PlanActionExecutor,
  planItems: IPlanItemRepository,
  planRelations: IPlanRelationRepository,
): PlanHandlers {
  return {
    listItems: ({ projectId }) => ({ items: planItems.getByProject(projectId) }),

    executeActions: ({ projectId, actions }) => ({ result: planActionExecutor.execute(projectId, actions) }),

    addRelation: (relation) => ({ relation: planRelations.add(relation) }),

    removeRelation: ({ relationId }) => {
      planRelations.remove(relationId);
    },

    getRelations: ({ projectId }) => ({ relations: planRelations.getByProject(projectId) }),

    updatePosition: ({ itemId, x, y }) => {
      requirePlanItem(planItems, itemId);
      planItems.updatePosition(itemId, x, y);
    },

    updatePositions: ({ updates }) => {
      const result = planService.updatePositions(updates);
      if (!result.ok) throw new Error(result.error);
    },

    updateItem: ({ itemId, updates }) => {
      const result = planService.updateItem(itemId, updates);
      if (!result.ok) throw new Error(result.error);
    },

    deleteItem: ({ itemId }) => {
      requirePlanItem(planItems, itemId);
      planItems.delete(itemId);
    },

    deleteItemWithDescendants: ({ itemId }) => {
      requirePlanItem(planItems, itemId);
      planItems.deleteWithDescendants(itemId);
    },

    getChildCount: ({ itemId }) => {
      requirePlanItem(planItems, itemId);
      return { count: planItems.getChildCount(itemId) };
    },
  };
}

export function registerPlanHandlers(
  planService: PlanService,
  planActionExecutor: PlanActionExecutor,
  planItems: IPlanItemRepository,
  planRelations: IPlanRelationRepository,
): void {
  const handlers = buildPlanHandlers(planService, planActionExecutor, planItems, planRelations);
  createRegistryIpcHandlers(planEndpoints, handlers, 'Plan operation failed');
}
