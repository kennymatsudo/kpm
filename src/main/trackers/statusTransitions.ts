/**
 * Status transition mapping utilities for Jira sync.
 *
 * KPM uses a platform-agnostic StatusCategory model:
 * - not_started: Work hasn't begun
 * - in_progress: Work is actively being done
 * - in_review: Work is awaiting review
 * - done: Work is complete
 * - blocked: Work is blocked/on hold
 * - canceled: Work was canceled/won't be done
 *
 * Jira uses workflow transitions with status categories:
 * - 'new' (To Do) - corresponds to not_started
 * - 'indeterminate' (In Progress) - corresponds to in_progress/blocked
 * - 'done' (Done) - corresponds to done/canceled
 */

import type { StatusCategory, TrackerTransition, StatusMapping, TrackerType } from '../../shared/types';

/**
 * Map a Linear WorkflowState `type` to a KPM StatusCategory. Linear's six state types
 * correspond much more directly to KPM's model than Jira's three-bucket categories.
 */
const LINEAR_STATE_TYPE_TO_CATEGORY: Record<string, StatusCategory> = {
  triage: 'not_started',
  backlog: 'not_started',
  unstarted: 'not_started',
  started: 'in_progress',
  completed: 'done',
  canceled: 'canceled',
};

export function mapLinearStateTypeToCategory(stateType: string | null | undefined): StatusCategory | null {
  if (!stateType) return null;
  return LINEAR_STATE_TYPE_TO_CATEGORY[stateType.toLowerCase()] ?? null;
}

/**
 * Map KPM StatusCategory to Jira status category keys.
 * Note: Jira only has 3 categories, so we map blocked → indeterminate and canceled → done.
 */
const CATEGORY_TO_JIRA_STATUS_CATEGORY: Record<StatusCategory, string[]> = {
  not_started: ['new', 'undefined'],  // Jira's "To Do" category
  in_progress: ['indeterminate'],      // Jira's "In Progress" category
  in_review: ['indeterminate'],        // Review is a form of "In Progress" in Jira
  done: ['done'],                       // Jira's "Done" category
  blocked: ['indeterminate'],           // No direct Jira equivalent, maps to "In Progress"
  canceled: ['done'],                   // Usually mapped to Done in Jira workflows
};

/**
 * Keywords to match in transition names when category-based matching fails.
 * Used as fallback for non-standard Jira workflows.
 */
const STATUS_KEYWORDS: Record<StatusCategory, string[]> = {
  not_started: ['backlog', 'to do', 'todo', 'open', 'new', 'reopen'],
  in_progress: ['progress', 'start', 'testing', 'development'],
  in_review: ['review', 'code review', 'peer review'],
  done: ['done', 'complete', 'resolved', 'closed', 'finish'],
  blocked: ['block', 'hold', 'wait', 'impediment', 'stuck'],
  canceled: ['cancel', 'won\'t', 'wont', 'duplicate', 'invalid', 'reject'],
};

/**
 * Find the best matching Jira transition for a target KPM status category.
 *
 * Strategy:
 * 1. First, try to match by Jira's status category (most reliable)
 * 2. If no match, fall back to keyword matching in transition names
 * 3. Return null if no suitable transition exists
 *
 * @param targetCategory - The KPM status category to transition to
 * @param availableTransitions - Available transitions from Jira (from current state)
 * @returns The best matching transition, or null if none found
 */
export function findBestTransition(
  targetCategory: StatusCategory,
  availableTransitions: TrackerTransition[]
): TrackerTransition | null {
  if (availableTransitions.length === 0) {
    return null;
  }

  const targetJiraCategories = CATEGORY_TO_JIRA_STATUS_CATEGORY[targetCategory];
  const keywords = STATUS_KEYWORDS[targetCategory];

  const matchesKeyword = (t: TrackerTransition): boolean => {
    const lowerName = t.name.toLowerCase();
    const lowerToName = t.to.name.toLowerCase();
    return keywords.some((k) => lowerName.includes(k) || lowerToName.includes(k));
  };

  // Strategy 1: Match by tracker status category (most reliable for Jira).
  const categoryMatches = availableTransitions.filter((t) =>
    targetJiraCategories.includes(t.to.statusCategory.key.toLowerCase())
  );

  if (categoryMatches.length > 0) {
    // Linear collapses every "started"-type state into `indeterminate`, so multiple
    // category matches are common. Prefer transitions whose target name contains
    // a category-relevant keyword before falling back to the shortest name —
    // otherwise "Move to Blocked" wins over "Move to In Progress" purely on length.
    const keywordPreferred = categoryMatches.filter(matchesKeyword);
    const pool = keywordPreferred.length > 0 ? keywordPreferred : categoryMatches;
    return pool.sort((a, b) => a.name.length - b.name.length)[0];
  }

  // Strategy 2: No category matches — fall back to keyword matching across all transitions.
  const keywordMatches = availableTransitions.filter(matchesKeyword);

  if (keywordMatches.length > 0) {
    return keywordMatches.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}

/**
 * Generate a warning message when no valid transition exists.
 *
 * @param currentStatus - Current Jira status name
 * @param targetCategory - The KPM status category user wants
 * @param availableTransitions - What transitions are available
 * @returns Human-readable warning message
 */
export function generateTransitionWarning(
  currentStatus: string,
  targetCategory: StatusCategory,
  availableTransitions: TrackerTransition[],
  statusMapping?: StatusMapping | null
): string {
  const categoryLabels: Record<StatusCategory, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
    blocked: 'Blocked',
    canceled: 'Canceled',
  };

  const targetLabel = categoryLabels[targetCategory];

  if (availableTransitions.length === 0) {
    return `Cannot transition from "${currentStatus}" — no destination states available`;
  }

  const availableNames = availableTransitions.map((t) => t.to.name).join(', ');
  const mappedName = statusMapping?.[targetCategory];

  if (mappedName) {
    return `Status mapping for "${targetLabel}" is set to "${mappedName}", but "${mappedName}" isn't an available state. Available: ${availableNames}`;
  }

  // statusMapping is either null or has no entry for this category — both surface
  // the same fix path. The system requires an explicit mapping; there is no
  // heuristic fallback (see findTransitionWithMapping).
  return `No status mapping configured for "${targetLabel}". Open Mappings to pick a destination state. Available: ${availableNames}`;
}

/**
 * Check if a status change is needed (i.e., current status doesn't match target category).
 *
 * @param currentJiraStatus - Current Jira status name
 * @param targetCategory - The KPM status category to check against
 * @returns true if a transition is needed
 */
export function isTransitionNeeded(
  currentJiraStatus: string,
  targetCategory: StatusCategory
): boolean {
  // Get the category that the current status would map to
  const currentCategory = inferCategoryFromStatus(currentJiraStatus);
  return currentCategory !== targetCategory;
}

/**
 * Check if a status change is needed using the same explicit mapping and
 * tracker-native hints used by sync/import inference.
 */
export function isTransitionNeededWithMapping(
  currentStatus: string,
  targetCategory: StatusCategory,
  statusMapping: StatusMapping | null,
  hint?: { trackerType?: TrackerType; stateType?: string | null }
): boolean {
  const currentCategory = inferCategoryWithMapping(currentStatus, statusMapping, hint);
  return currentCategory !== targetCategory;
}

/**
 * Infer KPM StatusCategory from a Jira status name.
 * Uses keyword matching since we don't have status category info from just the name.
 */
export function inferCategoryFromStatus(statusName: string): StatusCategory {
  const lowerStatus = statusName.toLowerCase();

  // Check each category's keywords
  for (const [category, keywords] of Object.entries(STATUS_KEYWORDS)) {
    if (keywords.some((k) => lowerStatus.includes(k))) {
      return category as StatusCategory;
    }
  }

  // Default: assume not started for unknown statuses
  return 'not_started';
}

function normalizeStatusName(statusName: string): string {
  return statusName.trim().toLowerCase();
}

// =============================================================================
// Explicit Mapping Functions
// =============================================================================

/**
 * Find a transition that leads to an explicitly mapped Jira status.
 * Returns the first transition whose destination status name matches the mapped status.
 *
 * @param targetCategory - The KPM status category to transition to
 * @param availableTransitions - Available transitions from Jira (from current state)
 * @param statusMapping - The explicit status mapping (if configured)
 * @returns The matching transition, or null if none found
 */
export function findTransitionByMapping(
  targetCategory: StatusCategory,
  availableTransitions: TrackerTransition[],
  statusMapping: StatusMapping | null
): TrackerTransition | null {
  if (!statusMapping || availableTransitions.length === 0) {
    return null;
  }

  // Get the mapped Jira status name for this category
  const mappedStatusName = statusMapping[targetCategory];
  if (!mappedStatusName) {
    return null;
  }

  // Find a transition that leads to the mapped status (case-insensitive match)
  const lowerMappedName = normalizeStatusName(mappedStatusName);
  return availableTransitions.find(
    (t) => normalizeStatusName(t.to.name) === lowerMappedName
  ) ?? null;
}

/**
 * Infer KPM StatusCategory from a Jira status name using explicit mapping.
 * Does a reverse lookup: given a Jira status name, find which KPM category it's mapped to.
 *
 * @param statusName - The Jira status name
 * @param statusMapping - The explicit status mapping (if configured)
 * @returns The mapped category, or null if not found in mapping
 */
export function inferCategoryFromMapping(
  statusName: string,
  statusMapping: StatusMapping | null
): StatusCategory | null {
  if (!statusMapping) {
    return null;
  }

  const lowerStatusName = normalizeStatusName(statusName);

  // Check each category in the mapping
  for (const [category, mappedName] of Object.entries(statusMapping)) {
    if (mappedName && normalizeStatusName(mappedName) === lowerStatusName) {
      return category as StatusCategory;
    }
  }

  return null;
}

/**
 * Transition finder for export. Explicit mapping is the only source of truth.
 *
 * @param targetCategory - The KPM status category to transition to
 * @param availableTransitions - Available transitions from Jira (from current state)
 * @param statusMapping - The explicit status mapping (if configured)
 * @returns The best matching transition, or null if none found
 */
export function findTransitionWithMapping(
  targetCategory: StatusCategory,
  availableTransitions: TrackerTransition[],
  statusMapping: StatusMapping | null
): TrackerTransition | null {
  // The explicit mapping is the only source of truth. No heuristic fallback —
  // if the user hasn't mapped this category, or the mapped state isn't a
  // valid transition, we surface a warning instead of guessing.
  return findTransitionByMapping(targetCategory, availableTransitions, statusMapping);
}

/**
 * Smart category inference that uses explicit mapping if available, then tracker-native
 * hints (Linear state type), then keyword heuristics.
 *
 * @param statusName - The tracker status name
 * @param statusMapping - The explicit status mapping (if configured)
 * @param hint - Optional tracker context; for Linear, `stateType` is preferred over keyword matching
 */
export function inferCategoryWithMapping(
  statusName: string,
  statusMapping: StatusMapping | null,
  hint?: { trackerType?: TrackerType; stateType?: string | null }
): StatusCategory {
  // 1. Explicit per-association mapping wins.
  const mappedCategory = inferCategoryFromMapping(statusName, statusMapping);
  if (mappedCategory) {
    return mappedCategory;
  }

  // 2. Linear state type is a direct signal — use it before keyword heuristics
  // (which were tuned for Jira). Presence of stateType is itself a signal that
  // the issue came from Linear; the explicit trackerType field is optional.
  const linearCategory = mapLinearStateTypeToCategory(hint?.stateType);
  if (linearCategory) {
    return linearCategory;
  }

  // 3. Keyword-based fallback.
  return inferCategoryFromStatus(statusName);
}
