/**
 * Status transition mapping utilities for Jira sync.
 *
 * - not_started: Work hasn't begun
 * - in_progress: Work is actively being done
 * - done: Work is complete
 * - blocked: Work is blocked/on hold
 * - canceled: Work was canceled/won't be done
 *
 * Jira uses workflow transitions with status categories:
 * - 'new' (To Do) - corresponds to not_started
 * - 'indeterminate' (In Progress) - corresponds to in_progress/blocked
 * - 'done' (Done) - corresponds to done/canceled
 */


/**
 * Note: Jira only has 3 categories, so we map blocked → indeterminate and canceled → done.
 */
const CATEGORY_TO_JIRA_STATUS_CATEGORY: Record<StatusCategory, string[]> = {
  not_started: ['new', 'undefined'],  // Jira's "To Do" category
  in_progress: ['indeterminate'],      // Jira's "In Progress" category
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
  done: ['done', 'complete', 'resolved', 'closed', 'finish'],
  blocked: ['block', 'hold', 'wait', 'impediment', 'stuck'],
  canceled: ['cancel', 'won\'t', 'wont', 'duplicate', 'invalid', 'reject'],
};

/**
 *
 * Strategy:
 * 1. First, try to match by Jira's status category (most reliable)
 * 2. If no match, fall back to keyword matching in transition names
 * 3. Return null if no suitable transition exists
 *
 * @param availableTransitions - Available transitions from Jira (from current state)
 * @returns The best matching transition, or null if none found
 */
export function findBestTransition(
  targetCategory: StatusCategory,
  availableTransitions: JiraTransition[]
): JiraTransition | null {
  if (availableTransitions.length === 0) {
    return null;
  }

  const targetJiraCategories = CATEGORY_TO_JIRA_STATUS_CATEGORY[targetCategory];

  const categoryMatches = availableTransitions.filter((t) =>
    targetJiraCategories.includes(t.to.statusCategory.key.toLowerCase())
  );

  if (categoryMatches.length > 0) {
  }


  if (keywordMatches.length > 0) {
    return keywordMatches.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}

/**
 * Generate a warning message when no valid transition exists.
 *
 * @param currentStatus - Current Jira status name
 * @param availableTransitions - What transitions are available
 * @returns Human-readable warning message
 */
export function generateTransitionWarning(
  currentStatus: string,
  targetCategory: StatusCategory,
): string {
  const categoryLabels: Record<StatusCategory, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    done: 'Done',
    blocked: 'Blocked',
    canceled: 'Canceled',
  };

  const targetLabel = categoryLabels[targetCategory];

  if (availableTransitions.length === 0) {
  }

  const availableNames = availableTransitions.map((t) => t.to.name).join(', ');
}

/**
 * Check if a status change is needed (i.e., current status doesn't match target category).
 *
 * @param currentJiraStatus - Current Jira status name
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

// =============================================================================
// Explicit Mapping Functions
// =============================================================================

/**
 * Find a transition that leads to an explicitly mapped Jira status.
 * Returns the first transition whose destination status name matches the mapped status.
 *
 * @param availableTransitions - Available transitions from Jira (from current state)
 * @param statusMapping - The explicit status mapping (if configured)
 * @returns The matching transition, or null if none found
 */
export function findTransitionByMapping(
  targetCategory: StatusCategory,
  availableTransitions: JiraTransition[],
  statusMapping: StatusMapping | null
): JiraTransition | null {
  if (!statusMapping || availableTransitions.length === 0) {
    return null;
  }

  // Get the mapped Jira status name for this category
  if (!mappedStatusName) {
    return null;
  }

  // Find a transition that leads to the mapped status (case-insensitive match)
  return availableTransitions.find(
  ) ?? null;
}

/**
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


  // Check each category in the mapping
  for (const [category, mappedName] of Object.entries(statusMapping)) {
      return category as StatusCategory;
    }
  }

  return null;
}

/**
 *
 * @param availableTransitions - Available transitions from Jira (from current state)
 * @param statusMapping - The explicit status mapping (if configured)
 * @returns The best matching transition, or null if none found
 */
export function findTransitionWithMapping(
  targetCategory: StatusCategory,
  availableTransitions: JiraTransition[],
  statusMapping: StatusMapping | null
): JiraTransition | null {
}

/**
 *
 * @param statusMapping - The explicit status mapping (if configured)
 */
export function inferCategoryWithMapping(
  statusName: string,
): StatusCategory {
  const mappedCategory = inferCategoryFromMapping(statusName, statusMapping);
  if (mappedCategory) {
    return mappedCategory;
  }

  return inferCategoryFromStatus(statusName);
}
