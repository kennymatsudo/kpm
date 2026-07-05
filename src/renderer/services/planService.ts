import type { PlanItem } from '../../shared/types';

export function subscribeToRefreshRequested(
  callback: (event: { projectId: string }) => void
): () => void {
  return window.api.plan.onRefreshRequested(callback);
}

export function listProjectPlanItems(projectId: string): Promise<PlanItem[]> {
  return window.api.plan.listItems({ projectId });
}
