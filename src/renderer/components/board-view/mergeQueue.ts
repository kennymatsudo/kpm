import type { DevSessionWithPlanItem } from '../../../shared/types';

export function isMergeQueueSession(session: DevSessionWithPlanItem): boolean {
  return Boolean(
    session.pr_url
      && session.pr_state !== 'MERGED'
      && !session.pr_is_draft
      && session.plan_item?.status_category !== 'done'
  );
}
