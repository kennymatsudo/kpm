import type { ReviewFinding } from '../../../shared/agent-types';
import { toImplSessionId } from '../../../shared/agent-types';
import { isCommitHookRepairPhase, type DevSession } from '../../../shared/types';
import type { IAgentReviewRepository } from '../../db/interfaces/review';
import type { PlanService } from '../core/PlanService';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { ReviewService } from '../repo/ReviewService';
import type { AgentSessionManager, AgentSessionManagerDeps } from './AgentSessionManager';
import { launchAutoReview } from './autoReview';
import { effectivePhase, type AutomationPhaseMachine } from './automationPhaseMachine';

const LOG_PREFIX = '[BoardAgentOrchestrator]';

type DevSessionAutomationService = Pick<
  DevSessionService,
  | 'get'
  | 'sendAgentFollowUp'
  | 'updateStatus'
  | 'commitSessionChanges'
  | 'requestCommitHookRepair'
>;
type ReviewQueueService = Pick<ReviewService, 'flushQueuedReviewTasks'>;

interface BoardAgentOrchestratorDeps {
  agentReviews: Pick<
    IAgentReviewRepository,
    'persistStartedReview' | 'persistCompletedReview' | 'persistFailedReview'
  >;
  planService: Pick<PlanService, 'updateItem'>;
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>;
  getDevSessionService: () => DevSessionAutomationService | null;
  getReviewService: () => ReviewQueueService | null;
  getAgentSessionManager: () => AgentSessionManager;
  getPromptContent: (key: string) => string;
  claudeUsageService: Pick<ClaudeUsageService, 'recordUsage'>;
  requestPlanRefresh: (projectId: string) => void;
}

type AgentManagerCallbacks = Pick<
  AgentSessionManagerDeps,
  | 'persistReviewStarted'
  | 'persistReviewResult'
  | 'persistReviewFailure'
  | 'onSessionComplete'
  | 'onSessionStateChange'
  | 'onSessionUsage'
>;

function buildReviewAssessmentPrompt(findings: ReviewFinding[]): string {
  const sections: string[] = [
    'An opposing review agent completed a review of your implementation.',
    '',
    'Assess the findings against the current code, original task intent, and repository conventions.',
    '- Address findings that are real, important, and worth fixing now.',
    '- Ignore findings that are incorrect, redundant, or not worth addressing for this task.',
    '- Do not ask for human confirmation.',
    '- If you decide to address a finding, make the code changes directly.',
    '- If no findings are worth addressing, do not change code unnecessarily.',
    '',
    'In your final summary, include three short sections:',
    '1. Addressed findings',
    '2. Ignored findings',
    '3. Verification after addressing findings (include exact commands, or "not run" with reason)',
    '',
    'Review findings:',
  ];

  findings.forEach((finding, index) => {
    sections.push(
      `${index + 1}. [${finding.severity}] ${finding.file}${finding.line ? `:${finding.line}` : ''}`,
      `   ${finding.description}`,
    );
  });

  return sections.join('\n');
}

type CaptureWorkOutcome = 'captured' | 'repair_started' | 'failed';

/**
 * Commit the implementation agent's worktree changes onto the task's own branch.
 *
 * The implementation prompt never commits, so without this step the work stays
 * as uncommitted worktree edits: the branch remains pinned at its fork point,
 * review/PR flows see nothing on the branch, and the changes are eventually
 * stranded or re-applied onto the base branch by hand — which is how one task's
 * commit ends up attributed to another. A clean tree ("nothing to commit") is
 * expected when the agent committed itself, and is not an error.
 */
async function captureWorkOnBranch(
  devSessionService: DevSessionAutomationService,
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>,
  session: DevSession,
): Promise<CaptureWorkOutcome> {
  const subject = effectivePhase(session.automation_phase) === 'addressing_review'
    ? 'Address review findings'
    : session.name?.trim() || 'KPM task changes';

  const result = await devSessionService.commitSessionChanges(session.id, subject);
  if (result.ok || /nothing to commit/i.test(result.error)) {
    return 'captured';
  }

  if (!isCommitHookRepairPhase(session.automation_phase)) {
    const repairResult = await devSessionService.requestCommitHookRepair(session.id, result.error);
    if (repairResult.ok && repairResult.data.started) {
      return 'repair_started';
    }
  }

  console.warn(`${LOG_PREFIX} Could not capture work onto branch for ${session.id}: ${result.error}`);
  phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'commit-capture-failed' });
  return 'failed';
}

export function createBoardAgentOrchestrator(deps: BoardAgentOrchestratorDeps): AgentManagerCallbacks {
  function moveSessionPlanItemToReview(sessionId: string): void {
    const devSessionService = deps.getDevSessionService();
    if (!devSessionService) {
      return;
    }

    const session = devSessionService.get(sessionId);
    if (!session?.plan_item_id) {
      return;
    }

    const result = deps.planService.updateItem(session.plan_item_id, { status_category: 'in_review' });
    if (!result.ok) {
      console.error(`${LOG_PREFIX} Failed to move ${sessionId} to in_review:`, result.error);
      deps.phaseMachine.transition(sessionId, { type: 'automationFailed', reason: 'move-to-review-failed' });
      return;
    }

    deps.phaseMachine.transition(sessionId, { type: 'movedToReview' });
    deps.requestPlanRefresh(session.project_id);
  }

  return {
    persistReviewStarted: ({ implementationSessionId, reviewSessionId, reviewerAgent }) => {
      deps.agentReviews.persistStartedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
      });
    },

    persistReviewResult: ({ implementationSessionId, reviewSessionId, reviewerAgent, findings, rawOutput }) => {
      deps.agentReviews.persistCompletedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
        raw_output: rawOutput,
        findings,
      });
    },

    persistReviewFailure: ({ implementationSessionId, reviewSessionId, reviewerAgent, rawOutput, error }) => {
      deps.agentReviews.persistFailedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
        raw_output: rawOutput,
        error,
      });
    },

    onSessionComplete: async ({ devSessionId, role, findings, reviewError }) => {
      const devSessionService = deps.getDevSessionService();
      if (!devSessionService) {
        return;
      }

      const implSessionId = role === 'review' ? toImplSessionId(devSessionId) : devSessionId;
      const session = devSessionService.get(implSessionId);
      if (!session) {
        return;
      }

      if (role === 'implement') {
        // Capture the agent's work onto the task's own branch before anything
        // else, so the isolated branch actually holds the task's commits.
        const captureOutcome = await captureWorkOnBranch(devSessionService, deps.phaseMachine, session);
        if (captureOutcome === 'repair_started') {
          return;
        }
        if (captureOutcome === 'failed') {
          return;
        }

        const effectiveAutomationPhase = effectivePhase(session.automation_phase);

        const reviewService = deps.getReviewService();
        if (reviewService) {
          const queuedResult = await reviewService.flushQueuedReviewTasks(implSessionId);
          if (!queuedResult.ok) {
            console.error(`${LOG_PREFIX} Failed to flush queued PR review tasks for ${implSessionId}:`, queuedResult.error);
            deps.phaseMachine.transition(implSessionId, { type: 'automationFailed', reason: 'queued-review-flush-failed' });
            return;
          }
          if (queuedResult.data.taskIds.length > 0) {
            console.log(`${LOG_PREFIX} Sent ${queuedResult.data.taskIds.length} queued PR review task(s) to ${implSessionId}`);
            return;
          }
        }

        if (effectiveAutomationPhase === 'addressing_review') {
          moveSessionPlanItemToReview(implSessionId);
          return;
        }

        if (session.review_policy === 'skip') {
          moveSessionPlanItemToReview(implSessionId);
          return;
        }

        deps.phaseMachine.transition(implSessionId, { type: 'opposingReviewLaunched' });

        const reviewSessionId = await launchAutoReview({
          implementationSessionId: implSessionId,
          implementationAgentType: session.agent_type,
          worktreePath: session.worktree_path,
          baseBranch: session.base_branch,
          taskDescription: session.initial_instructions,
          projectId: session.project_id,
          agentSessionManager: deps.getAgentSessionManager(),
          getPromptContent: deps.getPromptContent,
        });

        if (!reviewSessionId) {
          moveSessionPlanItemToReview(implSessionId);
        }
        return;
      }

      if (findings === undefined) {
        console.warn(
          `${LOG_PREFIX} Review session ${devSessionId} completed without valid findings: ${reviewError ?? 'unknown error'}`
        );
        deps.phaseMachine.transition(implSessionId, { type: 'automationFailed', reason: 'opposing-review-errored' });
        return;
      }

      const reviewFindings = findings ?? [];
      if (reviewFindings.length === 0) {
        moveSessionPlanItemToReview(implSessionId);
        return;
      }

      const nextPhase = deps.phaseMachine.transition(implSessionId, { type: 'opposingReviewFindingsReady' });
      if (nextPhase !== 'addressing_review') {
        console.log(`${LOG_PREFIX} Skipping auto review follow-up for ${implSessionId} - session is needs_attention`);
        return;
      }

      if (deps.getAgentSessionManager().isSessionBusy(implSessionId)) {
        console.log(`${LOG_PREFIX} Impl session ${implSessionId} already active, skipping automated review follow-up`);
        return;
      }

      const followUpResult = await devSessionService.sendAgentFollowUp(
        implSessionId,
        buildReviewAssessmentPrompt(reviewFindings),
      );

      if (!followUpResult.ok) {
        console.error(`${LOG_PREFIX} Failed to send auto-review follow-up for ${implSessionId}:`, followUpResult.error);
        deps.phaseMachine.transition(implSessionId, { type: 'automationFailed', reason: 'follow-up-send-failed' });
      }
    },

    onSessionStateChange: ({ devSessionId, role, state }) => {
      const devSessionService = deps.getDevSessionService();
      if (!devSessionService) {
        return;
      }

      const implSessionId = role === 'review' ? toImplSessionId(devSessionId) : devSessionId;
      const session = devSessionService.get(implSessionId);
      if (!session) {
        return;
      }

      if (
        role === 'implement'
        && (state === 'complete' || state === 'failed' || state === 'stopped')
        && session.status === 'active'
      ) {
        devSessionService.updateStatus(implSessionId, 'inactive');
      }

      if (state !== 'failed' && state !== 'stopped') {
        return;
      }

      deps.phaseMachine.transition(implSessionId, { type: 'agentTerminatedUnexpectedly' });
    },

    onSessionUsage: ({ projectId, role, usage }) => {
      deps.claudeUsageService.recordUsage({
        projectId,
        source: role === 'review' ? 'board_review' : 'board_implement',
        model: usage.model,
        usage: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_input_tokens: usage.cacheCreationTokens,
          cache_read_input_tokens: usage.cacheReadTokens,
        },
        totalCostUsd: usage.totalCostUsd,
        sdkSessionId: usage.sdkSessionId,
        sdkResultUuid: usage.sdkResultUuid,
        sdkCostScope: usage.sdkCostScope,
        isCumulativeCostSnapshot: usage.isCumulativeCostSnapshot,
      });
    },
  };
}
