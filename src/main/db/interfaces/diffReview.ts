import type { DiffReviewComment, NewDiffReviewComment, TurnFileChange } from '../../../shared/diffReview';

export interface TurnSnapshotRow {
  id: string;
  projectId: string;
  chatSessionId: string;
  clientMessageId: string;
  rootPath: string;
  store: 'repo' | 'shadow';
  beforeTree: string;
  afterTree: string | null;
  files: TurnFileChange[] | null;
  error: string | null;
  incomplete: boolean;
  createdAt: string;
}

export interface ITurnSnapshotRepository {
  insertBefore(row: {
    id: string;
    projectId: string;
    chatSessionId: string;
    clientMessageId: string;
    rootPath: string;
    store: 'repo' | 'shadow';
    beforeTree: string;
  }): void;
  finish(id: string, afterTree: string, files: TurnFileChange[], incomplete?: boolean): void;
  fail(id: string, error: string): void;
  delete(id: string): void;
  listBySession(chatSessionId: string): TurnSnapshotRow[];
  listByTurn(chatSessionId: string, clientMessageId: string): TurnSnapshotRow[];
}

export interface IDiffReviewCommentRepository {
  create(comment: NewDiffReviewComment & { id: string }): DiffReviewComment;
  update(
    id: string,
    changes: { body?: string; startLine?: number; endLine?: number; quotedText?: string },
  ): DiffReviewComment | undefined;
  delete(id: string): void;
  deleteMany(ids: string[]): void;
  listBySession(chatSessionId: string): DiffReviewComment[];
  getMany(ids: string[]): DiffReviewComment[];
}
