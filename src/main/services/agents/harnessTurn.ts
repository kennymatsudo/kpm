/**
 * Turns the harness injects into a board run that the run's playbook never
 * declared: a PR review follow-up, a commit-hook repair, an ad-hoc review.
 *
 * They share one hazard. The cursor an injected turn parks on names a step no
 * playbook lists, and `advancePlaybook` completes a run whose cursor it cannot
 * resolve — so a cursor written for a turn that never ran silently drops every
 * remaining review and address step. Hence the two rules this module keeps:
 * the cursor moves only once the turn is accepted, and a review that never
 * launches puts back the cursor its session was interrupted at.
 *
 * Callers pass intent. Nothing outside here decides which phase event an
 * injected turn writes, or which failure reason it lands on.
 */

import { PR_REVIEW_FOLLOWUP_STEP, type PlaybookStep } from '../../../shared/playbooks';
import type { DevSession, DevSessionAutomationPhase } from '../../../shared/types';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import {
  captureAutomationState,
  type AutomationPhaseEvent,
  type AutomationPhaseMachine,
} from './automationPhaseMachine';
import type { TurnReentry } from './mainStepTurn';

/**
 * `sent` — the agent accepted the turn and the cursor moved.
 * `deferred` — the agent was mid-turn; nothing was sent and the cursor stands.
 * `refused` — the caller had nothing to send.
 */
export type HarnessTurnOutcome = 'sent' | 'deferred' | 'refused';

export type HarnessTurnKind = 'pr-review-followup' | 'commit-hook-repair';

export interface HarnessTurnDeps {
  devSessions: { get(id: string): DevSession | undefined };
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>;
  sendAgentFollowUp: (
    sessionId: string,
    text: string,
    options: { restartIfBusy: false; restartAs: TurnReentry },
  ) => AsyncResult<{ restarted: boolean; deferred?: boolean }>;
}

const ACCEPTED_BY_KIND: Record<HarnessTurnKind, AutomationPhaseEvent> = {
  'pr-review-followup': { type: 'prReviewThreadsQueued', stepId: PR_REVIEW_FOLLOWUP_STEP.id },
  'commit-hook-repair': { type: 'commitHookRepairStarted' },
};

/**
 * Eviction and main-process restarts make a follow-up that turns into a fresh
 * agent routine, and a fresh agent re-enters at `idle` unless told otherwise —
 * where a crash on this turn never reaches the board as needing attention. The
 * role prompt is left to the playbook's first main step; only the phase is ours.
 */
const RESTART_PHASE_BY_KIND: Record<HarnessTurnKind, DevSessionAutomationPhase> = {
  'pr-review-followup': 'addressing_review',
  'commit-hook-repair': 'fixing_commit_hooks',
};

function fail(
  deps: Pick<HarnessTurnDeps, 'phaseMachine'>,
  sessionId: string,
  error: string,
): ServiceResult<never> {
  deps.phaseMachine.transition(sessionId, { type: 'automationFailed', reason: 'follow-up-send-failed' });
  return failure(error);
}

/**
 * Inject one turn into the session's own agent.
 *
 * A busy agent is never restarted out from under its turn — the injected turn
 * defers and the caller keeps whatever queue marker it holds.
 */
export async function requestHarnessTurn(
  deps: HarnessTurnDeps,
  request: {
    sessionId: string;
    kind: HarnessTurnKind;
    /** Resolving to `null` refuses the turn: nothing is sent, nothing is written. */
    buildPrompt: (session: DevSession) => AsyncResult<string | null>;
  },
): AsyncResult<HarnessTurnOutcome> {
  const session = deps.devSessions.get(request.sessionId);
  if (!session) return failure(`Session not found: ${request.sessionId}`);

  const prompt = await request.buildPrompt(session);
  if (!prompt.ok) return fail(deps, request.sessionId, prompt.error);
  if (prompt.data === null) return success('refused');

  const sent = await deps.sendAgentFollowUp(request.sessionId, prompt.data, {
    restartIfBusy: false,
    restartAs: { phase: RESTART_PHASE_BY_KIND[request.kind] },
  });
  if (!sent.ok) return fail(deps, request.sessionId, sent.error);
  if (sent.data.deferred) return success('deferred');

  deps.phaseMachine.transition(request.sessionId, ACCEPTED_BY_KIND[request.kind]);
  return success('sent');
}

/**
 * Launch a review subagent the playbook did not schedule.
 *
 * Unlike an injected follow-up the cursor has to move first — the review can
 * finish before `launch` resolves, and its completion must find the step it
 * settles against. A launch that never happens restores the snapshot instead of
 * dropping the run at idle.
 *
 * Resolves to the review session id, or `null` when no reviewer could run.
 */
export async function requestHarnessReview(
  deps: Pick<HarnessTurnDeps, 'devSessions' | 'phaseMachine'>,
  request: {
    sessionId: string;
    /** The step the review's completion resolves back to. */
    step: PlaybookStep;
    launch: () => Promise<string | null>;
  },
): AsyncResult<string | null> {
  const session = deps.devSessions.get(request.sessionId);
  if (!session) return failure(`Session not found: ${request.sessionId}`);

  const restore = captureAutomationState(session);
  deps.phaseMachine.transition(request.sessionId, { type: 'opposingReviewLaunched', stepId: request.step.id });

  let reviewSessionId: string | null;
  try {
    reviewSessionId = await request.launch();
  } catch (error) {
    deps.phaseMachine.transition(request.sessionId, { type: 'harnessTurnAborted', restore });
    return failure(error instanceof Error ? error.message : String(error));
  }

  if (!reviewSessionId) {
    deps.phaseMachine.transition(request.sessionId, { type: 'harnessTurnAborted', restore });
  }
  return success(reviewSessionId);
}
