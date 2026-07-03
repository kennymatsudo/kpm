/**
 * Review IPC Handlers
 *
 * Bridges renderer to ReviewService for GitHub review workflow operations.
 */

import type { ReviewService } from '../../services/repo/ReviewService';
import type { ReviewAssessmentService } from '../../services/repo/ReviewAssessmentService';
import type { ReviewPollService } from '../../services/repo/ReviewPollService';
import { unwrapOrThrow } from '../../services/result';
import { reviewEndpoints, type ReviewEndpointName } from '../../../shared/ipc/reviewEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import { createRegistryIpcHandlers } from '../validation/utils';

type ReviewHandler<K extends ReviewEndpointName> = (
  params: EndpointPayload<(typeof reviewEndpoints)[K]>,
  event: Electron.IpcMainInvokeEvent
) => unknown;

/**
 * One handler per `reviewEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ReviewHandlers = { [K in ReviewEndpointName]: ReviewHandler<K> };

function buildReviewHandlers(
  reviewService: ReviewService,
  reviewAssessmentService: ReviewAssessmentService,
  reviewPollService: ReviewPollService
): ReviewHandlers {
  return {
    getInbox: async ({ sessionId }) => {
      const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
      return { inbox };
    },

    refreshSession: async ({ sessionId }) => {
      const inbox = unwrapOrThrow(await reviewService.syncSessionReviewState(sessionId));
      return { inbox };
    },

    assignOwnership: async ({ sessionId }) => {
      unwrapOrThrow(reviewService.assignOwnership(sessionId));
      const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
      return { inbox };
    },

    assessThreads: async ({ sessionId, taskIds, reassessAll }) => {
      const result = unwrapOrThrow(await reviewAssessmentService.assessThreads(sessionId, { taskIds, reassessAll }));
      const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
      return { ...result, inbox };
    },

    draftPostImplReplies: async ({ sessionId }) => {
      const result = unwrapOrThrow(await reviewAssessmentService.draftPostImplementationReplies(sessionId));
      const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
      return { ...result, inbox };
    },

    triggerAutomation: async ({ sessionId, taskIds }) => {
      const result = unwrapOrThrow(await reviewService.triggerReviewAutomation(sessionId, taskIds));
      return result;
    },

    replyToThread: async ({ sessionId, threadId, body, resolve }) => {
      return unwrapOrThrow(await reviewService.replyToThread(sessionId, threadId, body, resolve));
    },

    resolveThread: async ({ sessionId, threadId }) => {
      const inbox = unwrapOrThrow(await reviewService.resolveThread(sessionId, threadId));
      return { inbox };
    },

    unresolveThread: async ({ sessionId, threadId }) => {
      const inbox = unwrapOrThrow(await reviewService.unresolveThread(sessionId, threadId));
      return { inbox };
    },

    ignoreTask: async ({ taskId }) => {
      const inbox = unwrapOrThrow(await reviewService.ignoreTask(taskId));
      return { inbox };
    },

    overrideDisposition: async ({ taskId, disposition }) => {
      const task = unwrapOrThrow(reviewService.overrideDisposition(taskId, disposition));
      const inbox = unwrapOrThrow(await reviewService.getReviewInbox(task.session_id));
      return { inbox };
    },

    pollNow: async () => {
      return reviewPollService.pollNow();
    },

    pollSession: async ({ sessionId }) => {
      return reviewPollService.pollSession(sessionId);
    },
  };
}

export function registerReviewHandlers(
  reviewService: ReviewService,
  reviewAssessmentService: ReviewAssessmentService,
  reviewPollService: ReviewPollService
): void {
  createRegistryIpcHandlers(
    reviewEndpoints,
    buildReviewHandlers(reviewService, reviewAssessmentService, reviewPollService),
    'Review operation failed'
  );
}
