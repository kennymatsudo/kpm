/**
 * Review IPC Handlers
 *
 * Bridges renderer to ReviewService for GitHub review workflow operations.
 */

import { ipcMain } from 'electron';
import type { ReviewService } from '../../services/repo/ReviewService';
import type { ReviewAssessmentService } from '../../services/repo/ReviewAssessmentService';
import type { ReviewPollService } from '../../services/repo/ReviewPollService';
import { unwrapOrThrow } from '../../services/result';
import { IPC_CHANNELS } from '../channels';
import { ReviewSchemas } from '../validation';
import { createIpcHandler } from '../validation/utils';

export function registerReviewHandlers(
  reviewService: ReviewService,
  reviewAssessmentService: ReviewAssessmentService,
  reviewPollService: ReviewPollService
): void {
  ipcMain.handle(
    IPC_CHANNELS.review.getInbox,
    createIpcHandler(
      ReviewSchemas.getInbox,
      async ({ sessionId }) => {
        const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
        return { inbox };
      },
      'Failed to get review inbox'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.refreshSession,
    createIpcHandler(
      ReviewSchemas.refreshSession,
      async ({ sessionId }) => {
        const inbox = unwrapOrThrow(await reviewService.syncSessionReviewState(sessionId));
        return { inbox };
      },
      'Failed to refresh review inbox'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.assignOwnership,
    createIpcHandler(
      ReviewSchemas.assignOwnership,
      async ({ sessionId }) => {
        unwrapOrThrow(reviewService.assignOwnership(sessionId));
        const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
        return { inbox };
      },
      'Failed to assign review ownership'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.assessThreads,
    createIpcHandler(
      ReviewSchemas.assessThreads,
        const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
        return { ...result, inbox };
      },
      'Failed to assess review threads'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.draftPostImplReplies,
    createIpcHandler(
      ReviewSchemas.draftPostImplReplies,
      async ({ sessionId }) => {
        const result = unwrapOrThrow(await reviewAssessmentService.draftPostImplementationReplies(sessionId));
        const inbox = unwrapOrThrow(await reviewService.getReviewInbox(sessionId));
        return { ...result, inbox };
      },
      'Failed to draft post-implementation replies'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.triggerAutomation,
    createIpcHandler(
      ReviewSchemas.triggerAutomation,
        return result;
      },
      'Failed to trigger review automation'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.replyToThread,
    createIpcHandler(
      ReviewSchemas.replyToThread,
      async ({ sessionId, threadId, body, resolve }) => {
        return unwrapOrThrow(await reviewService.replyToThread(sessionId, threadId, body, resolve));
      },
      'Failed to reply to review thread'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.resolveThread,
    createIpcHandler(
      ReviewSchemas.resolveThread,
      async ({ sessionId, threadId }) => {
        const inbox = unwrapOrThrow(await reviewService.resolveThread(sessionId, threadId));
        return { inbox };
      },
      'Failed to resolve review thread'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.unresolveThread,
    createIpcHandler(
      ReviewSchemas.unresolveThread,
      async ({ sessionId, threadId }) => {
        const inbox = unwrapOrThrow(await reviewService.unresolveThread(sessionId, threadId));
        return { inbox };
      },
      'Failed to unresolve review thread'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.ignoreTask,
    createIpcHandler(
      ReviewSchemas.ignoreTask,
      async ({ taskId }) => {
        const inbox = unwrapOrThrow(await reviewService.ignoreTask(taskId));
        return { inbox };
      },
      'Failed to ignore review task'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.overrideDisposition,
    createIpcHandler(
      ReviewSchemas.overrideDisposition,
      async ({ taskId, disposition }) => {
        const task = unwrapOrThrow(reviewService.overrideDisposition(taskId, disposition));
        const inbox = unwrapOrThrow(await reviewService.getReviewInbox(task.session_id));
        return { inbox };
      },
      'Failed to override disposition'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.pollNow,
    createIpcHandler(
      ReviewSchemas.pollNow,
      async () => {
        return reviewPollService.pollNow();
      },
      'Failed to trigger review poll'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.review.pollSession,
    createIpcHandler(
      ReviewSchemas.pollSession,
      async ({ sessionId }) => {
        return reviewPollService.pollSession(sessionId);
      },
      'Failed to poll session for reviews'
    )
  );
}
