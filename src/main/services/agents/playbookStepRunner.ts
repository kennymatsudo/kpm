import type { ReviewFinding } from '../../../shared/agent-types';
import type { Playbook, PlaybookStep } from '../../../shared/playbooks';
import { advancePlaybook, parsePassCounts } from '../../../shared/playbookRuntime';
import type { DevSession } from '../../../shared/types';
import type { PlanService } from '../core/PlanService';
import type { ReviewService } from '../repo/ReviewService';
import type { AutomationPhaseMachine } from './automationPhaseMachine';
import { stepById } from './sessionPlaybook';

interface DevSessionLookup {
  get(id: string): DevSession | undefined;
}

type ReviewQueue = Pick<ReviewService, 'flushQueuedReviewTasks'>;

interface PlaybookStepRunnerDeps {
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>;
  planService: Pick<PlanService, 'updateItem'>;
  getDevSessionService: () => DevSessionLookup | null;
  getReviewService: () => ReviewQueue | null;
  requestPlanRefresh: (projectId: string) => void;
  dispatch: (
    session: DevSession,
    playbook: Playbook,
    step: PlaybookStep,
    findings: ReviewFinding[],
    resumeNote?: string,
  ) => Promise<void>;
}

/**
 * Owns the persisted outcome of a settled playbook step.
 *
 * The caller reports that a step settled; this module decides whether the
 * playbook pauses, advances, or reaches the Board's terminal review state.
 * Keeping those decisions together makes restart ordering testable at one seam.
 */
export function createPlaybookStepRunner(deps: PlaybookStepRunnerDeps) {
  const phaseForStep = (step: PlaybookStep) => step.session === 'subagent'
    ? 'reviewing' as const
    : 'addressing_review' as const;

  function movePlanItemToReview(sessionId: string): void {
    const sessions = deps.getDevSessionService();
    const session = sessions?.get(sessionId);
    if (!session?.plan_item_id) return;

    const result = deps.planService.updateItem(session.plan_item_id, { status_category: 'in_review' });
    if (!result.ok) {
      deps.phaseMachine.transition(sessionId, { type: 'automationFailed', reason: 'move-to-review-failed' });
      return;
    }

    deps.phaseMachine.transition(sessionId, { type: 'movedToReview' });
    deps.requestPlanRefresh(session.project_id);
  }

  async function finish(session: DevSession): Promise<void> {
    const reviewQueue = deps.getReviewService();
    if (reviewQueue && session.pr_number != null) {
      const queued = await reviewQueue.flushQueuedReviewTasks(session.id);
      if (!queued.ok) {
        deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'queued-review-flush-failed' });
        return;
      }
      if (queued.data.taskIds.length > 0) return;
    }
    movePlanItemToReview(session.id);
  }

  async function settle(params: {
    session: DevSession;
    playbook: Playbook;
    step: PlaybookStep;
    findings: ReviewFinding[];
    madeProgress?: boolean;
  }): Promise<void> {
    const { session, playbook, step, findings, madeProgress = true } = params;
    const advance = advancePlaybook(
      playbook,
      step.id,
      { hasFindings: findings.length > 0, madeProgress },
      parsePassCounts(session.step_pass_counts),
    );
    if (advance.kind === 'complete') {
      deps.phaseMachine.transition(session.id, {
        type: 'stepCompleted', stepId: step.id, nextStepId: null, stepPassCounts: advance.passCounts,
      });
      await finish(session);
      return;
    }
    if (advance.kind === 'pause') {
      deps.phaseMachine.transition(session.id, {
        type: 'paused', stepId: advance.stepId, reason: advance.reason, stepPassCounts: advance.passCounts,
      });
      return;
    }

    const next = stepById(playbook, advance.stepId);
    deps.phaseMachine.transition(session.id, {
      type: 'stepCompleted',
      stepId: step.id,
      nextStepId: advance.stepId,
      nextPhase: next ? phaseForStep(next) : undefined,
      stepPassCounts: advance.passCounts,
    });
    if (!next) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'missing-next-step' });
      return;
    }

    const refreshedSession = deps.getDevSessionService()?.get(session.id) ?? session;
    await deps.dispatch(refreshedSession, playbook, next, findings);
  }

  return { settle, finish };
}

export type PlaybookStepRunner = ReturnType<typeof createPlaybookStepRunner>;
