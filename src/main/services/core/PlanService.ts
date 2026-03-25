import type { PlanAction, PlanActionResult, PlanItem, PlanItemUpdates, PlanRelation } from '../../../shared/types';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import { failure, success, type ServiceResult } from '../result';

export interface PlanServiceDeps {
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  executePlanActions: (projectId: string, actions: PlanAction[]) => PlanActionResult;
}

function withItem<T>(deps: PlanServiceDeps, itemId: string, fn: (item: PlanItem) => T): ServiceResult<T> {
  const item = deps.planItems.get(itemId);
  if (!item) {
    return failure(`Item not found: ${itemId}`);
  }

  try {
    return success(fn(item));
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

function wrap<T>(fn: () => T): ServiceResult<T> {
  try {
    return success(fn());
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export function createPlanService(deps: PlanServiceDeps) {
  return {
    listItems(projectId: string): PlanItem[] {
      return deps.planItems.getByProject(projectId);
    },

    executeActions(projectId: string, actions: PlanAction[]): PlanActionResult {
      return deps.executePlanActions(projectId, actions);
    },

    getRelations(projectId: string): PlanRelation[] {
      return deps.planRelations.getByProject(projectId);
    },

    addRelation(relation: Omit<PlanRelation, 'id'>): ServiceResult<PlanRelation> {
      return wrap(() => deps.planRelations.add(relation));
    },

    removeRelation(relationId: string): ServiceResult<void> {
      return wrap(() => deps.planRelations.remove(relationId));
    },

    updatePosition(itemId: string, x: number, y: number): ServiceResult<void> {
      return withItem(deps, itemId, () => deps.planItems.updatePosition(itemId, x, y));
    },

    updateItem(itemId: string, updates: PlanItemUpdates): ServiceResult<void> {
      return withItem(deps, itemId, (item) => {
        deps.planItems.update(itemId, updates);
        deps.queueTrackerUpdateIfNeeded(item, updates, 'user');
      });
    },

    deleteItem(itemId: string): ServiceResult<void> {
      return withItem(deps, itemId, () => deps.planItems.delete(itemId));
    },

    deleteItemWithDescendants(itemId: string): ServiceResult<void> {
      return withItem(deps, itemId, () => deps.planItems.deleteWithDescendants(itemId));
    },

    getChildCount(itemId: string): ServiceResult<number> {
      return withItem(deps, itemId, () => deps.planItems.getChildCount(itemId));
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type PlanService = ReturnType<typeof createPlanService>;
