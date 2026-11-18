import type { NewDiffReviewComment } from '../../shared/diffReview';

export const listDiffReviewComments = (chatSessionId: string) => window.api.diffReview.listComments({ chatSessionId });
export const createDiffReviewComment = (input: NewDiffReviewComment) => window.api.diffReview.createComment(input);
export const updateDiffReviewComment = (id: string, body: string) => window.api.diffReview.updateComment({ id, body });
export const deleteDiffReviewComment = (id: string) => window.api.diffReview.deleteComment({ id });
