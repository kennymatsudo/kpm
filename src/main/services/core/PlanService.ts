import type { PlanItemUpdates } from '../../../shared/types';
import type { IPlanItemRepository } from '../../db/interfaces';
import type { QueueTrackerUpdateIfNeeded } from '../../db/domain';
import { failure, success, type ServiceResult } from '../result';

export interface PlanServiceDeps {
  planItems: IPlanItemRepository;
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
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type PlanService = ReturnType<typeof createPlanService>;
