/**
 * Review workflow domain endpoint registry.
 *
 * One entry per `review:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.review`. `review:sync-updated` and
 * `review-poll:actionable` are events (`ipcRenderer.on`), not invoke
 * endpoints, so they stay hand-declared in `src/preload/api.ts`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { ReviewDisposition, ReviewInboxSnapshot } from '../types';

const threadId = z.string().min(1, 'Thread ID is required').max(512);

/**
 * Mirrors `AssessmentResult` from
 * `main/services/repo/ReviewAssessmentService.ts` — not re-imported from
 * there to avoid a shared/ -> main/ dependency.
 */
interface AssessmentResult {
  threadId: string;
  disposition: ReviewDisposition;
  rationale: string;
  draftReply: string | null;
}

/**
 * Mirrors `PollTickSummary` from `main/services/repo/ReviewPollService.ts`.
 */
interface PollTickSummary {
  processed: number;
  fixesStarted: number;
  assessmentsRun: number;
  needsAttention: number;
  completed: number;
  errors: number;
  timestamp: string;
}

/**
 * Mirrors `PollSessionResult` from `main/services/repo/ReviewPollService.ts`.
 */
interface PollSessionResult {
  sessionId: string;
  action: 'synced' | 'assessed' | 'fix_started' | 'needs_attention' | 'completed' | 'skipped' | 'error';
  newThreadCount: number;
  implementCount: number;
  error?: string;
}

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/review.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const reviewEndpoints = {
  getInbox: {
    channel: 'review:get-inbox',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  refreshSession: {
    channel: 'review:refresh-session',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  assignOwnership: {
    channel: 'review:assign-ownership',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  assessThreads: {
    channel: 'review:assess-threads',
    params: z.object({ sessionId: uuid, taskIds: z.array(uuid).optional(), reassessAll: z.boolean().optional() }),
    result: resultOf<
      RegistryResponse<{ results: AssessmentResult[]; errors: string[]; inbox: ReviewInboxSnapshot }>
    >(),
  },
  draftPostImplReplies: {
    channel: 'review:draft-post-impl-replies',
    params: z.object({ sessionId: uuid }),
    result: resultOf<
      RegistryResponse<{ results: AssessmentResult[]; errors: string[]; inbox: ReviewInboxSnapshot }>
    >(),
  },
  triggerAutomation: {
    channel: 'review:trigger-automation',
    params: z.object({ sessionId: uuid, taskIds: z.array(uuid).optional() }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot; taskIds: string[]; context: string }>>(),
  },
  replyToThread: {
    channel: 'review:reply-to-thread',
    params: z.object({
      sessionId: uuid,
      threadId,
      body: z.string().min(1, 'Reply body is required').max(65536),
      resolve: z.boolean().optional(),
    }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot; replyId: string; resolved: boolean }>>(),
  },
  resolveThread: {
    channel: 'review:resolve-thread',
    params: z.object({ sessionId: uuid, threadId }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  unresolveThread: {
    channel: 'review:unresolve-thread',
    params: z.object({ sessionId: uuid, threadId }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  ignoreTask: {
    channel: 'review:ignore-task',
    params: z.object({ taskId: uuid }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  overrideDisposition: {
    channel: 'review:override-disposition',
    params: z.object({ taskId: uuid, disposition: z.enum(['implement', 'push_back', 'needs_user_input']) }),
    result: resultOf<RegistryResponse<{ inbox: ReviewInboxSnapshot }>>(),
  },
  pollNow: {
    channel: 'review:poll-now',
    params: z.object({}).optional(),
    result: resultOf<RegistryResponse<PollTickSummary>>(),
  },
  pollSession: {
    channel: 'review:poll-session',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<PollSessionResult>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ReviewEndpoints = typeof reviewEndpoints;
export type ReviewEndpointName = keyof ReviewEndpoints;
