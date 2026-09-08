export interface ReviewActionableCounts {
  needsInput: number;
  failed: number;
  stale: number;
  errored: number;
}

/** Semantic role, not a hue — each resolves through the theme's semantic tokens. */
export type CardIndicatorTone = 'danger' | 'warning' | 'info' | 'success';

/**
 * Solid states a user has to act on; ring states are ambient. The pair gives the
 * indicator a non-color cue, so the signal survives a colorblind reader and a
 * user-imported theme with a flat semantic palette.
 */
export type CardIndicatorForm = 'solid' | 'ring';

export interface CardIndicator {
  tone: CardIndicatorTone;
  form: CardIndicatorForm;
  label: string;
  tooltip: string;
}

export interface CardIndicatorInputs {
  isAttention: boolean;
  isStale: boolean;
  isActive: boolean;
  /** No agent phase of its own — the only state that may advertise a bare running count. */
  isIdle: boolean;
  hasAutomationFailure: boolean;
  automationFailureText: string | null;
  reviewActionable: { hasActionable: boolean; counts: ReviewActionableCounts } | null;
  isMergeBlocked: boolean;
  activeSessionCount: number;
  hasPhaseIndicator: boolean;
}

function buildReviewActionableTooltip(
  counts: ReviewActionableCounts,
  automationFailure: string | null,
): string {
  const parts: string[] = [];
  if (counts.needsInput > 0) parts.push(`${counts.needsInput} need your input`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.stale > 0) parts.push(`${counts.stale} stale`);
  if (counts.errored > 0) parts.push(`${counts.errored} errored`);
  const head = parts.length > 0
    ? `Review: ${parts.join(', ')}`
    : 'Review requires attention';
  return automationFailure
    ? `${head} · ${automationFailure}`
    : `${head} — open Review tab`;
}

export function buildReviewActionableLabel(counts: ReviewActionableCounts): string {
  const failures = counts.failed + counts.stale + counts.errored;
  if (failures > 0) {
    return `${failures} review ${failures === 1 ? 'task needs' : 'tasks need'} reassessment`;
  }
  if (counts.needsInput > 0) {
    return `${counts.needsInput} review ${counts.needsInput === 1 ? 'decision needs' : 'decisions need'} you`;
  }
  return 'Review requires a decision';
}

/**
 * Resolve the one indicator a card shows, highest urgency first. The card used to
 * stack up to three same-shaped dots that differed only by tooltip; a single
 * prioritized slot is what a scan down a column can actually decode.
 */
export function resolveCardIndicator(inputs: CardIndicatorInputs): CardIndicator | null {
  const {
    isAttention,
    isStale,
    isActive,
    isIdle,
    hasAutomationFailure,
    automationFailureText,
    reviewActionable,
    isMergeBlocked,
    activeSessionCount,
    hasPhaseIndicator,
  } = inputs;

  const failureText = automationFailureText ?? 'Automation failed';

  if ((hasAutomationFailure || reviewActionable?.hasActionable) && !isActive && !isAttention) {
    return {
      tone: 'danger',
      form: 'solid',
      label: reviewActionable?.hasActionable
        ? buildReviewActionableLabel(reviewActionable.counts)
        : failureText,
      tooltip: reviewActionable?.hasActionable
        ? buildReviewActionableTooltip(
            reviewActionable.counts,
            hasAutomationFailure ? failureText : null,
          )
        : failureText,
    };
  }

  if (isAttention) {
    return {
      tone: 'warning',
      form: 'solid',
      label: 'Agent needs your attention',
      tooltip: 'Agent needs your attention',
    };
  }

  if (isStale) {
    return {
      tone: 'warning',
      form: 'ring',
      label: 'Session state is stale',
      tooltip: 'Session state is stale — no activity for over five minutes',
    };
  }

  if (isMergeBlocked) {
    return {
      tone: 'info',
      form: 'solid',
      label: 'Merge blocked',
      tooltip: "Merge blocked — a dependency PR hasn't merged yet",
    };
  }

  if (isIdle && activeSessionCount > 0 && !hasPhaseIndicator) {
    const label = activeSessionCount === 1
      ? 'Agent running'
      : `${activeSessionCount} agents running`;
    return { tone: 'success', form: 'ring', label, tooltip: label };
  }

  return null;
}
