/**
 * Sole writer of `dev_sessions.automation_phase` and the persisted playbook
 * cursor fields that make board automation restart-safe.
 */

import type { DevSession, DevSessionAutomationPhase, DevSessionPausedReason } from '../../../shared/types';
import { isCommitHookRepairPhase } from '../../../shared/types';
import { createStatusBroadcaster } from '../repo/rendererBroadcast';
import { devSessionEvents } from '../../../shared/ipc/devSessionEvents';
import { parsePassCounts } from '../../../shared/playbookRuntime';

export type AutomationPhaseEvent =
  | { type: 'stepStarted'; stepId: string; phase?: DevSessionAutomationPhase | null }
  | {
      type: 'stepCompleted';
      stepId?: string;
      nextStepId?: string | null;
      /** Explicit execution state for the next cursor; custom step ids carry no lifecycle semantics. */
      nextPhase?: DevSessionAutomationPhase;
      stepPassCounts?: Record<string, number>;
    }
  | { type: 'paused'; stepId: string; reason: DevSessionPausedReason; stepPassCounts?: Record<string, number> }
  | { type: 'opposingReviewLaunched' }
  | { type: 'opposingReviewLaunchAborted' }
  | { type: 'opposingReviewFindingsReady'; stepId?: string }
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
  updateAutomationState?(
    id: string,
    state: {
      phase: DevSessionAutomationPhase | null;
      currentStepId?: string | null;
      stepPassCounts?: string | null;
      pausedReason?: DevSessionPausedReason | null;
    },
  ): void;
}

export interface AutomationPhaseMachineDeps {
  devSessions: AutomationPhaseRepository;
}

function isTerminationGuardedPhase(phase: DevSessionAutomationPhase | null): boolean {
  return phase === 'reviewing' || phase === 'addressing_review' || phase === 'paused' || isCommitHookRepairPhase(phase);
}

function incrementPass(raw: string | null | undefined, stepId: string): string {
  const counts = parsePassCounts(raw);
  counts[stepId] = (counts[stepId] ?? 0) + 1;
  return JSON.stringify(counts);
}

/**
 * Unwraps commit-hook repair to the phase it was entered from, for callers that
 * need to reason about the underlying playbook step without writing a transition.
 */
export function effectivePhase(
  phase: DevSessionAutomationPhase | null,
  currentStepId?: string | null,
): DevSessionAutomationPhase | null {
  if (phase === 'fixing_commit_hooks') {
    return currentStepId === 'address' ? 'addressing_review' : 'idle';
  }
  return phase;
}

function nextState(
  session: DevSession,
  event: AutomationPhaseEvent,
): {
  phase: DevSessionAutomationPhase | null;
  currentStepId?: string | null;
  stepPassCounts?: string | null;
  pausedReason?: DevSessionPausedReason | null;
} {
  const current = session.automation_phase;
  switch (event.type) {
    case 'stepStarted':
      return {
        phase: event.phase === undefined ? current : event.phase,
        currentStepId: event.stepId,
        pausedReason: null,
      };

    case 'stepCompleted':
      return {
        // Keep the existing live phase unless the interpreter explicitly tells
        // us what kind of step comes next. A custom id such as `critic-a` or
        // `repair-a` is a cursor, not a lifecycle classification.
        phase: event.nextStepId ? (event.nextPhase ?? current) : 'idle',
        currentStepId: event.nextStepId ?? null,
        pausedReason: null,
        ...(event.stepPassCounts ? { stepPassCounts: JSON.stringify(event.stepPassCounts) } : {}),
      };

    case 'paused':
      return {
        phase: 'paused', currentStepId: event.stepId, pausedReason: event.reason,
        ...(event.stepPassCounts ? { stepPassCounts: JSON.stringify(event.stepPassCounts) } : {}),
      };

    case 'opposingReviewLaunched':
      return { phase: 'reviewing', currentStepId: 'review', pausedReason: null };

    case 'opposingReviewLaunchAborted':
      return { phase: 'idle', currentStepId: null, pausedReason: null };

    case 'opposingReviewFindingsReady': {
      const stepId = event.stepId ?? session.current_step_id ?? 'review';
      return {
        phase: current === 'needs_attention' ? current : 'addressing_review',
        currentStepId: current === 'needs_attention' ? session.current_step_id : 'address',
        stepPassCounts: incrementPass(session.step_pass_counts, stepId),
        pausedReason: null,
      };
    }

    case 'prReviewThreadsQueued':
      return {
        phase: current === 'needs_attention' ? current : 'addressing_review',
        currentStepId: current === 'needs_attention' ? session.current_step_id : 'pr-review-followup',
        pausedReason: null,
      };

    case 'movedToReview':
      return { phase: 'ready_for_review', currentStepId: null, pausedReason: null };

    case 'agentTerminatedUnexpectedly':
      return { phase: isTerminationGuardedPhase(current) ? 'needs_attention' : current };

    case 'commitHookRepairStarted':
      return { phase: 'fixing_commit_hooks', currentStepId: session.current_step_id, pausedReason: null };

    case 'manualCommitResolved':
      if (effectivePhase(current, session.current_step_id) === 'addressing_review') {
        return { phase: 'ready_for_review', currentStepId: null, pausedReason: null };
      }
      if (current === 'fixing_commit_hooks' || current === 'needs_attention') {
        return { phase: 'idle', currentStepId: null, pausedReason: null };
      }
      return { phase: current };

    case 'automationDismissed':
      return {
        phase: current === 'needs_attention' || current === 'paused' ? 'idle' : current,
        currentStepId: current === 'needs_attention' || current === 'paused' ? null : session.current_step_id,
        pausedReason: null,
      };

    case 'sessionStarted':
      return {
        phase: 'idle',
        // New sessions already persist their first cursor. Preserve null for a
        // terminal snapshotted playbook receiving an allowed ad-hoc follow-up;
        // inventing `implement` here would restart the completed playbook.
        currentStepId: session.current_step_id,
        pausedReason: null,
      };

    case 'automationFailed':
      return { phase: 'needs_attention', pausedReason: null };
  }
}

function stateChanged(
  session: DevSession,
  state: ReturnType<typeof nextState>,
): boolean {
  return state.phase !== session.automation_phase
    || (state.currentStepId !== undefined && state.currentStepId !== session.current_step_id)
    || (state.stepPassCounts !== undefined && state.stepPassCounts !== session.step_pass_counts)
    || (state.pausedReason !== undefined && state.pausedReason !== session.paused_reason);
}

export function createAutomationPhaseMachine(deps: AutomationPhaseMachineDeps) {
  const broadcastSessionStatusChange = createStatusBroadcaster<DevSession, typeof devSessionEvents.statusChanged>(devSessionEvents.statusChanged);

  return {
    /**
     * Applies `event` to `sessionId`'s current phase/cursor and persists the result.
     * Synchronous end to end (fresh read, decide, write) so no other caller can
     * interleave a stale write in between.
     */
    transition(sessionId: string, event: AutomationPhaseEvent): DevSessionAutomationPhase | null {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        console.warn(`[AutomationPhaseMachine] transition on unknown session ${sessionId} (${event.type})`);
        return null;
      }

      const next = nextState(session, event);
      if (!stateChanged(session, next)) {
        return next.phase;
      }

      if (deps.devSessions.updateAutomationState) {
        deps.devSessions.updateAutomationState(sessionId, next);
      } else {
        deps.devSessions.updateAutomationPhase(sessionId, next.phase);
      }
      const updatedSession = deps.devSessions.get(sessionId);
      if (updatedSession) {
        broadcastSessionStatusChange(updatedSession);
      }
      return next.phase;
    },
  };
}

export type AutomationPhaseMachine = ReturnType<typeof createAutomationPhaseMachine>;
