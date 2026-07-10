/**
 * usePanelStatus - Thin store-gathering wrapper around `derivePanelStatus`.
 *
 * Reads the four backing sources (impl + review agent state, automation phase,
 * the review inbox, plan item status) from the stores and folds them into one
 * canonical `PanelStatus`. All the logic lives in the pure `derivePanelStatus`;
 * this hook only collects inputs.
 *
 * The `ReviewStats -> ReviewPhaseStats` mapper lives here (board-view) rather
 * than in `development/reviewStats` so the dependency direction stays
 * board -> development.
 */

import { useMemo } from 'react';
import { useAgentSession } from '../../hooks/useAgentSession';
import { useDevSessionsStore } from '../../stores/devSessions';
import { usePlanDomainStore } from '../../stores';
import { getStatusCategory } from '../../constants/statusConfig';
import { getStats, type ReviewStats } from '../development/reviewStats';
import { toReviewSessionId } from '../../../shared/agent-types';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import {
  derivePanelStatus,
  type PanelStatus,
  type ReviewPhaseStats,
} from './panelStatus';

export function toReviewPhaseStats(stats: ReviewStats, assessmentRunning: boolean): ReviewPhaseStats {
  return {
    queueCount: stats.queueCount,
    needsReviewCount: stats.needsReviewCount,
    implementCount: stats.implementCount,
    inProgressImplCount: stats.inProgressImplCount,
    readyToPostCount: stats.readyToPostTasks.length,
    needsInputCount: stats.needsInputCount,
    failedCount: stats.failedCount,
    staleCount: stats.staleCount,
    queuedCodeCount: stats.queuedCodeCount,
    updatingCodeCount: stats.updatingCodeCount,
    assessmentRunning,
  };
}

export function usePanelStatus(session: DevSessionWithPlanItem): PanelStatus {
  const impl = useAgentSession(session.id);
  const review = useAgentSession(toReviewSessionId(session.id));

  const commitStatus = useDevSessionsStore(
    (s) => s.commitStateBySessionId.get(session.id)?.status ?? null,
  );
  const inbox = useDevSessionsStore((s) => s.reviewInboxBySessionId.get(session.id) ?? null);
  const assessmentRunning = useDevSessionsStore(
    (s) => s.reviewAssessmentPendingBySessionId.get(session.id) != null,
  );
  const mergeEntry = useDevSessionsStore((s) => s.mergeOrderBySessionId.get(session.id) ?? null);
  const allSessions = useDevSessionsStore((s) => s.sessions);

  const planItem = usePlanDomainStore((s) =>
    session.plan_item_id ? s.planItems.find((p) => p.id === session.plan_item_id) : undefined,
  );
  const itemStatus = planItem
    ? planItem.status_category
      ?? getStatusCategory(planItem.external_status, planItem.external_type)
      ?? 'not_started'
    : null;

  const reviewStats = useMemo(
    () => (inbox ? toReviewPhaseStats(getStats(inbox, session.id), assessmentRunning) : null),
    [inbox, session.id, assessmentRunning],
  );

  const mergeBlockedBy = useMemo<string[]>(() => {
    if (!session.pr_url || session.pr_state === 'MERGED' || !mergeEntry) return [];
    return mergeEntry.blockedBy
      .map((blockerId) => allSessions.find((s) => s.id === blockerId))
      .filter((b): b is DevSessionWithPlanItem => !!b && b.pr_state !== 'MERGED')
      .map((b) => b.plan_item?.title ?? b.name ?? 'Session');
  }, [session.pr_url, session.pr_state, mergeEntry, allSessions]);

  // While the review agent is running, its narration is the "current step".
  const reviewActive = review.agentState === 'starting' || review.agentState === 'working';
  const latestActivitySummary = (reviewActive ? review.latestActivity : impl.latestActivity)?.summary ?? null;

  const diffStats = impl.completionStats
    ? {
        files: impl.completionStats.filesChanged,
        additions: impl.completionStats.additions,
        deletions: impl.completionStats.deletions,
      }
    : null;

  return useMemo(
    () =>
      derivePanelStatus({
        implAgentState: impl.agentState,
        reviewAgentState: review.agentState,
        automationPhase: session.automation_phase,
        pausedReason: session.paused_reason,
        hasPr: session.pr_number != null,
        prState: session.pr_state,
        reviewState: session.review_state,
        itemStatus,
        commitStatus,
        reviewStats,
        latestActivitySummary,
        terminalReason: impl.completionStats?.terminalReason ?? null,
        elapsedMs: null,
        diffStats,
        mergeBlockedBy,
      }),
    [
      impl.agentState,
      review.agentState,
      session.automation_phase,
      session.pr_number,
      session.pr_state,
      session.review_state,
      itemStatus,
      commitStatus,
      reviewStats,
      latestActivitySummary,
      impl.completionStats,
      mergeBlockedBy,
    ],
  );
}
