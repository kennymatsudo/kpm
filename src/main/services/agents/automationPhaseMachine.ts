/**
 * Sole writer of `dev_sessions.automation_phase`.
 *
 * Board automation has two independent triggers that both drive the same
 * column: the opposing-agent auto-review lifecycle (BoardAgentOrchestrator)
 * and the GitHub PR review-thread lifecycle (ReviewService/ReviewPollService).
 * Before this module existed, five files wrote the column directly with raw
 * phase strings, and only one call site guarded against clobbering
 * `needs_attention` — so the two triggers could race. Every phase change now
 * goes through `transition()`, which re-reads the current phase and decides
 * synchronously in one call, closing the read-then-write gap that async
 * interleaving (not true concurrency) opened up.
 */

import type { DevSession, DevSessionAutomationPhase } from '../../../shared/types';
import { isCommitHookRepairPhase } from '../../../shared/types';
import { createStatusBroadcaster } from '../repo/sessionOrchestration';

export type AutomationPhaseEvent =
  | { type: 'opposingReviewLaunched' }
  | { type: 'opposingReviewLaunchAborted' }
  | { type: 'opposingReviewFindingsReady' }
  | { type: 'prReviewThreadsQueued' }
  | { type: 'movedToReview' }
  | { type: 'agentTerminatedUnexpectedly' }
  | { type: 'commitHookRepairStarted' }
  | { type: 'manualCommitResolved' }
  | { type: 'automationDismissed' }
  | { type: 'sessionStarted' }
  | { type: 'automationFailed'; reason: string };

export interface AutomationPhaseRepository {
  get(id: string): DevSession | undefined;
  updateAutomationPhase(id: string, phase: DevSessionAutomationPhase | null): void;
}

export interface AutomationPhaseMachineDeps {
  devSessions: AutomationPhaseRepository;
}

function isTerminationGuardedPhase(phase: DevSessionAutomationPhase | null): boolean {
  return phase === 'reviewing' || phase === 'addressing_review' || isCommitHookRepairPhase(phase);
}

function phaseAfterManualCommitResolution(
  current: DevSessionAutomationPhase | null,
): DevSessionAutomationPhase | null {
  switch (current) {
    case 'fixing_commit_hooks_after_review':
    case 'addressing_review':
      return 'ready_for_review';
    case 'fixing_commit_hooks':
    case 'needs_attention':
      return 'idle';
    case 'idle':
    case 'reviewing':
    case 'ready_for_review':
    case null:
      return current;
  }
}

/**
 * Unwraps a commit-hook-repair phase to the phase it was entered from, for
 * callers that need to reason about "what is this session effectively doing"
 * without writing a transition (e.g. choosing a commit message subject line).
 * Commit-hook repair is a resumable detour, not a destination in its own right.
 */
export function effectivePhase(
  phase: DevSessionAutomationPhase | null,
): DevSessionAutomationPhase | null {
  if (phase === 'fixing_commit_hooks_after_review') {
    return 'addressing_review';
  }
  if (phase === 'fixing_commit_hooks') {
    return 'idle';
  }
  return phase;
}

function nextPhase(
  current: DevSessionAutomationPhase | null,
  event: AutomationPhaseEvent,
): DevSessionAutomationPhase | null {
  switch (event.type) {
    case 'opposingReviewLaunched':
      return 'reviewing';

    case 'opposingReviewLaunchAborted':
      return 'idle';

    case 'opposingReviewFindingsReady':
    case 'prReviewThreadsQueued':
      // Never overwrite a session the user already needs to look at — this
      // guard used to exist only on the opposing-review path, which is what
      // let the PR-review-poll path race past it.
      return current === 'needs_attention' ? current : 'addressing_review';

    case 'movedToReview':
      return 'ready_for_review';

    case 'agentTerminatedUnexpectedly':
      return isTerminationGuardedPhase(current) ? 'needs_attention' : current;

    case 'commitHookRepairStarted':
      return current === 'addressing_review' || current === 'fixing_commit_hooks_after_review'
        ? 'fixing_commit_hooks_after_review'
        : 'fixing_commit_hooks';

    case 'manualCommitResolved':
      return phaseAfterManualCommitResolution(current);

    case 'automationDismissed':
      return current === 'needs_attention' ? 'idle' : current;

    case 'sessionStarted':
      return 'idle';

    case 'automationFailed':
      return 'needs_attention';
  }
}

export function createAutomationPhaseMachine(deps: AutomationPhaseMachineDeps) {
  const broadcastSessionStatusChange = createStatusBroadcaster<DevSession>('dev-session:status-changed');

  return {
    /**
     * Applies `event` to `sessionId`'s current phase and persists the result.
     * Synchronous end to end (fresh read, decide, write) so no other caller
     * can interleave a stale write in between.
     */
    transition(sessionId: string, event: AutomationPhaseEvent): DevSessionAutomationPhase | null {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        console.warn(`[AutomationPhaseMachine] transition on unknown session ${sessionId} (${event.type})`);
        return null;
      }

      const next = nextPhase(session.automation_phase, event);
      if (next === session.automation_phase) {
        return next;
      }

      deps.devSessions.updateAutomationPhase(sessionId, next);
      const updatedSession = deps.devSessions.get(sessionId);
      if (updatedSession) {
        broadcastSessionStatusChange(updatedSession);
      }
      return next;
    },
  };
}

export type AutomationPhaseMachine = ReturnType<typeof createAutomationPhaseMachine>;
