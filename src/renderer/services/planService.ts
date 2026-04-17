import type { PlanItem } from '../../shared/types';

export function subscribeToRefreshRequested(
  callback: (event: { projectId: string }) => void
): () => void {
  return window.api.plan.onRefreshRequested(callback);
}

export function listProjectPlanItems(projectId: string): Promise<PlanItem[]> {
  return window.api.plan.listItems(projectId);
}

export async function createInlinePlanItem(
  projectId: string,
  title: string,
  description?: string
): Promise<{ success: boolean; createdId?: string; error?: string }> {
  const result = await window.api.plan.executeActions(projectId, [{
    type: 'create_item',
    title,
    description,
    parent_id: null,
  }]);

  return {
    success: result.success && Boolean(result.createdIds?.$1),
    createdId: result.createdIds?.$1,
    error: result.error,
  };
}
