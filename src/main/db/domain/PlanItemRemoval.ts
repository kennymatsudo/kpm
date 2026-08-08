import type { Database } from 'better-sqlite3';
import type { PlanItem } from '../../../shared/types';
import type { IPlanItemRepository } from '../interfaces';
import { queueTrackerDeletionIfNeeded, type OutboundChangePolicyDeps } from './OutboundChangePolicy';

const SAVEPOINT = 'remove_plan_item';

export interface RemovePlanItemDeps {
  database: Pick<Database, 'exec'>;
  planItems: Pick<IPlanItemRepository, 'get' | 'getDescendantIds' | 'getMany' | 'delete' | 'deleteWithDescendants'>;
  outboundChanges: OutboundChangePolicyDeps['outboundChanges'];
}

export interface RemovePlanItemOptions {
  queuedBy: 'user' | 'claude';
  /** false orphans descendants (`delete`); true removes the whole subtree (`deleteWithDescendants`). */
  cascade: boolean;
}

export type RemovePlanItemResult =
  | { status: 'not_found' }
  | { status: 'removed'; removedIds: string[] };

/**
 * Single owner of "remove a plan item": stages a tracker deletion for every
 * item about to disappear, then deletes, as one unit. Uses a raw SAVEPOINT
 * rather than `database.transaction()` because the latter must nest when
 * called from inside `PlanActionService`'s own transaction (the PlanAction
 * path) while also working standalone (the IPC path) — SAVEPOINT does both,
 * and unlike `database.transaction()` doesn't depend on the driver tracking
 * transaction depth (this repo's test double for better-sqlite3 does not).
 */
export function removePlanItem(
  itemId: string,
  options: RemovePlanItemOptions,
  deps: RemovePlanItemDeps
): RemovePlanItemResult {
  const item = deps.planItems.get(itemId);
  if (!item) return { status: 'not_found' };

  const itemsToStage: PlanItem[] = options.cascade
    ? [item, ...deps.planItems.getMany(deps.planItems.getDescendantIds(itemId))]
    : [item];

  deps.database.exec(`SAVEPOINT ${SAVEPOINT}`);
  try {
    for (const candidate of itemsToStage) {
      queueTrackerDeletionIfNeeded(candidate, options.queuedBy, { outboundChanges: deps.outboundChanges });
    }
    if (options.cascade) {
      deps.planItems.deleteWithDescendants(itemId);
    } else {
      deps.planItems.delete(itemId);
    }
    deps.database.exec(`RELEASE SAVEPOINT ${SAVEPOINT}`);
  } catch (error) {
    deps.database.exec(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    deps.database.exec(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    throw error;
  }

  return { status: 'removed', removedIds: itemsToStage.map((candidate) => candidate.id) };
}
