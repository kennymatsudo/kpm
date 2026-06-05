import type { AgentSessionState, ReviewFinding } from '../../../shared/agent-types';
import { toImplSessionId } from '../../../shared/agent-types';
import type { IAgentReviewRepository } from '../../db/interfaces/review';
import type { PlanService } from '../core/PlanService';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { AgentSessionManager, AgentSessionManagerDeps } from './AgentSessionManager';
import { launchAutoReview } from './autoReview';

const LOG_PREFIX = '[BoardAgentOrchestrator]';

type DevSessionAutomationService = Pick<
  DevSessionService,
>;

interface BoardAgentOrchestratorDeps {
  planService: Pick<PlanService, 'updateItem'>;
  getDevSessionService: () => DevSessionAutomationService | null;
  getAgentSessionManager: () => AgentSessionManager;
  getPromptContent: (key: string) => string;
  claudeUsageService: Pick<ClaudeUsageService, 'recordUsage'>;
  requestPlanRefresh: (projectId: string) => void;
}

type AgentManagerCallbacks = Pick<
  AgentSessionManagerDeps,
>;

function isActiveAgentState(state: AgentSessionState): boolean {
  return state === 'starting' || state === 'working' || state === 'waiting_for_input';
}

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
      devSessionService.updateAutomationPhase(sessionId, 'needs_attention');
      return;
    }

    devSessionService.updateAutomationPhase(sessionId, 'ready_for_review');
    deps.requestPlanRefresh(session.project_id);
  }

  return {
    persistReviewResult: ({ implementationSessionId, reviewSessionId, reviewerAgent, findings, rawOutput }) => {
      deps.agentReviews.persistCompletedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
        raw_output: rawOutput,
        findings,
      });
    },

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
          moveSessionPlanItemToReview(implSessionId);
          return;
        }

        devSessionService.updateAutomationPhase(implSessionId, 'reviewing');

        const reviewSessionId = await launchAutoReview({
          implementationSessionId: implSessionId,
          implementationAgentType: session.agent_type,
          worktreePath: session.worktree_path,
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

      const reviewFindings = findings ?? [];
      if (reviewFindings.length === 0) {
        moveSessionPlanItemToReview(implSessionId);
        return;
      }

      if (session.automation_phase === 'needs_attention') {
        console.log(`${LOG_PREFIX} Skipping auto review follow-up for ${implSessionId} - session is needs_attention`);
        return;
      }

      devSessionService.updateAutomationPhase(implSessionId, 'addressing_review');

      const implAgentSession = deps.getAgentSessionManager().getByDevSession(implSessionId);
      if (implAgentSession && isActiveAgentState(implAgentSession.state)) {
        console.log(`${LOG_PREFIX} Impl session ${implSessionId} already active, skipping automated review follow-up`);
        return;
      }

      const followUpResult = await devSessionService.sendAgentFollowUp(
        implSessionId,
        buildReviewAssessmentPrompt(reviewFindings),
      );

      if (!followUpResult.ok) {
        console.error(`${LOG_PREFIX} Failed to send auto-review follow-up for ${implSessionId}:`, followUpResult.error);
        devSessionService.updateAutomationPhase(implSessionId, 'needs_attention');
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

        devSessionService.updateAutomationPhase(implSessionId, 'needs_attention');
      }
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
