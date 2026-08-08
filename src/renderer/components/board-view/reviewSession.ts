import type { AgentSessionState } from '../../../shared/types';
import { toReviewSessionId } from '../../../shared/agent-types';
import type { ReviewRunRecord } from '../../stores/devSessions';

const visibleReviewStates = new Set<AgentSessionState>([
  'starting',
  'working',
  'waiting_for_input',
  'failed',
  'stopped',
]);

/**
 * Picks which review-role runtime to show for an implementation session's
 * current playbook step. `reviewRuns` is what main has actually told the
 * renderer about (see `AgentSessionManager`'s `implementationSessionId`/`stepId`
 * tagging) — falls back to the legacy `${implId}-review` id when nothing is
 * recorded yet, e.g. right after a reload before any live event arrives.
 *
 * A step that fans out to more than one reviewer in parallel (e.g. two
 * `runIndex` values racing) is resolved to the lowest `runIndex` — the first
 * configured run for that step — rather than iteration/arrival order, so the
 * pick doesn't flip depending on which reviewer happens to update state first.
 */
export function reviewSessionIdForDisplay(
  implementationSessionId: string,
  currentStepId: string | null,
  agentStates: Map<string, AgentSessionState>,
  reviewRuns: ReviewRunRecord[],
): string {
  const legacyReviewSessionId = toReviewSessionId(implementationSessionId);

  const visibleCandidates = reviewRuns.filter((run) => {
    if (currentStepId && run.stepId && run.stepId !== currentStepId) return false;
    const state = agentStates.get(run.sessionId);
    return state !== undefined && visibleReviewStates.has(state);
  });

  if (visibleCandidates.length === 0) return legacyReviewSessionId;

  return visibleCandidates.reduce((lowest, candidate) =>
    (candidate.runIndex ?? 0) < (lowest.runIndex ?? 0) ? candidate : lowest
  ).sessionId;
}
