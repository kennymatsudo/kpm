import type { ExternalIssue, TrackerClient } from '../tracker-clients';
import type { TrackerTransition, StatusCategory, StatusMapping } from '../../shared/types';
import {
  findTransitionWithMapping,
  generateTransitionWarning,
  inferCategoryWithMapping,
  isTransitionNeededWithMapping,
} from './statusTransitions';

const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  canceled: 'Canceled',
};

/**
 * Drives a tracker issue to a target status category and verifies it landed there.
 *
 * This is the provider-agnostic half of export: the transition-and-verify dance is
 * identical for Jira and Linear (both reach states through the same
 * `getTransitions`/`transitionIssue` interface), so it lives here rather than in
 * either adapter or duplicated across `ExportService`'s create and update paths.
 * Provider-specific facts — how to build an issue URL, how to scope a Linear
 * Project, how to create directly in a state — stay inside the clients.
 */
export interface StatusReconciler {
  /**
   * Preflight: decide the transition (if any) needed to move an issue to
   * `targetCategory`. Returns null when the issue is already in the target
   * category. Throws with a human-readable reason when a transition is needed
   * but none maps — call this before mutating the issue so a bad mapping fails
   * without leaving a half-applied update.
   */
  planTransition(
    issueKey: string,
    currentIssue: ExternalIssue,
    targetCategory: StatusCategory
  ): Promise<TrackerTransition | null>;
  /**
   * Apply a planned transition, re-fetch the issue, and verify it reached
   * `targetCategory`. Returns the re-fetched issue; throws if it didn't land.
   */
  applyTransition(
    issueKey: string,
    transition: TrackerTransition,
    targetCategory: StatusCategory
  ): Promise<ExternalIssue>;
  /** Assert an issue is in `targetCategory`; throws otherwise. */
  verifyCategory(issue: ExternalIssue, targetCategory: StatusCategory): void;
  /** The KPM status category an issue currently maps to. */
  categoryOf(issue: ExternalIssue): StatusCategory;
}

export function createStatusReconciler(
  client: TrackerClient,
  statusMapping: StatusMapping | null
): StatusReconciler {
  const trackerType = client.type;
  const hintFor = (issue: ExternalIssue) => ({
    trackerType,
    stateType: issue.statusType ?? null,
  });

  function categoryOf(issue: ExternalIssue): StatusCategory {
    return inferCategoryWithMapping(issue.status, statusMapping, hintFor(issue));
  }

  function verifyCategory(issue: ExternalIssue, targetCategory: StatusCategory): void {
    if (categoryOf(issue) !== targetCategory) {
      throw new Error(
        `Tracker status for ${issue.key} is "${issue.status}" after export, expected ${STATUS_CATEGORY_LABELS[targetCategory]}`
      );
    }
  }

  async function planTransition(
    issueKey: string,
    currentIssue: ExternalIssue,
    targetCategory: StatusCategory
  ): Promise<TrackerTransition | null> {
    const needed = isTransitionNeededWithMapping(
      currentIssue.status,
      targetCategory,
      statusMapping,
      hintFor(currentIssue)
    );
    if (!needed) return null;

    const transitions = await client.getTransitions(issueKey);
    const transition = findTransitionWithMapping(targetCategory, transitions, statusMapping);
    if (!transition) {
      throw new Error(
        generateTransitionWarning(currentIssue.status, targetCategory, transitions, statusMapping)
      );
    }
    return transition;
  }

  async function applyTransition(
    issueKey: string,
    transition: TrackerTransition,
    targetCategory: StatusCategory
  ): Promise<ExternalIssue> {
    const toDoneCategory = transition.to.statusCategory.key === 'done';
    await client.transitionIssue(issueKey, transition.id, toDoneCategory);
    const issue = await client.fetchIssue(issueKey);
    verifyCategory(issue, targetCategory);
    return issue;
  }

  return { planTransition, applyTransition, verifyCategory, categoryOf };
}
