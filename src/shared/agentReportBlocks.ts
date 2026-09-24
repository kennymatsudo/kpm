/**
 * Machine-readable blocks a board agent appends to its final report: its
 * reply to each numbered review finding, and its status for each acceptance
 * criterion. KPM asks for them in a fixed fenced format (see `mainStepTurn.ts`)
 * so the outcome of a step survives as data instead of prose, whatever the
 * playbook's own prompts say.
 *
 * Both are the agent's claims. The UI shows them as such.
 */

export const FINDING_REPLIES_FENCE = 'finding-replies';
export const CRITERIA_STATUS_FENCE = 'criteria-status';

/** `step_outputs` keys with this prefix are KPM bookkeeping, never a step's own output. */
export const HARNESS_OUTPUT_PREFIX = '__harness_';
/** `step_outputs` key holding the latest `CriterionStatus[]` a main turn reported, as one JSON string. */
export const CRITERIA_STATUS_OUTPUT_KEY = `${HARNESS_OUTPUT_PREFIX}criteria_status`;

export type FindingDisposition = 'fixed' | 'declined';

export interface FindingReply {
  /** 1-based number of the finding as it was listed to the agent. */
  finding: number;
  disposition: FindingDisposition;
  reason: string | null;
}

export type CriterionState = 'met' | 'partial' | 'unmet' | 'unverified';

export interface CriterionStatus {
  /** 1-based position in the task's Acceptance Criteria list. */
  criterion: number;
  state: CriterionState;
  note: string | null;
}

const CRITERION_STATES: readonly CriterionState[] = ['met', 'partial', 'unmet', 'unverified'];

function fencePattern(fence: string): RegExp {
  return new RegExp('```' + fence + '[^\\n]*\\n([\\s\\S]*?)```', 'g');
}

const ANY_REPORT_BLOCK = new RegExp(
  '\\n?```(?:' + FINDING_REPLIES_FENCE + '|' + CRITERIA_STATUS_FENCE + ')[^\\n]*\\n[\\s\\S]*?```\\n?',
  'g',
);

/** The last block with this fence tag, parsed as JSON; the agent may restate it, and the final one wins. */
function lastBlock(text: string, fence: string): unknown {
  const matches = [...text.matchAll(fencePattern(fence))];
  const body = matches.at(-1)?.[1];
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function entries(parsed: unknown, key: string): Record<string, unknown>[] {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)[key])
      ? (parsed as Record<string, unknown[]>)[key]
      : [];
  return list.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Null when the report has no parseable `finding-replies` block. */
export function parseFindingReplies(text: string | null | undefined): FindingReply[] | null {
  if (!text) return null;
  const parsed = lastBlock(text, FINDING_REPLIES_FENCE);
  if (parsed === null) return null;
  return entries(parsed, 'replies').flatMap((entry) => {
    const finding = entry.finding;
    const disposition = entry.status;
    if (!Number.isInteger(finding) || (finding as number) < 1) return [];
    if (disposition !== 'fixed' && disposition !== 'declined') return [];
    return [{ finding: finding as number, disposition, reason: optionalText(entry.reason) }];
  });
}

/** Null when the report has no parseable `criteria-status` block. */
export function parseCriteriaStatus(text: string | null | undefined): CriterionStatus[] | null {
  if (!text) return null;
  const parsed = lastBlock(text, CRITERIA_STATUS_FENCE);
  if (parsed === null) return null;
  return entries(parsed, 'criteria').flatMap((entry) => {
    const criterion = entry.criterion;
    const state = entry.status;
    if (!Number.isInteger(criterion) || (criterion as number) < 1) return [];
    if (!CRITERION_STATES.includes(state as CriterionState)) return [];
    return [{ criterion: criterion as number, state: state as CriterionState, note: optionalText(entry.note) }];
  });
}

/** The report as a person should read it: the machine-readable blocks removed. */
export function stripAgentReportBlocks(text: string): string {
  return text.replace(ANY_REPORT_BLOCK, '\n').trim();
}
