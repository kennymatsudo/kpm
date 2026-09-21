/**
 * Sole writer of `dev_sessions.automation_phase` and the persisted playbook
 * cursor fields that make board automation restart-safe.
 *
 * Because every phase change funnels through here, this is also where board
 * automation announces the phases a user has to act on (`BOARD_AGENT_NOTIFY_PHASES`)
 * onto the `UpdateEventBus`, so they reach the notification bell.
 */

import type {
  DevSession,
  DevSessionAttentionReason,
  DevSessionAutomationPhase,
  DevSessionPausedReason,
} from '../../../shared/types';
import { isCommitHookRepairPhase } from '../../../shared/types';
import { createStatusBroadcaster } from '../repo/rendererBroadcast';
import { devSessionEvents } from '../../../shared/ipc/devSessionEvents';
import { isBoardAgentNotifyPhase, type UpdateEventBus } from '../core/UpdateEventBus';
import { readSessionRun } from './sessionPlaybook';

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
  | { type: 'opposingReviewLaunched'; stepId: string }
  | { type: 'harnessTurnAborted'; restore: AutomationStateSnapshot }
  | { type: 'prReviewThreadsQueued'; stepId: string }
  | { type: 'movedToReview' }
  | { type: 'agentTerminatedUnexpectedly' }
  | { type: 'commitHookRepairStarted' }
  | { type: 'manualCommitResolved' }
  | { type: 'automationDismissed' }
  | { type: 'sessionStarted'; phase?: DevSessionAutomationPhase }
  | { type: 'automationFailed'; reason: DevSessionAttentionReason };

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
      attentionReason?: DevSessionAttentionReason | null;
    },
  ): void;
}

export interface AutomationPhaseMachineDeps {
  devSessions: AutomationPhaseRepository;
  /**
   * Optional bus for announcing user-actionable phases. Omitted in tests that
   * only exercise the state table.
   */
  eventBus?: Pick<UpdateEventBus, 'emit'>;
  /** Resolves the label a notification should call this session's work. */
  resolveTaskName?: (session: DevSession) => string | null;
}

/** The automation state a harness-injected turn interrupted, so it can be put back. */
export interface AutomationStateSnapshot {
  phase: DevSessionAutomationPhase | null;
  stepId: string | null;
  pausedReason: DevSessionPausedReason | null;
  attentionReason: DevSessionAttentionReason | null;
}

export function captureAutomationState(session: DevSession): AutomationStateSnapshot {
  return {
    phase: session.automation_phase,
    stepId: session.current_step_id,
    pausedReason: session.paused_reason ?? null,
    attentionReason: session.attention_reason ?? null,
  };
}

function isTerminationGuardedPhase(phase: DevSessionAutomationPhase | null): boolean {
  return phase === 'reviewing' || phase === 'addressing_review' || phase === 'paused' || isCommitHookRepairPhase(phase);
}

/**
 * Unwraps commit-hook repair to the phase it was entered from, for callers that
 * need to reason about the underlying playbook step without writing a transition.
 */
export function effectivePhase(
  phase: DevSessionAutomationPhase | null,
  session?: DevSession,
): DevSessionAutomationPhase | null {
  if (phase === 'fixing_commit_hooks') {
    // Resolve the parked cursor rather than matching the built-in step id: a
    // custom playbook's findings step is named whatever its author chose.
    const addressing = session ? readSessionRun(session).cursor?.addressesFindings : false;
    return addressing ? 'addressing_review' : 'idle';
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
  attentionReason?: DevSessionAttentionReason | null;
} {
  const current = session.automation_phase;
  switch (event.type) {
    case 'stepStarted':
      return {
        phase: event.phase === undefined ? current : event.phase,
        currentStepId: event.stepId,
        pausedReason: null,
        attentionReason: null,
      };

    case 'stepCompleted':
      return {
        // Keep the existing live phase unless the interpreter explicitly tells
        // us what kind of step comes next. A custom id such as `critic-a` or
        // `repair-a` is a cursor, not a lifecycle classification.
        phase: event.nextStepId ? (event.nextPhase ?? current) : 'idle',
        currentStepId: event.nextStepId ?? null,
        pausedReason: null,
        attentionReason: null,
        ...(event.stepPassCounts ? { stepPassCounts: JSON.stringify(event.stepPassCounts) } : {}),
      };

    case 'paused':
      return {
        phase: 'paused', currentStepId: event.stepId, pausedReason: event.reason, attentionReason: null,
        ...(event.stepPassCounts ? { stepPassCounts: JSON.stringify(event.stepPassCounts) } : {}),
      };

    case 'opposingReviewLaunched':
      return { phase: 'reviewing', currentStepId: event.stepId, pausedReason: null, attentionReason: null };

    case 'harnessTurnAborted':
      return {
        phase: event.restore.phase,
        currentStepId: event.restore.stepId,
        pausedReason: event.restore.pausedReason,
        attentionReason: event.restore.attentionReason,
      };

    case 'prReviewThreadsQueued':
      return {
        // A parked failure survives an automated follow-up — only the user's own
        // decision clears it. The cursor still moves, because the agent accepted
        // the turn: left on the step that failed, the follow-up's completion
        // settles THAT step and silently completes the run from a step that
        // never ran.
        phase: current === 'needs_attention' ? current : 'addressing_review',
        currentStepId: event.stepId,
        pausedReason: null,
        attentionReason: current === 'needs_attention' ? session.attention_reason ?? null : null,
      };

    case 'movedToReview':
      return { phase: 'ready_for_review', currentStepId: null, pausedReason: null, attentionReason: null };

    case 'agentTerminatedUnexpectedly':
      return isTerminationGuardedPhase(current)
        ? { phase: 'needs_attention', attentionReason: 'agent-terminated' }
        : { phase: current };

    case 'commitHookRepairStarted':
      return {
        phase: 'fixing_commit_hooks',
        currentStepId: session.current_step_id,
        pausedReason: null,
        attentionReason: null,
      };

    case 'manualCommitResolved':
      if (effectivePhase(current, session) === 'addressing_review') {
        return { phase: 'ready_for_review', currentStepId: null, pausedReason: null, attentionReason: null };
      }
      if (current === 'fixing_commit_hooks' || current === 'needs_attention') {
        return { phase: 'idle', currentStepId: null, pausedReason: null, attentionReason: null };
      }
      return { phase: current };

    case 'automationDismissed':
      return {
        phase: current === 'needs_attention' || current === 'paused' ? 'idle' : current,
        currentStepId: current === 'needs_attention' || current === 'paused' ? null : session.current_step_id,
        pausedReason: null,
        attentionReason: null,
      };

    case 'sessionStarted':
      return {
        phase: event.phase ?? 'idle',
        // New sessions already persist their first cursor. Preserve null for a
        // terminal snapshotted playbook receiving an allowed ad-hoc follow-up;
        // inventing `implement` here would restart the completed playbook.
        currentStepId: session.current_step_id,
        pausedReason: null,
        attentionReason: null,
      };

    case 'automationFailed':
      return { phase: 'needs_attention', pausedReason: null, attentionReason: event.reason };
  }
}

function stateChanged(
  session: DevSession,
  state: ReturnType<typeof nextState>,
): boolean {
  return state.phase !== session.automation_phase
    || (state.currentStepId !== undefined && state.currentStepId !== session.current_step_id)
    || (state.stepPassCounts !== undefined && state.stepPassCounts !== session.step_pass_counts)
    || (state.pausedReason !== undefined && state.pausedReason !== session.paused_reason)
    || (state.attentionReason !== undefined && state.attentionReason !== (session.attention_reason ?? null));
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

      // Only announce a phase the user has to act on, and only when the phase
      // itself moved — a cursor or pass-count write is not news.
      if (
        next.phase !== session.automation_phase
        && isBoardAgentNotifyPhase(next.phase)
        && !(next.phase === 'paused' && next.pausedReason === 'stopped')
      ) {
        deps.eventBus?.emit({
          kind: 'board_agent',
          source: 'agent',
          detectedAt: new Date().toISOString(),
          devSessionId: sessionId,
          projectId: session.project_id,
          planItemId: session.plan_item_id,
          taskName: deps.resolveTaskName?.(session) ?? session.name,
          phase: next.phase,
          pausedReason: next.pausedReason ?? null,
          attentionReason: next.attentionReason ?? null,
        });
      }

      return next.phase;
    },
  };
}

export type AutomationPhaseMachine = ReturnType<typeof createAutomationPhaseMachine>;
