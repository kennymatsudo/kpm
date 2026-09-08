import type { OutboundDeletion, SyncReviewDeleteItem } from '../../../shared/types';
import type { IOutboundChangeRepository } from '../interfaces';
import type { TrackerClient } from '../../tracker-clients/common/types';

export interface DeletionDrainDeps {
  outboundChanges: Pick<IOutboundChangeRepository, 'remove' | 'setError'>;
}

export interface DrainDeletionsResult {
  deleted: { external_key: string }[];
  errors: { external_key: string; error: string }[];
}

/**
 * Attaches each deletion's current tracker state for the review. Best-effort: a
 * failed fetch becomes an inline error on that row rather than blocking the
 * deletion, because the row already knows the key it has to remove.
 */
export async function describeDeletions(
  deletions: OutboundDeletion[],
  client: Pick<TrackerClient, 'fetchIssue'> | null
): Promise<SyncReviewDeleteItem[]> {
  const fetched = client
    ? await Promise.allSettled(deletions.map((deletion) => client.fetchIssue(deletion.external_key)))
    : null;

  return deletions.map((queueEntry, index) => {
    const result = fetched?.[index];
    return {
      queueEntry,
      decision: 'pending' as const,
      currentIssue: result?.status === 'fulfilled'
        ? {
            title: result.value.title,
            description: result.value.description,
            status: result.value.status,
            url: result.value.url,
          }
        : null,
      fetchError: result?.status === 'rejected'
        ? (result.reason instanceof Error ? result.reason.message : 'Failed to load current details')
        : null,
    };
  });
}

/**
 * Deletes the approved rows from the tracker and clears them from the queue. A
 * row that fails keeps its place in the queue with the error recorded, so the
 * next drain retries it.
 *
 * Sequential like the create loop: volume is too low for parallelizing to pay off.
 */
export async function drainDeletions(
  deletions: OutboundDeletion[],
  approvedIds: string[],
  client: Pick<TrackerClient, 'deleteIssue'>,
  deps: DeletionDrainDeps
): Promise<DrainDeletionsResult> {
  const approved = new Set(approvedIds);
  const result: DrainDeletionsResult = { deleted: [], errors: [] };

  for (const deletion of deletions) {
    if (!approved.has(deletion.id)) continue;
    try {
      await client.deleteIssue(deletion.external_key);
      deps.outboundChanges.remove(deletion.id);
      result.deleted.push({ external_key: deletion.external_key });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      result.errors.push({ external_key: deletion.external_key, error });
      deps.outboundChanges.setError(deletion.id, error);
    }
  }

  return result;
}
