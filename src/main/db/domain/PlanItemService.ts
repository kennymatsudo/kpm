import { isSubtaskIssueType, type StatusCategory } from '../../../shared/types';

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
}


/**
 * Keeps export queuing logic in one place for both IPC and batch actions.
 *
 * @param item - The plan item being updated
 * @param updates - The field updates being applied
 * @param queuedBy - Source of the update ('user' or 'claude')
 */
export function queueTrackerUpdateIfNeeded(
  updates: ExportableUpdates,
  queuedBy: QueueSource,
): void {
  const hasExportableChange =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.status_category !== undefined;

      deps.syncQueue.add({
        kpm_project_id: item.project_id,
        plan_item_id: item.id,
        queued_by: queuedBy,
        target_issue_type_id: null,
        target_issue_type_name: null,
        target_parent_key: null,
      });
    }
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
