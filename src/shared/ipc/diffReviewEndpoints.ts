import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';
import type { DiffReviewComment, FileDiff, TurnChanges } from '../diffReview';

type Response<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

const relativeFilePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'),
    'Path must stay inside its root',
  );
const line = z.number().int().min(1).max(10_000_000);

export const diffReviewEndpoints = {
  listComments: {
    channel: 'diff-review:list-comments',
    params: z.object({ chatSessionId: uuid }),
    result: resultOf<Response<{ comments: DiffReviewComment[] }>>(),
  },
  createComment: {
    channel: 'diff-review:create-comment',
    params: z
      .object({
        projectId: uuid,
        chatSessionId: uuid,
        rootPath: absolutePath,
        filePath: relativeFilePath,
        side: z.enum(['new', 'old']),
        startLine: line,
        endLine: line,
        quotedText: z.string().max(200_000),
        body: z.string().trim().min(1).max(20_000),
      })
      .refine((value) => value.endLine >= value.startLine, 'endLine must not precede startLine'),
    result: resultOf<Response<{ comment: DiffReviewComment }>>(),
  },
  updateComment: {
    channel: 'diff-review:update-comment',
    params: z.object({ id: uuid, body: z.string().trim().min(1).max(20_000) }),
    result: resultOf<Response<{ comment: DiffReviewComment }>>(),
  },
  deleteComment: {
    channel: 'diff-review:delete-comment',
    params: z.object({ id: uuid }),
    result: resultOf<Response>(),
  },
  listTurnChanges: {
    channel: 'diff-review:list-turn-changes',
    params: z.object({ chatSessionId: uuid }),
    result: resultOf<Response<{ turns: TurnChanges[] }>>(),
  },
  getDiff: {
    channel: 'diff-review:get-diff',
    params: z.object({
      projectId: uuid,
      chatSessionId: uuid,
      scope: z.enum(['turn', 'chat', 'uncommitted']),
      clientMessageId: uuid.optional(),
      rootPath: absolutePath.optional(),
      filePath: relativeFilePath.optional(),
    }),
    result: resultOf<Response<{ files: FileDiff[] }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type DiffReviewEndpointName = keyof typeof diffReviewEndpoints;
