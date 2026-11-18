import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffReviewComment, NewDiffReviewComment } from '../../shared/diffReview';
import { emit } from './storeEvents';
import { useDiffReviewStore } from './diffReviewStore';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('./toastStore', () => ({ toast: { error: toastError } }));

const listDiffReviewComments = vi.hoisted(() => vi.fn());
const createDiffReviewComment = vi.hoisted(() => vi.fn());
const updateDiffReviewComment = vi.hoisted(() => vi.fn());
const deleteDiffReviewComment = vi.hoisted(() => vi.fn());
vi.mock('../services/diffReviewService', () => ({
  listDiffReviewComments,
  createDiffReviewComment,
  updateDiffReviewComment,
  deleteDiffReviewComment,
}));

const SESSION = 'session-1';
const store = () => useDiffReviewStore.getState();

function comment(id: string, body = 'note'): DiffReviewComment {
  return {
    id,
    projectId: 'p1',
    chatSessionId: SESSION,
    rootPath: '/repo',
    filePath: 'a.ts',
    side: 'new',
    startLine: 1,
    endLine: 2,
    quotedText: 'x',
    body,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

const input: NewDiffReviewComment = {
  projectId: 'p1',
  chatSessionId: SESSION,
  rootPath: '/repo',
  filePath: 'a.ts',
  side: 'new',
  startLine: 1,
  endLine: 2,
  quotedText: 'x',
  body: 'note',
};

beforeEach(() => {
  vi.resetAllMocks();
  store().resetProjectState();
});

describe('addComment', () => {
  it('appends the created comment to the session list', async () => {
    createDiffReviewComment.mockResolvedValueOnce({ success: true, comment: comment('c1') });
    await store().addComment(input);
    createDiffReviewComment.mockResolvedValueOnce({ success: true, comment: comment('c2') });
    const before = store().commentsBySession[SESSION];
    await store().addComment(input);

    expect(store().commentsBySession[SESSION].map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(store().commentsBySession[SESSION]).not.toBe(before);
  });

  it('returns null and keeps the list when the backend refuses', async () => {
    createDiffReviewComment.mockResolvedValue({ success: false, error: 'nope' });
    expect(await store().addComment(input)).toBeNull();
    expect(toastError).toHaveBeenCalledWith('Could not save the comment.');
    expect(store().commentsBySession[SESSION]).toBeUndefined();
  });
});

describe('editComment and removeComment', () => {
  beforeEach(async () => {
    listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1'), comment('c2')] });
    await store().loadComments(SESSION);
  });

  it('replaces an edited comment', async () => {
    updateDiffReviewComment.mockResolvedValue({ success: true, comment: comment('c1', 'new body') });
    await expect(store().editComment('c1', SESSION, 'new body')).resolves.toBe(true);
    expect(store().commentsBySession[SESSION].map((c) => c.body)).toEqual(['new body', 'note']);
  });

  it('keeps the comment and toasts when delete fails', async () => {
    deleteDiffReviewComment.mockResolvedValue({ success: false, error: 'x' });
    await store().removeComment('c1', SESSION);
    expect(store().commentsBySession[SESSION].map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(toastError).toHaveBeenCalledWith('Could not delete the comment.');
  });

  it('keeps the body and toasts when edit fails', async () => {
    updateDiffReviewComment.mockResolvedValue({ success: false, error: 'x' });
    await expect(store().editComment('c1', SESSION, 'new body')).resolves.toBe(false);
    expect(store().commentsBySession[SESSION][0].body).toBe('note');
    expect(toastError).toHaveBeenCalledWith('Could not save the comment.');
  });

  it('drops a removed comment', async () => {
    deleteDiffReviewComment.mockResolvedValue({ success: true });
    await store().removeComment('c1', SESSION);
    expect(store().commentsBySession[SESSION].map((c) => c.id)).toEqual(['c2']);
  });
});

describe('loadComments', () => {
  it('toasts and keeps state when the load fails', async () => {
    listDiffReviewComments.mockResolvedValue({ success: false, error: 'x' });
    await store().loadComments(SESSION);
    expect(store().commentsBySession[SESSION]).toBeUndefined();
    expect(toastError).toHaveBeenCalledWith('Could not load comments.');
  });

  describe('mutation during an in-flight load', () => {
    let resolveLoad: (value: unknown) => void;

    beforeEach(async () => {
      listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1'), comment('c2')] });
      await store().loadComments(SESSION);
      listDiffReviewComments.mockReset();
      listDiffReviewComments.mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve; }));
    });

    it('keeps a delete', async () => {
      const loading = store().loadComments(SESSION);
      deleteDiffReviewComment.mockResolvedValue({ success: true });
      await store().removeComment('c1', SESSION);
      listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c2')] });
      resolveLoad({ success: true, comments: [comment('c1'), comment('c2')] });
      await loading;
      expect(store().commentsBySession[SESSION].map((c) => c.id)).toEqual(['c2']);
      expect(listDiffReviewComments).toHaveBeenCalledTimes(2);
    });

    it('keeps an edit', async () => {
      const loading = store().loadComments(SESSION);
      updateDiffReviewComment.mockResolvedValue({ success: true, comment: comment('c1', 'edited') });
      await store().editComment('c1', SESSION, 'edited');
      listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1', 'edited'), comment('c2')] });
      resolveLoad({ success: true, comments: [comment('c1'), comment('c2')] });
      await loading;
      expect(store().commentsBySession[SESSION].map((c) => c.body)).toEqual(['edited', 'note']);
    });

    it('keeps an add', async () => {
      const loading = store().loadComments(SESSION);
      createDiffReviewComment.mockResolvedValue({ success: true, comment: comment('c3') });
      await store().addComment(input);
      listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1'), comment('c2'), comment('c3')] });
      resolveLoad({ success: true, comments: [comment('c1'), comment('c2')] });
      await loading;
      expect(store().commentsBySession[SESSION].map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it('retries only once', async () => {
      const loading = store().loadComments(SESSION);
      deleteDiffReviewComment.mockResolvedValue({ success: true });
      await store().removeComment('c1', SESSION);
      listDiffReviewComments.mockImplementation(async () => {
        await store().removeComment('c2', SESSION);
        return { success: true, comments: [comment('c1'), comment('c2')] };
      });
      resolveLoad({ success: true, comments: [comment('c1'), comment('c2')] });
      await loading;
      expect(listDiffReviewComments).toHaveBeenCalledTimes(2);
      expect(store().commentsBySession[SESSION]).toEqual([]);
    });
  });
});

describe('sendableCommentIds', () => {
  beforeEach(async () => {
    listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1'), comment('c2')] });
    await store().loadComments(SESSION);
  });

  it('returns every id when not held', () => {
    expect(store().sendableCommentIds(SESSION)).toEqual(['c1', 'c2']);
  });

  it('returns none while held', () => {
    store().setHeld(SESSION, true);
    expect(store().sendableCommentIds(SESSION)).toEqual([]);
    store().setHeld(SESSION, false);
    expect(store().sendableCommentIds(SESSION)).toEqual(['c1', 'c2']);
  });
});

describe('forgetComments', () => {
  it('removes only the given ids', async () => {
    listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1'), comment('c2'), comment('c3')] });
    await store().loadComments(SESSION);
    store().forgetComments(SESSION, ['c1', 'c3']);
    expect(store().commentsBySession[SESSION].map((c) => c.id)).toEqual(['c2']);
  });
});

describe('chat-session-loaded event', () => {
  it('loads that session\'s comments', async () => {
    listDiffReviewComments.mockResolvedValue({ success: true, comments: [comment('c1')] });
    emit({ type: 'chat-session-loaded', payload: { projectId: 'p1', chatSessionId: SESSION } });
    await vi.waitFor(() => expect(store().commentsBySession[SESSION]?.length).toBe(1));
    expect(listDiffReviewComments).toHaveBeenCalledWith(SESSION);
  });
});
