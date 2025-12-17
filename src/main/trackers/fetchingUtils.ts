import type { TrackerClient, ExternalIssue } from '../tracker-clients';
import { isSubtaskIssueType } from '../../shared/types';

export const DEFAULT_BATCH_SIZE = 50;

/** Progress callback interval (report every N issues) */
export const PROGRESS_REPORT_INTERVAL = 10;

/**
 * Recursively fetch all issues including their subtasks.
 * direct children but not grandchildren (subtasks of stories).
 *
 * @param client - Tracker client for fetching issues
 * @param onProgress - Optional callback for progress updates (receives total fetched count)
 * @returns Array of all fetched issues including nested subtasks
 */
export async function fetchIssuesWithSubtasks(
  client: TrackerClient,
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

    issueMap.set(issue.key, issue);
    reportProgress();
  }

  let keysToCheck = Array.from(issueMap.values())
    .filter(issue => !isSubtaskIssueType(issue.issueType))
    .map(issue => issue.key);

  while (keysToCheck.length > 0) {
      }
    }

      .filter(issue => !isSubtaskIssueType(issue.issueType))
      .map(issue => issue.key);
  }

  if (fetchedCount > 0) {
    onProgress?.(fetchedCount);
  }

  return Array.from(issueMap.values());
}
