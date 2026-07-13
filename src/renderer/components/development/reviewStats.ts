/**
 * reviewStats - Renderer projection of shared Review Thread facts.
 *
 * The shared summary owns session/open-thread/task eligibility and factual
 * attention/work derivation. This module preserves the renderer-facing stats
 * and predicate contracts consumed by the Review tab and board status.
 */

import type { ReviewInboxSnapshot } from '../../../shared/types';
import { summarizeReviewThreads, type ReviewWorkFacts } from '../../../shared/reviewThreadSummary';

export type ReviewStats = ReviewWorkFacts;

export {
  isReviewTaskQueuedForCode,
  isReviewTaskUpdatingCode,
  isReviewWorkTask as isTaskActionable,
  isReviewThreadClosed as isThreadClosed,
} from '../../../shared/reviewThreadSummary';

export function getStats(inbox: ReviewInboxSnapshot | null, sessionId: string): ReviewStats {
  return summarizeReviewThreads(sessionId, {
    snapshot: inbox?.snapshot,
    tasks: inbox?.tasks ?? [],
  }).work;
}
