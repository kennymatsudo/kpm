import type { DevSessionWithPlanItem } from '../../../shared/types';

export interface StaleWorkBriefRevision {
  executionRevision: number;
  itemRevision: number;
}

export function deriveStaleWorkBriefRevision(
  executionRevision: number | null | undefined,
  itemRevision: number | null | undefined,
): StaleWorkBriefRevision | null {
  if (executionRevision == null || itemRevision == null || executionRevision === itemRevision) {
    return null;
  }
  return { executionRevision, itemRevision };
}

/** Mirrors DevSessionService: it checks the latest item session, then reuses it only for the same repo and a startable status. */
export function findReusableBoardSession(
  sessions: readonly DevSessionWithPlanItem[],
  repoId: string,
): DevSessionWithPlanItem | null {
  const latestSession = sessions.reduce<DevSessionWithPlanItem | null>((latest, session) => {
    if (!latest || Date.parse(session.created_at) > Date.parse(latest.created_at)) return session;
    return latest;
  }, null);

  if (
    latestSession?.repo_id === repoId
    && (latestSession.status === 'inactive' || latestSession.status === 'pending')
  ) {
    return latestSession;
  }
  return null;
}
