import { create } from 'zustand';
import type { DiffReviewComment, NewDiffReviewComment, TurnChanges } from '../../shared/diffReview';
import {
  createDiffReviewComment,
  deleteDiffReviewComment,
  listDiffReviewComments,
  listTurnChanges,
  updateDiffReviewComment,
} from '../services/diffReviewService';
import { subscribe } from './storeEvents';
import { toast } from './toastStore';

interface DiffReviewState {
  commentsBySession: Record<string, DiffReviewComment[]>;
  /** Sessions whose comments the user chose to hold back from the next send. */
  heldBySession: Record<string, boolean>;
  turnChangesBySession: Record<string, TurnChanges[]>;
  loadTurnChanges: (chatSessionId: string) => Promise<void>;
  /** Replaces the entry with the same `clientMessageId`, or appends. */
  applyTurnChanges: (changes: TurnChanges) => void;
  turnChangesFor: (chatSessionId: string, clientMessageId: string) => TurnChanges | undefined;
  /** `isRetry` is set by the store when it re-reads after a stale response. */
  loadComments: (chatSessionId: string, isRetry?: boolean) => Promise<void>;
  addComment: (input: NewDiffReviewComment) => Promise<DiffReviewComment | null>;
  /** Resolves true when the edit was saved. */
  editComment: (id: string, chatSessionId: string, body: string) => Promise<boolean>;
  removeComment: (id: string, chatSessionId: string) => Promise<void>;
  setHeld: (chatSessionId: string, held: boolean) => void;
  /** Ids the next send should carry: none while held. */
  sendableCommentIds: (chatSessionId: string) => string[];
  /** Drop comments the backend accepted and deleted. */
  forgetComments: (chatSessionId: string, ids: string[]) => void;
  resetProjectState: () => void;
}

/**
 * Local mutations per session. A load whose response arrives after one is
 * stale: applying it would undo the edit, bring back a deleted comment, or
 * drop a new one.
 */
const mutationCounts = new Map<string, number>();
const mutationCount = (chatSessionId: string) => mutationCounts.get(chatSessionId) ?? 0;

export const useDiffReviewStore = create<DiffReviewState>()((set, get) => {
  const replaceSession = (chatSessionId: string, comments: DiffReviewComment[]) =>
    set((state) => ({ commentsBySession: { ...state.commentsBySession, [chatSessionId]: comments } }));
  const mutateSession = (chatSessionId: string, comments: DiffReviewComment[]) => {
    mutationCounts.set(chatSessionId, mutationCount(chatSessionId) + 1);
    replaceSession(chatSessionId, comments);
  };
  const currentComments = (chatSessionId: string) => get().commentsBySession[chatSessionId] ?? [];

  return {
    commentsBySession: {},
    heldBySession: {},
    turnChangesBySession: {},

    loadTurnChanges: async (chatSessionId) => {
      const result = await listTurnChanges(chatSessionId);
      if (!result.success) return;
      set((state) => ({ turnChangesBySession: { ...state.turnChangesBySession, [chatSessionId]: result.turns } }));
    },

    applyTurnChanges: (changes) =>
      set((state) => {
        const existing = state.turnChangesBySession[changes.chatSessionId] ?? [];
        const index = existing.findIndex((turn) => turn.clientMessageId === changes.clientMessageId);
        const next = index === -1 ? [...existing, changes] : existing.map((turn, i) => (i === index ? changes : turn));
        return { turnChangesBySession: { ...state.turnChangesBySession, [changes.chatSessionId]: next } };
      }),

    turnChangesFor: (chatSessionId, clientMessageId) =>
      get().turnChangesBySession[chatSessionId]?.find((turn) => turn.clientMessageId === clientMessageId),

    loadComments: async (chatSessionId, isRetry = false) => {
      const startedAt = mutationCount(chatSessionId);
      const result = await listDiffReviewComments(chatSessionId);
      if (!result.success) {
        toast.error('Could not load comments.');
        return;
      }
      if (mutationCount(chatSessionId) !== startedAt) {
        if (!isRetry) await get().loadComments(chatSessionId, true);
        return;
      }
      replaceSession(chatSessionId, result.comments);
    },

    addComment: async (input) => {
      const result = await createDiffReviewComment(input);
      if (!result.success) {
        toast.error('Could not save the comment.');
        return null;
      }
      mutateSession(input.chatSessionId, [...currentComments(input.chatSessionId), result.comment]);
      return result.comment;
    },

    editComment: async (id, chatSessionId, body) => {
      const result = await updateDiffReviewComment(id, body);
      if (!result.success) {
        toast.error('Could not save the comment.');
        return false;
      }
      mutateSession(
        chatSessionId,
        currentComments(chatSessionId).map((comment) => (comment.id === id ? result.comment : comment)),
      );
      return true;
    },

    removeComment: async (id, chatSessionId) => {
      const result = await deleteDiffReviewComment(id);
      if (!result.success) {
        toast.error('Could not delete the comment.');
        return;
      }
      mutateSession(chatSessionId, currentComments(chatSessionId).filter((comment) => comment.id !== id));
    },

    setHeld: (chatSessionId, held) =>
      set((state) => ({ heldBySession: { ...state.heldBySession, [chatSessionId]: held } })),

    sendableCommentIds: (chatSessionId) =>
      get().heldBySession[chatSessionId] ? [] : currentComments(chatSessionId).map((comment) => comment.id),

    forgetComments: (chatSessionId, ids) => {
      const forgotten = new Set(ids);
      mutateSession(chatSessionId, currentComments(chatSessionId).filter((comment) => !forgotten.has(comment.id)));
    },

    resetProjectState: () => set({ commentsBySession: {}, heldBySession: {}, turnChangesBySession: {} }),
  };
});

subscribe('chat-session-loaded', (event) => {
  void useDiffReviewStore.getState().loadComments(event.payload.chatSessionId);
  void useDiffReviewStore.getState().loadTurnChanges(event.payload.chatSessionId);
});
