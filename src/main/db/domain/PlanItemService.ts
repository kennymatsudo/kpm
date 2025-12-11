import { isSubtaskIssueType, type StatusCategory } from '../../../shared/types';

type QueueSource = 'user' | 'claude';

interface ExportableUpdates {
  title?: string;
  description?: string | null;
  status_category?: StatusCategory | null;
}

/**
 * Keeps export queuing logic in one place for both IPC and batch actions.
 */
export function queueTrackerUpdateIfNeeded(
  updates: ExportableUpdates,
): void {
  const hasExportableChange =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.status_category !== undefined;

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
 */
  if (!projectId) return;

}
