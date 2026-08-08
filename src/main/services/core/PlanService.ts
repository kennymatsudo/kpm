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
    updatePositions(updates: { id: string; x: number; y: number }[]): ServiceResult<void> {
      if (updates.length === 0) {
        return success(undefined);
      }

      try {
        const ids = updates.map((update) => update.id);
        const existingIds = deps.planItems.getExistingIds(ids);
        const missingId = ids.find((id) => !existingIds.has(id));
        if (missingId) {
          return failure(`Item not found: ${missingId}`);
        }
        deps.planItems.batchUpdatePositions(updates);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

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
