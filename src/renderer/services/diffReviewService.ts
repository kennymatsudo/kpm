import type { DiffScope, NewDiffReviewComment, TurnChanges } from '../../shared/diffReview';

export const listDiffReviewComments = (chatSessionId: string) => window.api.diffReview.listComments({ chatSessionId });
export const createDiffReviewComment = (input: NewDiffReviewComment) => window.api.diffReview.createComment(input);
export const updateDiffReviewComment = (id: string, body: string) => window.api.diffReview.updateComment({ id, body });
export const deleteDiffReviewComment = (id: string) => window.api.diffReview.deleteComment({ id });
export const listTurnChanges = (chatSessionId: string) => window.api.diffReview.listTurnChanges({ chatSessionId });
export const getDiff = (input: {
  projectId: string;
  chatSessionId: string;
  scope: DiffScope;
  clientMessageId?: string;
  rootPath?: string;
  filePath?: string;
}) => window.api.diffReview.getDiff(input);
export const subscribeToTurnChanges = (handler: (data: { projectId: string; changes: TurnChanges }) => void) =>
  window.api.chat.onTurnChanges(handler);
