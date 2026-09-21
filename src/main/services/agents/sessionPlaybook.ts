import {
  AD_HOC_REVIEW_STEP,
  DEFAULT_PLAYBOOK,
  PR_REVIEW_FOLLOWUP_STEP,
  parsePlaybook,
  type Playbook,
  type PlaybookStep,
} from '../../../shared/playbooks';
import type { DevSession, DevSessionAutomationPhase } from '../../../shared/types';

const LOG_PREFIX = '[sessionPlaybook]';

/**
 * Every row carries a snapshot: migration 103 added the column and 124
 * backfilled the older rows, so the default here answers only a snapshot that
 * fails to parse.
 */
export function playbookForSession(session: DevSession): Playbook {
  return playbookSnapshotOf(session) ?? DEFAULT_PLAYBOOK;
}

/**
 * The session's own playbook, or null when it carries none that parses — for
 * the callers that must tell "this session was never snapshotted" apart from
 * "this session runs the default".
 */
export function playbookSnapshotOf(session: DevSession): Playbook | null {
  if (!session.playbook_snapshot) return null;
  try {
    return parsePlaybook(JSON.parse(session.playbook_snapshot));
  } catch (error) {
    console.warn(`${LOG_PREFIX} Invalid playbook snapshot for ${session.id}`, error);
    return null;
  }
}

/**
 * The live phase a step runs under. A main step occupies the implementation
 * agent; a subagent step runs beside it.
 */
export function phaseForPlaybookStep(step: PlaybookStep): DevSessionAutomationPhase {
  return step.session === 'subagent' ? 'reviewing' : 'addressing_review';
}

/**
 * Look up a step id the caller already holds — a subagent run reporting back,
 * say. Not for a session's cursor: a cursor can name a harness step that no
 * playbook lists, and only `readSessionRun` resolves those.
 */
export function stepById(playbook: Playbook, stepId: string): PlaybookStep | undefined {
  return playbook.steps.find((step) => step.id === stepId);
}

export type HarnessStepKind = 'ad-hoc-review' | 'pr-review-followup';

export function resolveHarnessStep(playbook: Playbook, kind: HarnessStepKind): PlaybookStep {
  if (kind === 'pr-review-followup') {
    return PR_REVIEW_FOLLOWUP_STEP;
  }
  return playbook.steps.find((step) => step.session === 'subagent' && step.verdict === 'findings')
    ?? AD_HOC_REVIEW_STEP;
}

/**
 * Resolve a step id that may name an injected harness step as well as a
 * declared one. Anything reading a persisted step id wants this; `stepById`
 * is only for ids that came out of the playbook in the first place.
 */
export function resolveRunStep(playbook: Playbook, stepId: string | null | undefined): PlaybookStep | undefined {
  if (!stepId) return undefined;
  const step = stepById(playbook, stepId);
  if (step) return step;
  if (stepId === AD_HOC_REVIEW_STEP.id) return AD_HOC_REVIEW_STEP;
  if (stepId === PR_REVIEW_FOLLOWUP_STEP.id) return PR_REVIEW_FOLLOWUP_STEP;
  return undefined;
}

/**
 * Where a step sits in the run. `harness` is one of the injected steps no
 * playbook declares (`AD_HOC_REVIEW_STEP`, `PR_REVIEW_FOLLOWUP_STEP`).
 */
export type SessionCursorKind = 'main' | 'subagent' | 'harness';

export interface SessionCursor {
  step: PlaybookStep;
  kind: SessionCursorKind;
  /**
   * The step's job is to act on review findings — it is some step's
   * `onFindings.goto` target, or the PR-review follow-up. Asked structurally
   * rather than by step id, so a custom playbook that calls its address step
   * anything else still answers correctly.
   */
  addressesFindings: boolean;
}

export interface SessionRun {
  playbook: Playbook;
  /** Null when the session has no cursor, or names a step nothing can resolve. */
  cursor: SessionCursor | null;
  /** The interpreter owns this session: it has a snapshot and a live cursor. */
  isLive: boolean;
  /** `Play` should resume the cursor rather than start a fresh run. */
  isResumable: boolean;
}

function cursorKind(playbook: Playbook, step: PlaybookStep): SessionCursorKind {
  if (!playbook.steps.some((candidate) => candidate.id === step.id)) return 'harness';
  return step.session === 'subagent' ? 'subagent' : 'main';
}

function addressesFindings(playbook: Playbook, step: PlaybookStep): boolean {
  if (step.id === PR_REVIEW_FOLLOWUP_STEP.id) return true;
  return playbook.steps.some((candidate) => candidate.onFindings?.goto === step.id);
}

/**
 * Everything a caller needs to know about where a session is in its playbook.
 * The one reader of `current_step_id`: resolving a cursor is not a choice
 * callers should be making, because the two ways to do it disagree about
 * harness steps and picking the narrow one strands the session.
 */
export function readSessionRun(session: DevSession): SessionRun {
  const playbook = playbookForSession(session);
  const step = resolveRunStep(playbook, session.current_step_id);
  const cursor: SessionCursor | null = step
    ? { step, kind: cursorKind(playbook, step), addressesFindings: addressesFindings(playbook, step) }
    : null;
  const isLive = Boolean(session.playbook_snapshot && session.current_step_id);

  return {
    playbook,
    cursor,
    isLive,
    isResumable: isLive
      && (session.automation_phase === 'paused' || session.automation_phase === 'needs_attention'),
  };
}
