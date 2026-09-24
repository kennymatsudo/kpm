/**
 * The durable record of a board run, one entry per step that has run: what
 * each step concluded, rather than the moment-to-moment activity log.
 *
 * Built only from saved data (the playbook snapshot, step outputs, review runs
 * and their findings, step costs) so it reads the same after a restart or once
 * the provider session has been evicted, and for any playbook shape: a card
 * comes from a step's structure (`verdict: 'findings'`, main or subagent),
 * never from its name.
 */

import type { AgentType, PersistedAgentReview, ReviewAxis, ReviewFinding } from '../../../shared/agent-types';
import {
  CRITERIA_STATUS_OUTPUT_KEY,
  stripAgentReportBlocks,
  type CriterionState,
  type CriterionStatus,
  type FindingDisposition,
} from '../../../shared/agentReportBlocks';
import {
  AD_HOC_REVIEW_STEP,
  PR_REVIEW_FOLLOWUP_STEP,
  formatPlaybookStepTitle,
  parsePlaybook,
  type PlaybookStep,
} from '../../../shared/playbooks';
import type { DevSessionAutomationPhase } from '../../../shared/types';

export interface OutlineFinding {
  id: string;
  severity: ReviewFinding['severity'];
  file: string | null;
  line: number | null;
  description: string;
  axis: ReviewAxis | null;
  disposition: FindingDisposition | null;
  reason: string | null;
}

export interface ReviewPassOutline {
  status: 'running' | 'complete' | 'failed';
  reviewers: AgentType[];
  error: string | null;
  findings: OutlineFinding[];
}

export type StepOutlineStatus = 'running' | 'done' | 'failed';

export interface StepOutline {
  stepId: string;
  title: string;
  status: StepOutlineStatus;
  provider: string | null;
  /** Micro-USD, as the usage service reports it. */
  cost: number | null;
  /** The step's final report with KPM's machine-readable blocks removed. The agent's claim, not a measurement. */
  report: string | null;
  /** Oldest first. Empty unless the step returns findings. */
  passes: ReviewPassOutline[];
  /** A few words on how the step ended, shared by the card header and the stepper. */
  outcome: string | null;
}

export interface CriterionOutline {
  text: string;
  state: CriterionState | null;
  note: string | null;
}

export interface RunOutline {
  steps: StepOutline[];
  /** Null until a main turn has reported criteria status for a task that has criteria. */
  criteria: CriterionOutline[] | null;
}

export interface RunOutlineInput {
  playbookSnapshot: string | null | undefined;
  currentStepId: string | null | undefined;
  automationPhase: DevSessionAutomationPhase | null | undefined;
  stepOutputs: string | null | undefined;
  stepCosts: Record<string, number> | undefined;
  reviews: readonly PersistedAgentReview[] | undefined;
  implementationAgent: AgentType;
  acceptanceCriteria: readonly string[] | null | undefined;
}

const RUN_ID_SUFFIX = /-(\d+)-(\d+)$/;

function parseSteps(snapshot: string | null | undefined): PlaybookStep[] {
  if (!snapshot) return [];
  try {
    return parsePlaybook(JSON.parse(snapshot)).steps;
  } catch {
    return [];
  }
}

function parseOutputs(raw: string | null | undefined): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string[]> : {};
  } catch {
    return {};
  }
}

function isRunning(step: PlaybookStep, input: RunOutlineInput): boolean {
  if (input.currentStepId !== step.id) return false;
  return step.session === 'subagent'
    ? input.automationPhase === 'reviewing'
    : input.automationPhase === 'addressing_review';
}

/**
 * Group a step's review runs into passes. A playbook run id ends in
 * `-<attempt>-<runIndex>`, so the runs of one fan-out share an attempt; any
 * other id (the ad-hoc fallback review) is its own pass.
 */
function toPasses(step: PlaybookStep, runs: PersistedAgentReview[]): ReviewPassOutline[] {
  const byAttempt = new Map<string, PersistedAgentReview[]>();
  for (const run of runs) {
    const attempt = RUN_ID_SUFFIX.exec(run.review_session_id)?.[1] ?? `run:${run.id}`;
    byAttempt.set(attempt, [...(byAttempt.get(attempt) ?? []), run]);
  }
  return [...byAttempt.values()].map((passRuns) => {
    const ordered = [...passRuns].sort((a, b) => (a.run_index ?? 0) - (b.run_index ?? 0));
    const status = ordered.some((run) => run.status === 'running')
      ? 'running'
      : ordered.some((run) => run.status === 'failed') ? 'failed' : 'complete';
    return {
      status,
      reviewers: [...new Set(ordered.map((run) => run.reviewer_agent))],
      error: ordered.find((run) => run.error)?.error ?? null,
      findings: ordered.flatMap((run) => run.findings.map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        file: finding.file ?? null,
        line: finding.line ?? null,
        description: finding.description,
        axis: finding.axis ?? step.runOverrides?.[run.run_index ?? 0]?.axis ?? null,
        disposition: finding.disposition,
        reason: finding.disposition_reason,
      }))),
    };
  });
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** How a review pass ended, in the words the card header and stepper share. */
export function summarizePass(pass: ReviewPassOutline): string | null {
  if (pass.status === 'running') return null;
  if (pass.status === 'failed') return 'failed';
  if (pass.findings.length === 0) return 'no findings';
  const replied = pass.findings.filter((finding) => finding.disposition);
  if (replied.length > 0) {
    const fixed = replied.filter((finding) => finding.disposition === 'fixed').length;
    const declined = replied.length - fixed;
    const open = pass.findings.length - replied.length;
    return [
      fixed ? `${fixed} fixed` : null,
      declined ? `${declined} declined` : null,
      open ? `${open} no reply` : null,
    ].filter(Boolean).join(' · ');
  }
  const blocking = pass.findings.filter((finding) => finding.severity !== 'suggestion').length;
  const suggestions = pass.findings.length - blocking;
  return [
    blocking ? `${blocking} to fix` : null,
    suggestions ? plural(suggestions, 'suggestion') : null,
  ].filter(Boolean).join(' · ');
}

function parseCriteriaStatus(outputs: Record<string, string[]>): CriterionStatus[] | null {
  const raw = outputs[CRITERIA_STATUS_OUTPUT_KEY]?.[0];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as CriterionStatus[] : null;
  } catch {
    return null;
  }
}

export function deriveRunOutline(input: RunOutlineInput): RunOutline {
  const outputs = parseOutputs(input.stepOutputs);
  const costs = input.stepCosts ?? {};
  const reviews = input.reviews ?? [];
  const playbookSteps = parseSteps(input.playbookSnapshot);

  // Harness turns run outside the playbook's own list; they appear after it
  // once they have left a trace.
  const known = new Set(playbookSteps.map((step) => step.id));
  const harnessSteps = [AD_HOC_REVIEW_STEP, PR_REVIEW_FOLLOWUP_STEP].filter((step) => !known.has(step.id));
  const runsByStep = new Map<string, PersistedAgentReview[]>();
  for (const run of reviews) {
    const stepId = run.step_id ?? AD_HOC_REVIEW_STEP.id;
    runsByStep.set(stepId, [...(runsByStep.get(stepId) ?? []), run]);
  }

  const steps = [...playbookSteps, ...harnessSteps].flatMap((step): StepOutline[] => {
    const running = isRunning(step, input);
    const runs = runsByStep.get(step.id) ?? [];
    const output = outputs[step.id];
    const cost = costs[step.id] ?? null;
    const returnsFindings = step.verdict === 'findings';
    if (!running && !runs.length && !output?.length && cost == null) return [];

    const passes = returnsFindings ? toPasses(step, runs) : [];
    const latestPass = passes.at(-1);
    const report = !returnsFindings && output?.length
      ? stripAgentReportBlocks(output.join('\n\n')) || null
      : null;
    const provider = step.session === 'main'
      ? input.implementationAgent
      : latestPass?.reviewers.join(', ') || null;

    return [{
      stepId: step.id,
      title: formatPlaybookStepTitle(step.id),
      status: running ? 'running' : latestPass?.status === 'failed' ? 'failed' : 'done',
      provider,
      cost,
      report,
      passes,
      outcome: latestPass ? summarizePass(latestPass) : null,
    }];
  });

  const statuses = parseCriteriaStatus(outputs);
  const criteriaList = input.acceptanceCriteria ?? [];
  const criteria = statuses && criteriaList.length > 0
    ? criteriaList.map((text, index) => {
      const status = statuses.find((entry) => entry.criterion === index + 1);
      return { text, state: status?.state ?? null, note: status?.note ?? null };
    })
    : null;

  return { steps, criteria };
}
