import { isSubtaskIssueType, type StatusCategory } from '../../../shared/types';
import type { IPlanItemRepository, ISyncQueueRepository, ITrackerRepository } from '../interfaces';

type QueueSource = 'user' | 'claude';

interface ExportableUpdates {
  title?: string;
  description?: string | null;
  status_category?: StatusCategory | null;
}

/**
 * Dependencies for PlanItemService functions.
 */
export interface PlanItemServiceDeps {
  planItems: IPlanItemRepository;
  syncQueue: ISyncQueueRepository;
  tracker: ITrackerRepository;
}


/**
 * Queue a tracker export when user-facing fields change on a tracker-linked item,
 * OR when a new item (no external_key) gets a valid status assigned.
 * Keeps export queuing logic in one place for both IPC and batch actions.
 *
 * For linked items (has external_key): queues 'update' operation
 * For new items (no external_key): queues 'create' operation when status_category
 * is set to something other than 'none' (container items cannot be synced)
 *
 * @param item - The plan item being updated
 * @param updates - The field updates being applied
 * @param queuedBy - Source of the update ('user' or 'claude')
 */
export function queueTrackerUpdateIfNeeded(
  item: { id: string; project_id?: string | null; external_key: string | null; association_id: string | null; status_category?: string | null },
  updates: ExportableUpdates,
  queuedBy: QueueSource,
): void {
  if (!item.project_id) return;

  const hasExportableChange =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.status_category !== undefined;

  const existing = deps.syncQueue.getByItemId(item.id);

  // Case 1: Linked item (has external_key) - queue for update
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
    console.log(`[PlanItemService] Auto-queued ${item.external_key} for update (changed: ${changedFields.join(', ')})`);
    return;
  }

  // Case 2: New item (no external_key) getting a valid status - queue for create
  // Note: 'none' status is handled above (early return), so any status here is valid
  if (!item.external_key && updates.status_category) {
    // Check if project has exactly one tracker association (auto-select)
    // If multiple associations exist, user must manually select via right-click
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
      console.log(`[PlanItemService] Auto-queued new item for create to Jira (status: ${updates.status_category})`);
    }
    // If no associations or multiple, don't auto-queue - user must use right-click menu
  }
}

/**
 * Ensure all subtasks remain in the planned status when their parent is planned.
 * Jira/Linear subtasks cannot be un-nested or left in backlog.
 *
 * @param projectId - The project containing the items
 * @param parentItemId - The parent item whose children to check
 */
export function moveSubtasksToPlan(
  projectId: string | null | undefined,
  parentItemId: string,
): void {
  if (!projectId) return;

  const children = deps.planItems.getChildrenByParent(projectId, parentItemId);
}
