import type { TrackerClient, ExternalIssue } from '../tracker-clients';
import { isSubtaskIssueType } from '../../shared/types';

/** Default batch size for parent-children queries to avoid filter-length limits */
export const DEFAULT_BATCH_SIZE = 50;

/** Progress callback interval (report every N issues) */
export const PROGRESS_REPORT_INTERVAL = 10;

/**
 * Recursively fetch all issues including their subtasks.
 * Handles the case where a filter like "parent = EPIC-123" only returns
 * direct children but not grandchildren (subtasks of stories).
 *
 * @param client - Tracker client for fetching issues
 * @param filter - Tracker-native filter string (JQL for Jira, JSON for Linear)
 * @param onProgress - Optional callback for progress updates (receives total fetched count)
 * @returns Array of all fetched issues including nested subtasks
 */
export async function fetchIssuesWithSubtasks(
  client: TrackerClient,
  filter: string,
  onProgress?: (fetched: number) => void
): Promise<ExternalIssue[]> {
  const issueMap = new Map<string, ExternalIssue>();
  let fetchedCount = 0;

  const reportProgress = () => {
    fetchedCount++;
    if (fetchedCount % PROGRESS_REPORT_INTERVAL === 0) {
      onProgress?.(fetchedCount);
    }
  };

  // Phase 1: Fetch issues from the main filter
  for await (const issue of client.fetchIssuesByJql(filter)) {
    issueMap.set(issue.key, issue);
    reportProgress();
  }

  // Phase 2: Recursively fetch subtasks of non-subtask issues via the client-owned batch API
  let keysToCheck = Array.from(issueMap.values())
    .filter(issue => !isSubtaskIssueType(issue.issueType))
    .map(issue => issue.key);

  while (keysToCheck.length > 0) {
    const children = await client.fetchChildrenByParents(keysToCheck);
    const newChildren: ExternalIssue[] = [];
    for (const child of children) {
      if (!issueMap.has(child.key)) {
        issueMap.set(child.key, child);
        newChildren.push(child);
        reportProgress();
      }
    }

    // Dig one more level for any newly-discovered non-subtask issues (Story under Epic → Sub-task under Story).
    keysToCheck = newChildren
      .filter(issue => !isSubtaskIssueType(issue.issueType))
      .map(issue => issue.key);
  }

  if (fetchedCount > 0) {
    onProgress?.(fetchedCount);
  }

  return Array.from(issueMap.values());
}
