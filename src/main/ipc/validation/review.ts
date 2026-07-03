/**
 * Review IPC Validation Schemas
 */

import { reviewEndpoints } from '../../../shared/ipc/reviewEndpoints';

export const ReviewSchemas = {
  getInbox: reviewEndpoints.getInbox.params,
  refreshSession: reviewEndpoints.refreshSession.params,
  assignOwnership: reviewEndpoints.assignOwnership.params,
  assessThreads: reviewEndpoints.assessThreads.params,
  draftPostImplReplies: reviewEndpoints.draftPostImplReplies.params,
  triggerAutomation: reviewEndpoints.triggerAutomation.params,
  replyToThread: reviewEndpoints.replyToThread.params,
  resolveThread: reviewEndpoints.resolveThread.params,
  unresolveThread: reviewEndpoints.unresolveThread.params,
  ignoreTask: reviewEndpoints.ignoreTask.params,
  overrideDisposition: reviewEndpoints.overrideDisposition.params,
  pollNow: reviewEndpoints.pollNow.params,
  pollSession: reviewEndpoints.pollSession.params,
};
