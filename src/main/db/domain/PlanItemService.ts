import { isSubtaskIssueType } from '../../../shared/types';
import type { IPlanItemRepository } from '../interfaces';
import { applyAutoQueue, type QueueTrackerUpdateIfNeeded, type OutboundChangePolicyDeps } from './OutboundChangePolicy';

/**
 * Dependencies for PlanItemService functions.
 */
export interface PlanItemServiceDeps extends OutboundChangePolicyDeps {
  planItems: IPlanItemRepository;
}

export type { QueueTrackerUpdateIfNeeded };

export type MoveSubtasksToPlan = (
  projectId: string | null | undefined,
  parentItemId: string
) => void;

export const queueTrackerUpdateIfNeeded: (
  ...args: [...Parameters<QueueTrackerUpdateIfNeeded>, PlanItemServiceDeps]
) => void = (item, updates, queuedBy, deps) => applyAutoQueue(item, updates, queuedBy, deps);

/**
 * Ensure all subtasks remain in the planned status when their parent is planned.
 * Jira/Linear subtasks cannot be un-nested or left in backlog.
 *
 * @param projectId - The project containing the items
 * @param parentItemId - The parent item whose children to check
 * @param deps - Repository dependencies
 */
export function moveSubtasksToPlan(
  projectId: string | null | undefined,
  parentItemId: string,
  deps: PlanItemServiceDeps
): void {
  if (!projectId) return;

  const children = deps.planItems.getChildrenByParent(projectId, parentItemId);
  const subtaskIds = children
    .filter(i => isSubtaskIssueType(i.external_issue_type))
    .map(i => i.id);
  deps.planItems.batchUpdateStatus(subtaskIds, 'planned');
}
