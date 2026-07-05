/**
 * Review domain event registry (main -> renderer push events).
 *
 * Covers `review:sync-updated` and the `review-poll:*` broadcasts emitted
 * from `ReviewPollService`. These are not invoke endpoints — see
 * `reviewEndpoints.ts` for the invoke surface.
 *
 * `review:sync-updated` has a preload subscriber (`review.onSyncUpdated`)
 * but NO emit call site anywhere in main — the inverse dead-event case (a
 * subscriber with no emitter). Kept wired per the migration's "don't
 * silently delete" rule rather than removed.
 *
 * Only `review-poll:actionable` has a preload subscriber
 * (`review.onActionableChanged`) today. `review-poll:completed`,
 * `review-poll:needs-attention`, `review-poll:fix-started`,
 * `review-poll:error`, and `review-poll:tick-complete` are emitted but have
 * no renderer listener — kept wired per the migration's "don't silently
 * delete a dead event" rule.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { ReviewActionableSummary } from '../types';

export interface ReviewSyncUpdatedEventData {
  sessionId: string;
  needsReviewCount: number;
  totalTasks: number;
  fetchedAt: string;
}

export interface ReviewPollCompletedEventData {
  sessionId: string;
  planItemId: string;
  prNumber: number;
  baseRefName: string;
}

export interface ReviewPollNeedsAttentionEventData {
  sessionId: string;
  reason: string;
  taskIds: string[];
}

export interface ReviewPollFixStartedEventData {
  sessionId: string;
  taskIds: string[];
  threadCount: number;
}

export interface ReviewPollErrorEventData {
  sessionId: string;
  error: string;
}

export interface ReviewPollTickCompleteEventData {
  processed: number;
  fixesStarted: number;
  assessmentsRun: number;
  needsAttention: number;
  completed: number;
  errors: number;
  timestamp: string;
}

export const reviewEvents = {
  syncUpdated: { channel: 'review:sync-updated', payload: payloadOf<ReviewSyncUpdatedEventData>() },
  pollActionable: { channel: 'review-poll:actionable', payload: payloadOf<ReviewActionableSummary>() },
  /** No preload subscriber today — kept wired, not deleted. */
  pollCompleted: { channel: 'review-poll:completed', payload: payloadOf<ReviewPollCompletedEventData>() },
  /** No preload subscriber today — kept wired, not deleted. */
  pollNeedsAttention: { channel: 'review-poll:needs-attention', payload: payloadOf<ReviewPollNeedsAttentionEventData>() },
  /** No preload subscriber today — kept wired, not deleted. */
  pollFixStarted: { channel: 'review-poll:fix-started', payload: payloadOf<ReviewPollFixStartedEventData>() },
  /** No preload subscriber today — kept wired, not deleted. */
  pollError: { channel: 'review-poll:error', payload: payloadOf<ReviewPollErrorEventData>() },
  /** No preload subscriber today — kept wired, not deleted. */
  pollTickComplete: { channel: 'review-poll:tick-complete', payload: payloadOf<ReviewPollTickCompleteEventData>() },
} satisfies Record<string, EventDefinition>;

export type ReviewEvents = typeof reviewEvents;
export type ReviewEventName = keyof ReviewEvents;
