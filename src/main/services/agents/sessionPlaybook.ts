import {
  AD_HOC_REVIEW_STEP,
  DEFAULT_PLAYBOOK,
  PR_REVIEW_FOLLOWUP_STEP,
  parsePlaybook,
  type Playbook,
  type PlaybookStep,
} from '../../../shared/playbooks';
import type { DevSession } from '../../../shared/types';

const LOG_PREFIX = '[sessionPlaybook]';

/**
 * Every row carries a snapshot: migration 103 added the column and 124
 * backfilled the older rows, so the default here answers only a snapshot that
 * fails to parse.
 */
export function playbookForSession(session: DevSession): Playbook {
  if (session.playbook_snapshot) {
    try {
      return parsePlaybook(JSON.parse(session.playbook_snapshot));
    } catch (error) {
      console.warn(`${LOG_PREFIX} Invalid playbook snapshot for ${session.id}; using built-in default`, error);
    }
  }
  return DEFAULT_PLAYBOOK;
}

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

export function resolveCursorStep(playbook: Playbook, cursorId: string | null | undefined): PlaybookStep | undefined {
  if (!cursorId) return undefined;
  const step = stepById(playbook, cursorId);
  if (step) return step;
  if (cursorId === AD_HOC_REVIEW_STEP.id) return AD_HOC_REVIEW_STEP;
  if (cursorId === PR_REVIEW_FOLLOWUP_STEP.id) return PR_REVIEW_FOLLOWUP_STEP;
  return undefined;
}
