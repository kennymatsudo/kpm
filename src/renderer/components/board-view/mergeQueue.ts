import type { DevSessionWithPlanItem } from '../../../shared/types';

export function isMergeQueueSession(session: DevSessionWithPlanItem): boolean {
  return Boolean(
    session.pr_url
      && session.pr_state !== 'MERGED'
      && session.plan_item?.status_category !== 'done'
  );
}
