/**
 * usePanelStatus - Thin store-gathering wrapper around `derivePanelStatus`.
 *
 * Reads the four backing sources (impl + review agent state, automation phase,
 * the review inbox, plan item status) from the stores and folds them into one
 * canonical `PanelStatus`. All the logic lives in the pure `derivePanelStatus`;
 * this hook only collects inputs.
 */

import { useMemo } from 'react';
import { useAgentSession } from '../../hooks/useAgentSession';
import { useDevSessionsStore } from '../../stores/devSessions';
import { usePlanDomainStore } from '../../stores';
import { resolveStatusCategory } from '../../constants/statusConfig';
import { getStats } from '../development/reviewStats';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import { derivePanelStatus, type PanelStatus } from './panelStatus';
import { useReviewRuntime } from './useReviewRuntime';

export function usePanelStatus(session: DevSessionWithPlanItem): PanelStatus {
  const impl = useAgentSession(session.id);
  const reviewRuntime = useReviewRuntime(session.id, session.current_step_id);
  const review = useAgentSession(reviewRuntime.sessionId);

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
    ? resolveStatusCategory(planItem) ?? 'not_started'
    : null;

  const reviewStats = useMemo(
    () => (inbox ? getStats(inbox, session.id) : null),
    [inbox, session.id],
  );

  const mergeBlockedBy = useMemo<string[]>(() => {
    if (!session.pr_url || session.pr_state === 'MERGED' || !mergeEntry) return [];
    return mergeEntry.blockedBy
      .map((blockerId) => allSessions.find((s) => s.id === blockerId))
      .filter((b): b is DevSessionWithPlanItem => !!b && b.pr_state !== 'MERGED')
      .map((b) => b.plan_item?.title ?? b.name ?? 'Session');
  }, [session.pr_url, session.pr_state, mergeEntry, allSessions]);

  // While the review agent is running, its narration is the "current step".
  const latestActivitySummary = (reviewRuntime.isActive ? review.latestActivity : impl.latestActivity)?.summary ?? null;

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
        attentionReason: session.attention_reason,
        hasPr: session.pr_number != null,
        prState: session.pr_state,
        reviewState: session.review_state,
        itemStatus,
        commitStatus,
        reviewStats,
        reviewAssessmentRunning: assessmentRunning,
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
      session.paused_reason,
      session.attention_reason,
      session.pr_number,
      session.pr_state,
      session.review_state,
      itemStatus,
      commitStatus,
      reviewStats,
      assessmentRunning,
      latestActivitySummary,
      impl.completionStats,
      mergeBlockedBy,
    ],
  );
}
