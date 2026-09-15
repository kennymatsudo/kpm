import type { IPlanItemRepository, ISyncRepository } from '../interfaces';
import type { PlanItemSyncUpdates, TrackerAgreementState } from '../../../shared/types';

export interface RecordTrackerAgreementDeps {
  planItems: Pick<IPlanItemRepository, 'update'>;
  sync: Pick<ISyncRepository, 'upsertSnapshot'>;
}

export interface TrackerAgreementOptions {
  /** Other sync fields the caller learned from the same round trip: external identity, status, people. */
  extra?: PlanItemSyncUpdates;
}

/**
 * Record that KPM and the tracker now hold the same thing for a plan item:
 * snapshot what the tracker returned and stamp the item as synced. This is the
 * only place either happens, in both directions.
 *
 * The snapshot exists to tell a later external edit apart from the tracker
 * re-rendering its own markdown, so every value in it comes from the remote
 * issue. A local value recorded here would read as tracker drift on the next
 * pass and pull the user's own edit back out.
 */
export function recordTrackerAgreement(
  planItemId: string,
  remote: TrackerAgreementState,
  options: TrackerAgreementOptions,
  deps: RecordTrackerAgreementDeps
): void {
  deps.sync.upsertSnapshot({
    plan_item_id: planItemId,
    snapshot_title: remote.title,
    snapshot_description: remote.description,
    external_updated_at: remote.updatedAt,
  });
  deps.planItems.update(planItemId, {
    ...options.extra,
    last_synced_at: new Date().toISOString(),
  });
}
