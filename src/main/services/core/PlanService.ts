import type { Database } from 'better-sqlite3';
import type { PlanItemUpdates } from '../../../shared/types';
import type { IOutboundChangeRepository, IPlanItemRepository } from '../../db/interfaces';
import { removePlanItem, type QueueTrackerUpdateIfNeeded } from '../../db/domain';
import { failure, success, type ServiceResult } from '../result';

export interface PlanServiceDeps {
  planItems: IPlanItemRepository;
  outboundChanges: IOutboundChangeRepository;
  database: Database;
  queueTrackerUpdateIfNeeded: QueueTrackerUpdateIfNeeded;
}

export function createPlanService(deps: PlanServiceDeps) {
  return {
    updateItem(itemId: string, updates: PlanItemUpdates): ServiceResult<void> {
      const item = deps.planItems.get(itemId);
      if (!item) {
        return failure(`Item not found: ${itemId}`);
      }

      try {
        deps.planItems.update(itemId, updates);
        deps.queueTrackerUpdateIfNeeded(item, updates, 'user');
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    deleteItem(itemId: string): ServiceResult<void> {
      try {
        const result = removePlanItem(itemId, { queuedBy: 'user', cascade: false }, {
          database: deps.database,
          planItems: deps.planItems,
          outboundChanges: deps.outboundChanges,
        });
        if (result.status === 'not_found') return failure(`Item not found: ${itemId}`);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    deleteItemWithDescendants(itemId: string): ServiceResult<void> {
      const item = deps.planItems.get(itemId);
      if (!item) return failure(`Item not found: ${itemId}`);
      if (!item.project_id) return failure(`Plan item has no project: ${itemId}`);

      try {
        const result = removePlanItem(itemId, { queuedBy: 'user', cascade: true }, {
          database: deps.database,
          planItems: deps.planItems,
          outboundChanges: deps.outboundChanges,
        });
        if (result.status === 'not_found') return failure(`Item not found: ${itemId}`);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type PlanService = ReturnType<typeof createPlanService>;
