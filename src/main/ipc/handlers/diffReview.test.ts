import { describe, expect, it, vi } from 'vitest';
import { buildDiffReviewHandlers } from './diffReview';
import type { DiffReviewComment } from '../../../shared/diffReview';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fakeComments() {
  return {
    create: vi.fn((c) => ({ ...c, createdAt: '2026-01-01T00:00:00.000Z' }) as DiffReviewComment),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    listBySession: vi.fn().mockReturnValue([]),
    getMany: vi.fn(),
  };
}

function fakeTurnSnapshots() {
  return { listTurnChanges: vi.fn(), getDiff: vi.fn() };
}

describe('diff review IPC handlers', () => {
  it('creates a comment with a generated uuid', () => {
    const comments = fakeComments();
    const input = {
      projectId: 'p', chatSessionId: 's', rootPath: '/r', filePath: 'a.ts',
      side: 'new' as const, startLine: 1, endLine: 2, quotedText: 'x', body: 'hi',
    };

    const result = buildDiffReviewHandlers({ comments, turnSnapshots: fakeTurnSnapshots() }).createComment(input, {} as never) as { comment: DiffReviewComment };

    expect(result.comment.id).toMatch(UUID_RE);
    expect(result.comment).toMatchObject(input);
  });

  it('throws when updating a missing comment', () => {
    const comments = fakeComments();
    comments.update.mockReturnValue(undefined);

    expect(() => buildDiffReviewHandlers({ comments, turnSnapshots: fakeTurnSnapshots() }).updateComment({ id: 'x', body: 'b' }, {} as never)).toThrow('Comment not found');
  });

  it('returns the diff files for getDiff', () => {
    const turnSnapshots = fakeTurnSnapshots();
    const files = [{ rootPath: '/r', filePath: 'a.ts', status: 'modified' }];
    turnSnapshots.getDiff.mockResolvedValue({ ok: true, data: files });
    const input = { projectId: 'p', chatSessionId: 's', scope: 'chat' as const };

    return expect(
      buildDiffReviewHandlers({ comments: fakeComments(), turnSnapshots }).getDiff(input, {} as never),
    ).resolves.toEqual({ files });
  });

  it('throws the service failure message from getDiff', () => {
    const turnSnapshots = fakeTurnSnapshots();
    turnSnapshots.getDiff.mockResolvedValue({ ok: false, error: 'Snapshot expired' });

    return expect(
      buildDiffReviewHandlers({ comments: fakeComments(), turnSnapshots }).getDiff(
        { projectId: 'p', chatSessionId: 's', scope: 'chat' },
        {} as never,
      ),
    ).rejects.toThrow('Snapshot expired');
  });

  it('lists turns for a session', () => {
    const turnSnapshots = fakeTurnSnapshots();
    turnSnapshots.listTurnChanges.mockReturnValue({ ok: true, data: [] });

    expect(
      buildDiffReviewHandlers({ comments: fakeComments(), turnSnapshots }).listTurnChanges({ chatSessionId: 's' }, {} as never),
    ).toEqual({ turns: [] });
  });
});
