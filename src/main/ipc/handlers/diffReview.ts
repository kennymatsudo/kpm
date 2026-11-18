import { randomUUID } from 'crypto';
import { diffReviewEndpoints, type DiffReviewEndpointName } from '../../../shared/ipc/diffReviewEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { IDiffReviewCommentRepository } from '../../db/interfaces';
import { createRegistryIpcHandlers } from '../validation/utils';

type Handlers = { [K in DiffReviewEndpointName]: UnwrappedHandlerFor<typeof diffReviewEndpoints, K> };

export interface DiffReviewHandlerDeps {
  comments: IDiffReviewCommentRepository;
}

export function buildDiffReviewHandlers(deps: DiffReviewHandlerDeps): Handlers {
  return {
    listComments: ({ chatSessionId }) => ({ comments: deps.comments.listBySession(chatSessionId) }),
    createComment: (input) => ({ comment: deps.comments.create({ ...input, id: randomUUID() }) }),
    updateComment: ({ id, body }) => {
      const comment = deps.comments.update(id, { body });
      if (!comment) throw new Error('Comment not found');
      return { comment };
    },
    deleteComment: ({ id }) => { deps.comments.delete(id); },
  };
}

export function registerDiffReviewHandlers(deps: DiffReviewHandlerDeps): void {
  createRegistryIpcHandlers(diffReviewEndpoints, buildDiffReviewHandlers(deps), 'Diff review operation failed');
}
