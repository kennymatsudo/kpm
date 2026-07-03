/**
 * Review workflow domain endpoint registry.
 *
 * One entry per `review:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.review`. `review:sync-updated` and
 * `review-poll:actionable` are events (`ipcRenderer.on`), not invoke
 * endpoints, so they stay hand-declared in `src/preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const threadId = z.string().min(1, 'Thread ID is required').max(512);

export const reviewEndpoints = {
  getInbox: { channel: 'review:get-inbox', params: z.object({ sessionId: uuid }) },
  refreshSession: { channel: 'review:refresh-session', params: z.object({ sessionId: uuid }) },
  assignOwnership: { channel: 'review:assign-ownership', params: z.object({ sessionId: uuid }) },
  assessThreads: {
    channel: 'review:assess-threads',
    params: z.object({ sessionId: uuid, taskIds: z.array(uuid).optional(), reassessAll: z.boolean().optional() }),
  },
  draftPostImplReplies: { channel: 'review:draft-post-impl-replies', params: z.object({ sessionId: uuid }) },
  triggerAutomation: {
    channel: 'review:trigger-automation',
    params: z.object({ sessionId: uuid, taskIds: z.array(uuid).optional() }),
  },
  replyToThread: {
    channel: 'review:reply-to-thread',
    params: z.object({
      sessionId: uuid,
      threadId,
      body: z.string().min(1, 'Reply body is required').max(65536),
      resolve: z.boolean().optional(),
    }),
  },
  resolveThread: {
    channel: 'review:resolve-thread',
    params: z.object({ sessionId: uuid, threadId }),
  },
  unresolveThread: {
    channel: 'review:unresolve-thread',
    params: z.object({ sessionId: uuid, threadId }),
  },
  ignoreTask: { channel: 'review:ignore-task', params: z.object({ taskId: uuid }) },
  overrideDisposition: {
    channel: 'review:override-disposition',
    params: z.object({ taskId: uuid, disposition: z.enum(['implement', 'push_back', 'needs_user_input']) }),
  },
  pollNow: { channel: 'review:poll-now', params: z.object({}).optional() },
  pollSession: { channel: 'review:poll-session', params: z.object({ sessionId: uuid }) },
} satisfies Record<string, EndpointDefinition>;

export type ReviewEndpoints = typeof reviewEndpoints;
export type ReviewEndpointName = keyof ReviewEndpoints;
