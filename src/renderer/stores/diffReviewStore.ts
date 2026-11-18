import { create } from 'zustand';
import type { DiffReviewComment, NewDiffReviewComment } from '../../shared/diffReview';
import {
  createDiffReviewComment,
  deleteDiffReviewComment,
  listDiffReviewComments,
  updateDiffReviewComment,
} from '../services/diffReviewService';
import { subscribe } from './storeEvents';
import { toast } from './toastStore';

interface DiffReviewState {
  commentsBySession: Record<string, DiffReviewComment[]>;
  /** Sessions whose comments the user chose to hold back from the next send. */
  heldBySession: Record<string, boolean>;
  loadComments: (chatSessionId: string) => Promise<void>;
  addComment: (input: NewDiffReviewComment) => Promise<DiffReviewComment | null>;
  editComment: (id: string, chatSessionId: string, body: string) => Promise<void>;
  removeComment: (id: string, chatSessionId: string) => Promise<void>;
  setHeld: (chatSessionId: string, held: boolean) => void;
  /** Ids the next send should carry: none while held. */
  sendableCommentIds: (chatSessionId: string) => string[];
  /** Drop comments the backend accepted and deleted. */
  forgetComments: (chatSessionId: string, ids: string[]) => void;
  resetProjectState: () => void;
}

export const useDiffReviewStore = create<DiffReviewState>()((set, get) => {
  const replaceSession = (chatSessionId: string, comments: DiffReviewComment[]) =>
    set((state) => ({ commentsBySession: { ...state.commentsBySession, [chatSessionId]: comments } }));
  const currentComments = (chatSessionId: string) => get().commentsBySession[chatSessionId] ?? [];

  return {
    commentsBySession: {},
    heldBySession: {},

    loadComments: async (chatSessionId) => {
      const result = await listDiffReviewComments(chatSessionId);
      if (!result.success) {
        toast.error('Could not load comments.');
        return;
      }
      // Merge by id: a comment added while this load was in flight is not in
      // the response and must survive.
      const loadedIds = new Set(result.comments.map((comment) => comment.id));
      const localOnly = currentComments(chatSessionId).filter((comment) => !loadedIds.has(comment.id));
      replaceSession(chatSessionId, [...result.comments, ...localOnly]);
    },

    addComment: async (input) => {
      const result = await createDiffReviewComment(input);
      if (!result.success) {
        toast.error('Could not save the comment.');
        return null;
      }
      replaceSession(input.chatSessionId, [...currentComments(input.chatSessionId), result.comment]);
      return result.comment;
    },

    editComment: async (id, chatSessionId, body) => {
      const result = await updateDiffReviewComment(id, body);
      if (!result.success) {
        toast.error('Could not save the comment.');
        return;
      }
      replaceSession(
        chatSessionId,
        currentComments(chatSessionId).map((comment) => (comment.id === id ? result.comment : comment)),
      );
    },

    removeComment: async (id, chatSessionId) => {
      const result = await deleteDiffReviewComment(id);
      if (!result.success) {
        toast.error('Could not delete the comment.');
        return;
      }
      replaceSession(chatSessionId, currentComments(chatSessionId).filter((comment) => comment.id !== id));
    },

    setHeld: (chatSessionId, held) =>
      set((state) => ({ heldBySession: { ...state.heldBySession, [chatSessionId]: held } })),

    sendableCommentIds: (chatSessionId) =>
      get().heldBySession[chatSessionId] ? [] : currentComments(chatSessionId).map((comment) => comment.id),

    forgetComments: (chatSessionId, ids) => {
      const forgotten = new Set(ids);
      replaceSession(chatSessionId, currentComments(chatSessionId).filter((comment) => !forgotten.has(comment.id)));
    },

    resetProjectState: () => set({ commentsBySession: {}, heldBySession: {} }),
  };
});

subscribe('chat-session-loaded', (event) => {
  void useDiffReviewStore.getState().loadComments(event.payload.chatSessionId);
});
