import type { ReviewAxis, ReviewFinding } from '../../../shared/agent-types';
import { toImplSessionId } from '../../../shared/agent-types';
import type { BoardProvider, Playbook, PlaybookStep } from '../../../shared/playbooks';
import { BOARD_AGENT_WRITE_POLICY, advancePlaybook, parsePassCounts, renderPlaybookDirective, resolvePlaybookPlan } from '../../../shared/playbookRuntime';
import { isCommitHookRepairPhase, type DevSession } from '../../../shared/types';
import type { DefaultModel } from '../../../shared/modelDefault';
import type { IAgentReviewRepository } from '../../db/interfaces/review';
import type { PlanService } from '../core/PlanService';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { ReviewService } from '../repo/ReviewService';
import type { AgentSessionManager, AgentSessionManagerDeps } from './AgentSessionManager';
import { launchPlaybookSubagent } from './autoReview';
import { createPlaybookRoundStore, type RunGroup } from './playbookRoundStore';
import { listBoardProviders as detectBoardProviders } from './boardProviderRegistry';
import type { ServiceResult } from '../result';
import { effectivePhase, type AutomationPhaseMachine } from './automationPhaseMachine';
import { playbookForSession, resolveCursorStep, stepById } from './sessionPlaybook';

const LOG_PREFIX = '[BoardAgentOrchestrator]';
const WORKTREE_MODIFIED_NOTICE_KEY = '__harness_worktree_modified';
const WORKTREE_MODIFIED_NOTE = 'Harness note: Another agent modified the worktree in the previous playbook step. Inspect and preserve those changes before continuing.';

type DevSessionAutomationService = Pick<
  DevSessionService,
  | 'get'
  | 'sendAgentFollowUp'
  | 'updateStatus'
  | 'commitSessionChanges'
  | 'requestCommitHookRepair'
> & Partial<Pick<
  DevSessionService,
  'savePlaybookOutputs' | 'reconcileWorkBrief' | 'syncWorkBriefSnapshot'
>>;
type ReviewQueueService = Pick<ReviewService, 'flushQueuedReviewTasks'>;

interface BoardAgentOrchestratorDeps {
  agentReviews: Pick<
    IAgentReviewRepository,
    'persistStartedReview' | 'persistCompletedReview' | 'persistFailedReview'
  > & Pick<IAgentReviewRepository, 'getByReviewSessionIds'>;
  planService: Pick<PlanService, 'updateItem'>;
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>;
  getDevSessionService: () => DevSessionAutomationService | null;
  getReviewService: () => ReviewQueueService | null;
  getAgentSessionManager: () => AgentSessionManager;
  getPromptContent: (key: string) => string;
  claudeUsageService: Pick<ClaudeUsageService, 'recordUsage'>;
  requestPlanRefresh: (projectId: string) => void;
  listBoardProviders?: () => Promise<BoardProvider[]>;
  getDefaultModel?: () => DefaultModel;
  getSkillBody?: (name: string) => ServiceResult<string>;
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

function formatFindingLines(findings: ReviewFinding[]): string {
  return findings.map((finding, index) => {
    const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '—';
    return `${index + 1}. [${finding.severity}] ${location}\n   ${finding.description}`;
  }).join('\n');
}

const AXIS_SECTIONS: { axis: ReviewAxis | null; title: string }[] = [
  { axis: 'standards', title: '## Standards' },
  { axis: 'spec', title: '## Spec' },
  { axis: null, title: '## Other' },
];

/**
 * Render findings for the address turn. When a two-axis review tagged them,
 * group by axis under headings and keep each axis's findings in their own order
 * — never merged or reranked across axes, so one lens can't mask another.
 */
export function formatFindings(findings: ReviewFinding[]): string {
  const tagged = findings.some((finding) => finding.axis === 'standards' || finding.axis === 'spec');
  if (!tagged) return formatFindingLines(findings);
  return AXIS_SECTIONS
    .map(({ axis, title }) => {
      const group = findings.filter((finding) => (
        axis === null ? finding.axis == null || finding.axis === 'general' : finding.axis === axis
      ));
      return group.length ? `${title}\n${formatFindingLines(group)}` : null;
    })
    .filter((section): section is string => section !== null)
    .join('\n\n');
}


type CaptureWorkOutcome = 'committed' | 'nothing_to_commit' | 'repair_started' | 'failed';

/** Both committed and clean-tree outcomes mean the branch capture succeeded. */
function isCaptured(outcome: CaptureWorkOutcome): boolean {
  return outcome === 'committed' || outcome === 'nothing_to_commit';
}

async function reconcileWorkBriefBeforeAdvance(
  service: DevSessionAutomationService,
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>,
  session: DevSession,
): Promise<boolean> {
  if (!service.reconcileWorkBrief) {
    return false;
  }

  const result = await service.reconcileWorkBrief(session.id);
  if (!result.ok) {
    console.error(`${LOG_PREFIX} Failed to reconcile Work Brief for ${session.id}:`, result.error);
    phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'follow-up-send-failed' });
    return true;
  }

  return result.data.reconciled;
}

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
  const subject = effectivePhase(session.automation_phase, session.current_step_id) === 'addressing_review'
    ? 'Address review findings'
    : session.name?.trim() || 'KPM task changes';

  const result = await devSessionService.commitSessionChanges(session.id, subject);
  if (result.ok) {
    return 'committed';
  }
  if (/nothing to commit/i.test(result.error)) {
    return 'nothing_to_commit';
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

export function createBoardAgentOrchestrator(deps: BoardAgentOrchestratorDeps): AgentManagerCallbacks & {
  resumePlaybook: (sessionId: string, options?: { note?: string; action?: 'resume' | 'proceed' | 'one_more_pass' }) => Promise<boolean>;
} {
  const rounds = createPlaybookRoundStore({
    agentReviews: deps.agentReviews,
    saveOutputs: (id, value) => { deps.getDevSessionService()?.savePlaybookOutputs?.(id, value); },
  });

  const phaseForPlaybookStep = (step: PlaybookStep) => step.session === 'subagent'
    ? 'reviewing' as const
    : 'addressing_review' as const;

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

  async function finishAtTerminal(session: DevSession): Promise<void> {
    const reviewService = deps.getReviewService();
    if (reviewService && session.pr_number != null) {
      const queued = await reviewService.flushQueuedReviewTasks(session.id);
      if (!queued.ok) {
        deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'queued-review-flush-failed' });
        return;
      }
      if (queued.data.taskIds.length > 0) return;
    }
    moveSessionPlanItemToReview(session.id);
  }

  async function dispatchStep(
    session: DevSession,
    playbook: Playbook,
    step: PlaybookStep,
    findings: ReviewFinding[] = [],
    resumeNote?: string,
  ): Promise<void> {
    if (step.pauseBefore && session.automation_phase !== 'paused') {
      deps.phaseMachine.transition(session.id, { type: 'paused', stepId: step.id, reason: 'gate' });
      return;
    }
    // Persist liveness before asynchronous provider detection. The PR poller
    // must never observe an idle gap between custom playbook steps.
    deps.phaseMachine.transition(session.id, {
      type: 'stepStarted',
      stepId: step.id,
      phase: phaseForPlaybookStep(step),
    });
    const providers = await (deps.listBoardProviders ?? detectBoardProviders)();
    const plan = resolvePlaybookPlan(playbook, providers, deps.getDefaultModel?.());
    const resolved = plan.steps.find((entry) => entry.stepId === step.id);
    if (!resolved || resolved.runs.some((run) => !run)) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: `provider-unavailable:${step.id}` });
      return;
    }
    const sessionOutputs = rounds.outputsFor(session);

    if (step.session === 'main') {
      const provider = providers.find((entry) => entry.id === plan.main?.provider);
      const skill = step.directive.kind === 'skill' && !provider?.capabilities.nativeSkills
        ? deps.getSkillBody?.(step.directive.name)
        : null;
      if (skill && !skill.ok) {
        deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: `skill-unavailable:${step.id}` });
        return;
      }
      const hasWorktreeNotice = Boolean(sessionOutputs[WORKTREE_MODIFIED_NOTICE_KEY]?.length);
      const prompt = renderPlaybookDirective(step, sessionOutputs, {
        nativeSkills: provider?.capabilities.nativeSkills ?? false,
        taskContext: '',
        promptContent: deps.getPromptContent,
        skillBody: skill?.ok ? skill.data : null,
        findings: formatFindings(findings),
        resumeNote,
        harnessNote: hasWorktreeNotice ? WORKTREE_MODIFIED_NOTE : null,
      });
      const result = await deps.getDevSessionService()?.sendAgentFollowUp(session.id, prompt || `Continue with playbook step: ${step.id}`);
      if (!result?.ok) {
        deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'follow-up-send-failed' });
      } else if (hasWorktreeNotice) {
        delete sessionOutputs[WORKTREE_MODIFIED_NOTICE_KEY];
        rounds.persistOutputs(session, sessionOutputs);
      }
      return;
    }

    let subagentSession = session;
    const syncResult = deps.getDevSessionService()?.syncWorkBriefSnapshot?.(session.id);
    if (syncResult && !syncResult.ok) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'follow-up-send-failed' });
      return;
    }
    if (syncResult?.ok) {
      subagentSession = syncResult.data.session;
    }

    const group = rounds.reconstructRunGroup(session, step, resolved.runs.length);
    rounds.setGroup(session.id, step.id, group);
    if (group.succeeded.size === group.expected) {
      await finalizeSubagentGroup(session, playbook, step, group);
      return;
    }
    const starts = resolved.runs.map(async (agent, runIndex) => {
      if (group.succeeded.has(runIndex)) return null;
      group.failed.delete(runIndex);
      const provider = providers.find((entry) => entry.id === agent!.provider)!;
      const skill = step.directive.kind === 'skill' && !provider.capabilities.nativeSkills
        ? deps.getSkillBody?.(step.directive.name)
        : null;
      if (skill && !skill.ok) throw new Error(skill.error);
      const directive = renderPlaybookDirective(step, sessionOutputs, {
        nativeSkills: provider.capabilities.nativeSkills,
        taskContext: '',
        promptContent: deps.getPromptContent,
        skillBody: skill?.ok ? skill.data : null,
        resumeNote,
        harnessNote: step.writes ? BOARD_AGENT_WRITE_POLICY : null,
      });
      return launchPlaybookSubagent({
        implementationSessionId: subagentSession.id,
        stepId: step.id,
        runIndex,
        attempt: group.attempt,
        agent: agent!,
        worktreePath: subagentSession.worktree_path,
        baseBranch: subagentSession.base_branch,
        taskContext: subagentSession.initial_instructions,
        directive,
        systemPrompt: deps.getPromptContent(step.runOverrides?.[runIndex]?.systemPromptKey ?? step.systemPromptKey!),
        verdict: step.verdict === 'findings',
        writes: step.writes === true,
        projectId: subagentSession.project_id,
        agentSessionManager: deps.getAgentSessionManager(),
      });
    });
    const settled = await Promise.allSettled(starts);
    settled.forEach((result, index) => { if (result.status === 'rejected') group.failed.add(index); });
    if (group.succeeded.size + group.failed.size === group.expected) {
      await finalizeSubagentGroup(session, playbook, step, group);
    }
  }

  async function advanceAfterStep(
    session: DevSession,
    playbook: Playbook,
    step: PlaybookStep,
    findings: ReviewFinding[],
    madeProgress = true,
  ): Promise<void> {
    const advance = advancePlaybook(
      playbook,
      step.id,
      { hasFindings: findings.length > 0, madeProgress },
      parsePassCounts(session.step_pass_counts),
    );
    if (advance.kind === 'complete') {
      deps.phaseMachine.transition(session.id, { type: 'stepCompleted', stepId: step.id, nextStepId: null, stepPassCounts: advance.passCounts });
      await finishAtTerminal(session);
      return;
    }
    if (advance.kind === 'pause') {
      deps.phaseMachine.transition(session.id, { type: 'paused', stepId: advance.stepId, reason: advance.reason, stepPassCounts: advance.passCounts });
      return;
    }
    const next = stepById(playbook, advance.stepId);
    deps.phaseMachine.transition(session.id, {
      type: 'stepCompleted',
      stepId: step.id,
      nextStepId: advance.stepId,
      nextPhase: next ? phaseForPlaybookStep(next) : undefined,
      stepPassCounts: advance.passCounts,
    });
    if (!next) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'missing-next-step' });
      return;
    }
    const refreshedSession = deps.getDevSessionService()?.get(session.id) ?? session;
    await dispatchStep(refreshedSession, playbook, next, findings);
  }

  async function finalizeSubagentGroup(
    session: DevSession,
    playbook: Playbook,
    step: PlaybookStep,
    group: RunGroup,
  ): Promise<void> {
    rounds.deleteGroup(session.id, step.id);
    if (group.succeeded.size === 0) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: `all-runs-failed:${step.id}` });
      return;
    }
    const sessionOutputs = rounds.outputsFor(session);
    sessionOutputs[step.id] = [...group.output.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
    rounds.persistOutputs(session, sessionOutputs);
    if (step.writes) {
      const service = deps.getDevSessionService();
      if (service) {
        const capture = await captureWorkOnBranch(service, deps.phaseMachine, session);
        if (!isCaptured(capture)) return;
      }
      // Persist before advancing the cursor so a restart between the writing
      // subagent and the next main turn cannot lose this harness-owned notice.
      sessionOutputs[WORKTREE_MODIFIED_NOTICE_KEY] = [step.id];
      rounds.persistOutputs(session, sessionOutputs);
    }
    await advanceAfterStep(session, playbook, step, group.findings);
  }

  async function settleSubagentRun(params: {
    session: DevSession;
    playbook: Playbook;
    step: PlaybookStep;
    runIndex: number;
    findings?: ReviewFinding[];
    finalText?: string | null;
    failed?: boolean;
  }): Promise<void> {
    const group = rounds.getGroup(params.session.id, params.step.id)
      ?? rounds.reconstructRunGroup(params.session, params.step, params.step.runs?.length ?? 1);
    rounds.setGroup(params.session.id, params.step.id, group);
    if (params.failed) group.failed.add(params.runIndex);
    else {
      if (!group.succeeded.has(params.runIndex)) {
        group.succeeded.add(params.runIndex);
        const axis = params.step.runOverrides?.[params.runIndex]?.axis;
        group.findings.push(...(params.findings ?? []).map((finding) => (
          axis ? { ...finding, axis: finding.axis ?? axis } : finding
        )));
      }
      if (params.finalText) group.output.set(params.runIndex, params.finalText);
    }
    if (group.succeeded.size + group.failed.size < group.expected) return;
    await finalizeSubagentGroup(params.session, params.playbook, params.step, group);
  }

  return {
    resumePlaybook: async (sessionId, options = {}) => {
      const session = deps.getDevSessionService()?.get(sessionId);
      if (!session?.playbook_snapshot || !session.current_step_id) return false;
      const playbook = playbookForSession(session);
      const step = stepById(playbook, session.current_step_id);
      if (!step) {
        deps.phaseMachine.transition(sessionId, { type: 'automationFailed', reason: 'missing-resume-step' });
        return true;
      }
      // Both the pass-limit and stalemate pauses stop at a findings loop head and
      // offer the same tiebreak: proceed to review, or push one more pass.
      const findingsPause = session.paused_reason === 'max_passes' || session.paused_reason === 'stalled';
      if (options.action === 'proceed' && findingsPause) {
        await advanceAfterStep(session, playbook, step, []);
        return true;
      }
      if (options.action === 'one_more_pass' && findingsPause && step.onFindings) {
        const target = stepById(playbook, step.onFindings.goto);
        if (!target) return false;
        const counts = parsePassCounts(session.step_pass_counts);
        counts[step.id] = (counts[step.id] ?? 0) + 1;
        deps.phaseMachine.transition(sessionId, {
          type: 'stepCompleted', stepId: step.id, nextStepId: target.id,
          nextPhase: phaseForPlaybookStep(target), stepPassCounts: counts,
        });
        const surviving = rounds.outputsFor(session)[step.id]?.join('\n\n');
        const note = [options.note, surviving ? `Surviving reviewer output:\n${surviving}` : ''].filter(Boolean).join('\n\n');
        await dispatchStep(session, playbook, target, [], note);
        return true;
      }
      await dispatchStep(session, playbook, step, [], options.note);
      return true;
    },

    persistReviewStarted: ({ implementationSessionId, reviewSessionId, reviewerAgent, stepId, runIndex }) => {
      deps.agentReviews.persistStartedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
        step_id: stepId ?? null,
        run_index: runIndex ?? null,
      });
    },

    persistReviewResult: ({ implementationSessionId, reviewSessionId, reviewerAgent, findings, rawOutput, stepId, runIndex }) => {
      deps.agentReviews.persistCompletedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
        raw_output: rawOutput,
        step_id: stepId ?? null,
        run_index: runIndex ?? null,
        findings,
      });
    },

    persistReviewFailure: ({ implementationSessionId, reviewSessionId, reviewerAgent, rawOutput, error, stepId, runIndex }) => {
      deps.agentReviews.persistFailedReview({
        implementation_session_id: implementationSessionId,
        review_session_id: reviewSessionId,
        reviewer_agent: reviewerAgent,
        raw_output: rawOutput,
        step_id: stepId ?? null,
        run_index: runIndex ?? null,
        error,
      });
    },

    onSessionComplete: async ({ devSessionId, implementationSessionId, stepId, runIndex, role, findings, finalText }) => {
      const devSessionService = deps.getDevSessionService();
      if (!devSessionService) {
        return;
      }

      const implSessionId = implementationSessionId ?? (role === 'review' ? toImplSessionId(devSessionId) : devSessionId);
      const session = devSessionService.get(implSessionId);
      if (!session) {
        return;
      }

      const playbook = playbookForSession(session);
      if (role === 'implement') {
        const capture = await captureWorkOnBranch(devSessionService, deps.phaseMachine, session);
        if (!isCaptured(capture)) return;
        const madeProgress = capture === 'committed';
        if (await reconcileWorkBriefBeforeAdvance(devSessionService, deps.phaseMachine, session)) {
          return;
        }
        // A null cursor is the interpreter's terminal halt point. Free-form
        // follow-up is allowed there, but it is an ad-hoc turn — never infer
        // the first step and restart the completed playbook.
        if (!session.current_step_id) {
          await finishAtTerminal(session);
          return;
        }
        const completed = resolveCursorStep(playbook, session.current_step_id) ?? playbook.steps[0];
        if (finalText) {
          const sessionOutputs = rounds.outputsFor(session);
          sessionOutputs[completed.id] = [finalText];
          rounds.persistOutputs(session, sessionOutputs);
        }
        await advanceAfterStep(session, playbook, completed, [], madeProgress);
        return;
      }
      const completed = resolveCursorStep(playbook, stepId ?? session.current_step_id ?? 'review');
      if (!completed) {
        deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: 'unknown-completed-step' });
        return;
      }
      await settleSubagentRun({
        session,
        playbook,
        step: completed,
        runIndex: runIndex ?? 0,
        findings,
        finalText,
        failed: completed.verdict === 'findings' && findings === undefined,
      });
      return;
    },

    onSessionStateChange: async ({ devSessionId, implementationSessionId, stepId, runIndex, role, state }) => {
      const devSessionService = deps.getDevSessionService();
      if (!devSessionService) {
        return;
      }

      const implSessionId = implementationSessionId ?? (role === 'review' ? toImplSessionId(devSessionId) : devSessionId);
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

      if (session.playbook_snapshot && role === 'review' && stepId) {
        const playbook = playbookForSession(session);
        const step = stepById(playbook, stepId);
        if (step) await settleSubagentRun({ session, playbook, step, runIndex: runIndex ?? 0, failed: true });
        return;
      }

      if (state === 'stopped') {
        deps.phaseMachine.transition(implSessionId, {
          type: 'paused',
          stepId: session.current_step_id ?? 'implement',
          reason: 'stopped',
        });
        return;
      }

      deps.phaseMachine.transition(implSessionId, { type: 'agentTerminatedUnexpectedly' });
    },

    onSessionUsage: ({ devSessionId, implementationSessionId, projectId, role, usage, stepId, runIndex }) => {
      const implSessionId = implementationSessionId ?? (role === 'review' ? toImplSessionId(devSessionId) : devSessionId);
      const session = deps.getDevSessionService()?.get(implSessionId);
      deps.claudeUsageService.recordUsage({
        projectId,
        source: 'board_playbook',
        devSessionId: implSessionId,
        stepId: stepId ?? session?.current_step_id ?? (role === 'review' ? 'review' : 'implement'),
        runIndex: runIndex ?? (role === 'review' ? 0 : null),
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
