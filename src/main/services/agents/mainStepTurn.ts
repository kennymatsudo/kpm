/**
 * One turn of a playbook step that runs on the board session's own agent.
 *
 * The turn is more than its prompt. It has to re-enter the run at that step's
 * role prompt and live phase whether it continues the agent that is already
 * loaded or has to start a fresh one — and the fresh one is routine, not
 * exceptional: the session registry evicts a session 30 minutes after its last
 * turn, which a two-axis review easily outlasts. A restart that forgets its
 * step runs an address turn under the implementation role prompt and leaves a
 * crash on that turn unguarded at `idle`, where it never reaches the board as
 * needing attention.
 */

import type { BoardProvider, PlaybookStep } from '../../../shared/playbooks';
import { BOARD_AGENT_WRITE_POLICY, renderPlaybookDirective } from '../../../shared/playbookRuntime';
import type {
  AgentEffortLevel,
  DevSession,
  DevSessionAttentionReason,
  DevSessionAutomationPhase,
  RepoEnvironmentMode,
} from '../../../shared/types';
import { success, type AsyncResult, type ServiceResult } from '../result';
import { phaseForPlaybookStep } from './sessionPlaybook';

export type MainStepOutcome =
  | { status: 'started' }
  /** The step can never run as configured; `reason` is what the board should show. */
  | { status: 'blocked'; reason: DevSessionAttentionReason; message: string };

/** Where a turn that had to start a new agent re-enters the run. */
export interface TurnReentry {
  systemPromptKey?: string;
  phase?: DevSessionAutomationPhase;
}

export interface MainStepTurnDeps {
  getPromptContent: (key: string) => string;
  getSkillBody?: (name: string) => ServiceResult<string>;
  sendAgentFollowUp: (
    sessionId: string,
    text: string,
    options: { restartAs: TurnReentry },
  ) => AsyncResult<{ restarted: boolean }>;
  startAgentSession: (
    sessionId: string,
    options: {
      prompt: string;
      model?: string;
      effort?: AgentEffortLevel;
      environmentMode?: RepoEnvironmentMode;
      systemPromptKey?: string;
    },
  ) => AsyncResult<{ session: DevSession }>;
}

export interface MainStepTurnRequest {
  session: DevSession;
  step: PlaybookStep;
  /** The provider the main session runs on; decides whether a skill directive is invoked natively. */
  provider: Pick<BoardProvider, 'capabilities'>;
  outputs?: Record<string, string[]>;
  /** Review findings, already rendered for the directive's `{{findings}}` slot. */
  findings?: string;
  resumeNote?: string;
  /** Harness-owned lifecycle context for this turn, distinct from the step's directive. */
  harnessNote?: string;
  /** Set only when this turn begins the run; omitted for every step that continues it. */
  launch?: {
    taskContext: string;
    model?: string;
    effort?: AgentEffortLevel;
    environmentMode?: RepoEnvironmentMode;
  };
}

export async function runMainStep(
  deps: MainStepTurnDeps,
  request: MainStepTurnRequest,
): AsyncResult<MainStepOutcome> {
  const { session, step, provider, launch } = request;

  const skill = step.directive.kind === 'skill' && !provider.capabilities.nativeSkills
    ? deps.getSkillBody?.(step.directive.name)
    : null;
  if (skill && !skill.ok) {
    return success({ status: 'blocked', reason: `skill-unavailable:${step.id}`, message: skill.error });
  }

  // A continuing turn already carries the policy on every follow-up; only the
  // turn that opens the run has to state it.
  const harnessNote = [request.harnessNote, launch ? BOARD_AGENT_WRITE_POLICY : null]
    .filter(Boolean)
    .join('\n\n');

  const prompt = renderPlaybookDirective(step, request.outputs ?? {}, {
    nativeSkills: provider.capabilities.nativeSkills,
    taskContext: launch?.taskContext ?? '',
    promptContent: deps.getPromptContent,
    skillBody: skill?.ok ? skill.data : null,
    findings: request.findings,
    resumeNote: request.resumeNote,
    harnessNote,
  });

  if (launch) {
    const started = await deps.startAgentSession(session.id, {
      prompt,
      model: launch.model,
      effort: launch.effort,
      environmentMode: launch.environmentMode,
      systemPromptKey: step.systemPromptKey,
    });
    return started.ok ? success({ status: 'started' }) : started;
  }

  const sent = await deps.sendAgentFollowUp(
    session.id,
    prompt || `Continue with playbook step: ${step.id}`,
    { restartAs: { systemPromptKey: step.systemPromptKey, phase: phaseForPlaybookStep(step) } },
  );
  return sent.ok ? success({ status: 'started' }) : sent;
}
