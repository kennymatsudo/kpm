import type { ReviewFinding } from '../../../shared/agent-types';
import { toImplSessionId } from '../../../shared/agent-types';
import { DEFAULT_PLAYBOOK, BUILT_IN_PLAYBOOKS, parsePlaybook, type BoardProvider, type Playbook, type PlaybookStep } from '../../../shared/playbooks';
import { advancePlaybook, parsePassCounts, renderPlaybookDirective, resolvePlaybookPlan } from '../../../shared/playbookRuntime';
import { isCommitHookRepairPhase, type DevSession } from '../../../shared/types';
import type { IAgentReviewRepository } from '../../db/interfaces/review';
import type { PlanService } from '../core/PlanService';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { ReviewService } from '../repo/ReviewService';
import type { AgentSessionManager, AgentSessionManagerDeps } from './AgentSessionManager';
import { launchAutoReview, launchPlaybookSubagent, toPlaybookSubagentSessionId } from './autoReview';
import { listBoardProviders as detectBoardProviders } from './boardProviderRegistry';
import type { ServiceResult } from '../result';
import { effectivePhase, type AutomationPhaseMachine } from './automationPhaseMachine';

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
> & Partial<Pick<DevSessionService, 'savePlaybookOutputs'>>;
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

function formatFindings(findings: ReviewFinding[]): string {
  return findings.map((finding, index) => {
    const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '—';
    return `${index + 1}. [${finding.severity}] ${location}\n   ${finding.description}`;
  }).join('\n');
}

function playbookForSession(session: DevSession): Playbook {
  if (session.playbook_snapshot) {
    try {
      return parsePlaybook(JSON.parse(session.playbook_snapshot));
    } catch (error) {
      console.warn(`${LOG_PREFIX} Invalid playbook snapshot for ${session.id}; using built-in default`, error);
    }
  }
  // Compatibility boundary only: rows created before migration 103 have no
  // immutable snapshot. Newly started board sessions are snapshotted and must
  // use the interpreter path below; do not expand this fallback to new runs.
  return session.review_policy === 'skip' ? BUILT_IN_PLAYBOOKS.implementOnly : DEFAULT_PLAYBOOK;
}

function stepById(playbook: Playbook, stepId: string): PlaybookStep | undefined {
  return playbook.steps.find((step) => step.id === stepId);
}

function nextStep(playbook: Playbook, step: PlaybookStep): PlaybookStep | undefined {
  const index = playbook.steps.findIndex((candidate) => candidate.id === step.id);
  const nextId = step.next ?? playbook.steps[index + 1]?.id;
  return nextId ? stepById(playbook, nextId) : undefined;
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
  const subject = effectivePhase(session.automation_phase, session.current_step_id) === 'addressing_review'
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

export function createBoardAgentOrchestrator(deps: BoardAgentOrchestratorDeps): AgentManagerCallbacks & {
  resumePlaybook: (sessionId: string, options?: { note?: string; action?: 'resume' | 'proceed' | 'one_more_pass' }) => Promise<boolean>;
} {
  const outputs = new Map<string, Record<string, string[]>>();
  interface RunGroup {
    expected: number;
    attempt: number;
    succeeded: Set<number>;
    failed: Set<number>;
    findings: ReviewFinding[];
    output: Map<number, string>;
  }
  // Cache only. Persisted review rows are authoritative and reconstruct this
  // aggregation after a main-process restart.
  const runGroups = new Map<string, RunGroup>();

  const groupKey = (sessionId: string, stepId: string) => `${sessionId}:${stepId}`;
  const phaseForPlaybookStep = (step: PlaybookStep) => step.session === 'subagent'
    ? 'reviewing' as const
    : 'addressing_review' as const;
  const attemptForStep = (session: DevSession, step: PlaybookStep) => parsePassCounts(session.step_pass_counts)[step.id] ?? 0;
  const reviewSessionIds = (session: DevSession, step: PlaybookStep, expected: number) => {
    const attempt = attemptForStep(session, step);
    return Array.from({ length: expected }, (_, runIndex) =>
      toPlaybookSubagentSessionId(session.id, step.id, attempt, runIndex));
  };

  function reconstructRunGroup(session: DevSession, step: PlaybookStep, expected: number): RunGroup {
    const group: RunGroup = {
      expected,
      attempt: attemptForStep(session, step),
      succeeded: new Set<number>(),
      failed: new Set<number>(),
      findings: [],
      output: new Map<number, string>(),
    };
    const persisted = deps.agentReviews.getByReviewSessionIds(reviewSessionIds(session, step, expected));
    for (const run of persisted) {
      if (run.run_index == null || run.run_index < 0 || run.run_index >= expected) continue;
      if (run.status === 'complete') {
        group.succeeded.add(run.run_index);
        group.findings.push(...run.findings);
        if (run.raw_output) group.output.set(run.run_index, run.raw_output);
      } else if (run.status === 'failed') {
        group.failed.add(run.run_index);
      }
      // A persisted `running` row belongs to a process that no longer owns a
      // runtime after restart. Dispatch relaunches that same concrete run id.
    }
    return group;
  }
  function outputsFor(session: DevSession): Record<string, string[]> {
    const cached = outputs.get(session.id);
    if (cached) return cached;
    if (session.step_outputs) {
      try {
        const parsed = JSON.parse(session.step_outputs) as Record<string, string[]>;
        outputs.set(session.id, parsed);
        return parsed;
      } catch { /* start with an empty output channel */ }
    }
    const empty: Record<string, string[]> = {};
    outputs.set(session.id, empty);
    return empty;
  }

  function persistOutputs(session: DevSession, value: Record<string, string[]>): void {
    outputs.set(session.id, value);
    deps.getDevSessionService()?.savePlaybookOutputs?.(session.id, value);
  }

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
    if (reviewService) {
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
    const plan = resolvePlaybookPlan(playbook, providers);
    const resolved = plan.steps.find((entry) => entry.stepId === step.id);
    if (!resolved || resolved.runs.some((run) => !run)) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: `provider-unavailable:${step.id}` });
      return;
    }
    const sessionOutputs = outputsFor(session);

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
        persistOutputs(session, sessionOutputs);
      }
      return;
    }

    const group = reconstructRunGroup(session, step, resolved.runs.length);
    runGroups.set(groupKey(session.id, step.id), group);
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
      });
      return launchPlaybookSubagent({
        implementationSessionId: session.id,
        stepId: step.id,
        runIndex,
        attempt: group.attempt,
        agent: agent!,
        worktreePath: session.worktree_path,
        baseBranch: session.base_branch,
        taskContext: session.initial_instructions,
        directive,
        systemPrompt: deps.getPromptContent(step.systemPromptKey!),
        verdict: step.verdict === 'findings',
        writes: step.writes === true,
        projectId: session.project_id,
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
  ): Promise<void> {
    const advance = advancePlaybook(playbook, step.id, findings.length > 0, parsePassCounts(session.step_pass_counts));
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
    runGroups.delete(groupKey(session.id, step.id));
    if (group.succeeded.size === 0) {
      deps.phaseMachine.transition(session.id, { type: 'automationFailed', reason: `all-runs-failed:${step.id}` });
      return;
    }
    const sessionOutputs = outputsFor(session);
    sessionOutputs[step.id] = [...group.output.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
    persistOutputs(session, sessionOutputs);
    if (step.writes) {
      const service = deps.getDevSessionService();
      if (service) {
        const capture = await captureWorkOnBranch(service, deps.phaseMachine, session);
        if (capture !== 'captured') return;
      }
      // Persist before advancing the cursor so a restart between the writing
      // subagent and the next main turn cannot lose this harness-owned notice.
      sessionOutputs[WORKTREE_MODIFIED_NOTICE_KEY] = [step.id];
      persistOutputs(session, sessionOutputs);
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
    const key = groupKey(params.session.id, params.step.id);
    const group = runGroups.get(key)
      ?? reconstructRunGroup(params.session, params.step, params.step.runs?.length ?? 1);
    runGroups.set(key, group);
    if (params.failed) group.failed.add(params.runIndex);
    else {
      if (!group.succeeded.has(params.runIndex)) {
        group.succeeded.add(params.runIndex);
        group.findings.push(...(params.findings ?? []));
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
      if (options.action === 'proceed' && session.paused_reason === 'max_passes') {
        await advanceAfterStep(session, playbook, step, []);
        return true;
      }
      if (options.action === 'one_more_pass' && session.paused_reason === 'max_passes' && step.onFindings) {
        const target = stepById(playbook, step.onFindings.goto);
        if (!target) return false;
        const counts = parsePassCounts(session.step_pass_counts);
        counts[step.id] = (counts[step.id] ?? 0) + 1;
        deps.phaseMachine.transition(sessionId, {
          type: 'stepCompleted', stepId: step.id, nextStepId: target.id,
          nextPhase: phaseForPlaybookStep(target), stepPassCounts: counts,
        });
        const surviving = outputsFor(session)[step.id]?.join('\n\n');
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

    onSessionComplete: async ({ devSessionId, implementationSessionId, stepId, runIndex, role, findings, reviewError, finalText }) => {
      const devSessionService = deps.getDevSessionService();
      if (!devSessionService) {
        return;
      }

      const implSessionId = implementationSessionId ?? (role === 'review' ? toImplSessionId(devSessionId) : devSessionId);
      const session = devSessionService.get(implSessionId);
      if (!session) {
        return;
      }

      if (session.playbook_snapshot) {
        const playbook = playbookForSession(session);
        if (role === 'implement') {
          const capture = await captureWorkOnBranch(devSessionService, deps.phaseMachine, session);
          if (capture !== 'captured') return;
          // A null cursor is the interpreter's terminal halt point. Free-form
          // follow-up is allowed there, but it is an ad-hoc turn — never infer
          // the first step and restart the completed playbook.
          if (!session.current_step_id) {
            await finishAtTerminal(session);
            return;
          }
          const completed = stepById(playbook, session.current_step_id) ?? playbook.steps[0];
          if (finalText) {
            const sessionOutputs = outputsFor(session);
            sessionOutputs[completed.id] = [finalText];
            persistOutputs(session, sessionOutputs);
          }
          await advanceAfterStep(session, playbook, completed, []);
          return;
        }
        const completed = stepById(playbook, stepId ?? session.current_step_id ?? 'review');
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

        const effectiveAutomationPhase = effectivePhase(session.automation_phase, session.current_step_id);
        const playbook = playbookForSession(session);
        const completedStep = effectiveAutomationPhase === 'addressing_review'
          ? stepById(playbook, 'address') ?? playbook.steps[playbook.steps.length - 1]
          : stepById(playbook, session.current_step_id ?? 'implement') ?? playbook.steps[0];

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

        const next = nextStep(playbook, completedStep);
        if (!next) {
          moveSessionPlanItemToReview(implSessionId);
          return;
        }

        if (next.session !== 'subagent' || next.verdict !== 'findings') {
          console.warn(`${LOG_PREFIX} Unsupported next playbook step ${next.id}; moving to review`);
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
      const playbook = playbookForSession(session);
      const reviewStep = stepById(playbook, session.current_step_id ?? 'review') ?? stepById(playbook, 'review');
      if (reviewFindings.length === 0 || !reviewStep?.onFindings) {
        moveSessionPlanItemToReview(implSessionId);
        return;
      }

      const nextPhase = deps.phaseMachine.transition(implSessionId, {
        type: 'opposingReviewFindingsReady',
        stepId: reviewStep.id,
      });
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
        renderPlaybookDirective(
          stepById(playbook, reviewStep.onFindings.goto) ?? {
            id: 'address',
            session: 'main',
            directive: { kind: 'prompt', promptKey: 'agents.review_assessment' },
          },
          {},
          {
            nativeSkills: false,
            taskContext: '',
            promptContent: deps.getPromptContent,
            findings: formatFindings(reviewFindings),
          },
        ),
      );

      if (!followUpResult.ok) {
        console.error(`${LOG_PREFIX} Failed to send auto-review follow-up for ${implSessionId}:`, followUpResult.error);
        deps.phaseMachine.transition(implSessionId, { type: 'automationFailed', reason: 'follow-up-send-failed' });
      }
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
