import type { AgentSessionState } from '../../../shared/types';
import { toReviewSessionId } from '../../../shared/agent-types';
import type { ReviewRunRecord } from '../../stores/devSessions';

/** States in which a review-role runtime should be shown on a board surface. */
const VISIBLE_REVIEW_STATES = new Set<AgentSessionState>([
  'starting',
  'working',
  'waiting_for_input',
  'failed',
  'stopped',
]);

/** States in which a review-role runtime is actively narrating, not just waiting or terminal. */
const ACTIVE_REVIEW_STATES = new Set<AgentSessionState>(['starting', 'working']);

export function isReviewVisible(state: AgentSessionState | undefined): boolean {
  return state !== undefined && VISIBLE_REVIEW_STATES.has(state);
}

export function isReviewActive(state: AgentSessionState | undefined): boolean {
  return state !== undefined && ACTIVE_REVIEW_STATES.has(state);
}

/** The review-role runtime a board surface should show for an implementation session's current playbook step. */
export interface ReviewRuntime {
  sessionId: string;
  agentState: AgentSessionState | undefined;
  isVisible: boolean;
  isActive: boolean;
}

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
export function resolveReviewRuntime(
  implementationSessionId: string,
  currentStepId: string | null,
  agentStates: Map<string, AgentSessionState>,
  reviewRuns: ReviewRunRecord[],
): ReviewRuntime {
  const legacyReviewSessionId = toReviewSessionId(implementationSessionId);

  const visibleCandidates = reviewRuns.filter((run) => {
    if (currentStepId && run.stepId && run.stepId !== currentStepId) return false;
    return isReviewVisible(agentStates.get(run.sessionId));
  });

  const sessionId = visibleCandidates.length === 0
    ? legacyReviewSessionId
    : visibleCandidates.reduce((lowest, candidate) =>
        (candidate.runIndex ?? 0) < (lowest.runIndex ?? 0) ? candidate : lowest
      ).sessionId;

  const agentState = agentStates.get(sessionId);
  return {
    sessionId,
    agentState,
    isVisible: isReviewVisible(agentState),
    isActive: isReviewActive(agentState),
  };
}
