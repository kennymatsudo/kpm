import type { StatusCategory, TrackerAssociationWithScope } from '../../../shared/types';
import type { ISyncQueueRepository, ITrackerRepository } from '../interfaces';

type SyncQueueOperation = 'create' | 'update';

type QueueSource = 'user' | 'claude';

interface ExportableUpdates {
  title?: string;
  description?: string | null;
  status_category?: StatusCategory | null;
}

interface QueuePolicyItem {
  id: string;
  project_id?: string | null;
  external_key: string | null;
  association_id: string | null;
  status_category?: string | null;
}

export interface SyncQueuePolicyDeps {
  syncQueue: ISyncQueueRepository;
  tracker: ITrackerRepository;
}

export function resolveOperation(item: { external_key: string | null }): SyncQueueOperation {
  return item.external_key ? 'update' : 'create';
}

/**
 * Auto-queue path: fires when a plan-item field changes (IPC edit, `update_item`
 * plan action, Slack triage). Linked items always queue an update. New items only
 * auto-queue for create when the project has exactly one tracker association —
 * with more than one, the user must pick via the right-click menu.
 */
export function applyAutoQueue(
  item: QueuePolicyItem,
  updates: ExportableUpdates,
  queuedBy: QueueSource,
  deps: SyncQueuePolicyDeps
): void {
  if (!item.project_id) return;

  const hasExportableChange =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.status_category !== undefined;

  const existing = deps.syncQueue.getByItemId(item.id);
  if (existing) {
    if (updates.status_category !== undefined) {
      deps.syncQueue.updateStatusCategory(existing.id, updates.status_category ?? null);
    }
    return;
  }

  if (hasExportableChange && item.external_key && item.association_id) {
    deps.syncQueue.add({
      kpm_project_id: item.project_id,
      plan_item_id: item.id,
      association_id: item.association_id,
      operation: 'update',
      queued_by: queuedBy,
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: updates.status_category ?? null,
    });
    const changedFields = Object.keys(updates).filter(k =>
      ['title', 'description', 'status_category'].includes(k)
    );
    console.log(`[SyncQueuePolicy] Auto-queued ${item.external_key} for update (changed: ${changedFields.join(', ')})`);
    return;
  }

  if (!item.external_key && updates.status_category) {
    const associations = deps.tracker.getAssociationsByProject(item.project_id);
    if (associations.length === 1) {
      const association = associations[0];
      deps.syncQueue.add({
        kpm_project_id: item.project_id,
        plan_item_id: item.id,
        association_id: association.id,
        operation: 'create',
        queued_by: queuedBy,
        target_issue_type_id: null,
        target_issue_type_name: null,
        target_parent_key: null,
        target_status_category: updates.status_category,
      });
      console.log(`[SyncQueuePolicy] Auto-queued new item for create to Jira (status: ${updates.status_category})`);
    }
  }
}

interface QueueForTrackerItem {
  id: string;
  external_key: string | null;
  status_category: string | null;
}

interface QueueForTrackerInput {
  projectId: string;
  itemIds: string[];
  queuedBy: QueueSource;
  associations: TrackerAssociationWithScope[];
  /** Preloaded item-id -> existing queue-entry-id map, to avoid an N+1 getByItemId query per item. */
  alreadyQueuedItemIds: ReadonlyMap<string, string>;
  getItem: (itemId: string) => QueueForTrackerItem | undefined;
  syncQueue: Pick<ISyncQueueRepository, 'add' | 'updateStatusCategory'>;
  onItemNotFound?: (itemId: string) => void;
}

interface QueueForTrackerResult {
  queuedCount: number;
  skippedReason?: 'no_association';
}

/**
 * Explicit-queue path: Claude's `queue_for_tracker` plan action. Unlike the
 * auto path, it always uses the project's first tracker association even
 * when more than one exists — the action already carries explicit intent to
 * queue, so there is no ambiguity to defer to the user.
 *
 * Dedup matches the auto path: an item already in the queue gets its status
 * target refreshed (rather than being skipped outright) so a repeated
 * queue_for_tracker call with a newer status is not silently dropped.
 */
export function queueForTracker(input: QueueForTrackerInput): QueueForTrackerResult {
  const { projectId, itemIds, queuedBy, associations, alreadyQueuedItemIds, getItem, syncQueue, onItemNotFound } = input;

  if (associations.length === 0) {
    return { queuedCount: 0, skippedReason: 'no_association' };
  }

  const association = associations[0];
  let queuedCount = 0;

  for (const itemId of itemIds) {
    const item = getItem(itemId);
    if (!item) {
      onItemNotFound?.(itemId);
      continue;
    }

    const existingQueueEntryId = alreadyQueuedItemIds.get(itemId);
    if (existingQueueEntryId) {
      if (item.status_category) {
        syncQueue.updateStatusCategory(existingQueueEntryId, item.status_category);
      }
      continue;
    }

    syncQueue.add({
      kpm_project_id: projectId,
      plan_item_id: itemId,
      association_id: association.id,
      operation: resolveOperation(item),
      queued_by: queuedBy,
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: (item.status_category as StatusCategory | null) ?? null,
      custom_field_overrides: null,
    });
    queuedCount++;
  }

  return { queuedCount };
}

export type QueueTrackerUpdateIfNeeded = (
  item: QueuePolicyItem,
  updates: ExportableUpdates,
  queuedBy: QueueSource
) => void;
