/**
 * Review IPC Validation Schemas
 */

import { z } from 'zod';
import { uuid } from './shared';

export const ReviewSchemas = {
  getInbox: z.object({
    sessionId: uuid,
  }),

  refreshSession: z.object({
    sessionId: uuid,
  }),

  assignOwnership: z.object({
    sessionId: uuid,
  }),

  assessThreads: z.object({
    sessionId: uuid,
  }),

  draftPostImplReplies: z.object({
    sessionId: uuid,
  }),

  triggerAutomation: z.object({
    sessionId: uuid,
    taskIds: z.array(uuid).optional(),
  }),

  replyToThread: z.object({
    sessionId: uuid,
    threadId: z.string().min(1, 'Thread ID is required').max(512),
    body: z.string().min(1, 'Reply body is required').max(65536),
    resolve: z.boolean().optional(),
  }),

  resolveThread: z.object({
    sessionId: uuid,
    threadId: z.string().min(1, 'Thread ID is required').max(512),
  }),

  unresolveThread: z.object({
    sessionId: uuid,
    threadId: z.string().min(1, 'Thread ID is required').max(512),
  }),

  ignoreTask: z.object({
    taskId: uuid,
  }),

  overrideDisposition: z.object({
    taskId: uuid,
    disposition: z.enum(['implement', 'push_back', 'needs_user_input']),
  }),

  pollNow: z.object({}).optional(),

  pollSession: z.object({
    sessionId: uuid,
  }),
};
