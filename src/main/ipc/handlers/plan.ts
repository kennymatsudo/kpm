import { planEndpoints, type PlanEndpointName } from '../../../shared/ipc/planEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { PlanService } from '../../services/core/PlanService';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import { createRegistryIpcHandlers } from '../validation/utils';

type PlanHandler<K extends PlanEndpointName> = (
  params: EndpointPayload<(typeof planEndpoints)[K]>
) => unknown;

/**
 * One handler per `planEndpoints` entry. A registry entry without a matching
 * key here is a compile error, not a runtime "no handler" failure.
 */
type PlanHandlers = { [K in PlanEndpointName]: PlanHandler<K> };

function buildPlanHandlers(
  planService: PlanService,
  planItems: IPlanItemRepository,
  planRelations: IPlanRelationRepository,
): PlanHandlers {
  return {
    listItems: ({ projectId }) => ({ items: planItems.getByProject(projectId) }),

    executeActions: ({ projectId, actions }) => ({ result: planService.executeActions(projectId, actions) }),

    addRelation: (relation) => ({ relation: planRelations.add(relation) }),

    removeRelation: ({ relationId }) => {
      planRelations.remove(relationId);
    },

    getRelations: ({ projectId }) => ({ relations: planRelations.getByProject(projectId) }),

    updatePosition: ({ itemId, x, y }) => {
      if (!planItems.get(itemId)) {
        throw new Error(`Item not found: ${itemId}`);
      }
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
      if (!planItems.get(itemId)) {
        throw new Error(`Item not found: ${itemId}`);
      }
      planItems.delete(itemId);
    },

    deleteItemWithDescendants: ({ itemId }) => {
      if (!planItems.get(itemId)) {
        throw new Error(`Item not found: ${itemId}`);
      }
      planItems.deleteWithDescendants(itemId);
    },

    getChildCount: ({ itemId }) => {
      if (!planItems.get(itemId)) {
        throw new Error(`Item not found: ${itemId}`);
      }
      return { count: planItems.getChildCount(itemId) };
    },
  };
}

export function registerPlanHandlers(
  planService: PlanService,
  planItems: IPlanItemRepository,
  planRelations: IPlanRelationRepository,
): void {
  const handlers = buildPlanHandlers(planService, planItems, planRelations);
  createRegistryIpcHandlers(planEndpoints, handlers, 'Plan operation failed');
}
