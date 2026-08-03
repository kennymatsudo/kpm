import {
  AD_HOC_REVIEW_STEP,
  BUILT_IN_PLAYBOOKS,
  PR_REVIEW_FOLLOWUP_STEP,
  parsePlaybook,
  type Playbook,
  type PlaybookStep,
} from '../../../shared/playbooks';
import type { DevSession } from '../../../shared/types';

const LOG_PREFIX = '[sessionPlaybook]';

export function playbookForSession(session: DevSession): Playbook {
  if (session.playbook_snapshot) {
    try {
      return parsePlaybook(JSON.parse(session.playbook_snapshot));
    } catch (error) {
      console.warn(`${LOG_PREFIX} Invalid playbook snapshot for ${session.id}; using built-in default`, error);
    }
  }
  // Compatibility boundary only: rows created before migration 103 have no
  // immutable snapshot. Newly started board sessions are snapshotted and run
  // through the interpreter; do not expand this fallback to new runs.
  return session.review_policy === 'skip' ? BUILT_IN_PLAYBOOKS.implementOnly : BUILT_IN_PLAYBOOKS.implementOpposingReview;
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
