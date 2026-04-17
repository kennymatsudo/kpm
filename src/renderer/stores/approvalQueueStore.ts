/**
 * Approval Queue Store
 *
 * Manages a unified queue for all pending approvals from Claude:
 * - Plan actions (create/update/delete plan items)
 * - Project context file edits (AGENTS.md / CLAUDE.md)
 * - Document updates (markdown files in the project folder)
 *
 *
 * Also contains process methods (called by IPC bridge when events arrive)
 */

import { create } from 'zustand';
import { isContextFile } from '../../shared/contextFile';
import { useDevSessionsStore } from './devSessions';
import { replyToSessionReviewThread } from '../services/reviewService';
import { writeClaudeMdFile } from '../services/contextFileService';

// =============================================================================
// Approval Item Types (Discriminated Union)
// =============================================================================

export interface PendingPlanActionsItem {
  type: 'plan-actions';
  id: string;
  actions: PlanAction[];
}

export interface PendingClaudeMdItem {
  type: 'claude-md';
  id: string;
  oldContent: string | null;
  newContent: string;
}

export interface PendingDocumentItem {
  type: 'document';
  id: string;
  filePath: string;
  content: string;
  oldContent: string | null;
}

export interface PendingReviewReplyItem {
  type: 'review-reply';
  id: string;
  sessionId: string;
  threadId: string;
  threadUrl: string;
  threadTitle: string;
  threadLocation: string;
  latestCommentPreview: string | null;
  body: string;
  resolve: boolean;
}

export type ApprovalItem =
  | PendingPlanActionsItem
  | PendingClaudeMdItem
  | PendingDocumentItem
  | PendingReviewReplyItem;

// =============================================================================
// Store Interface
// =============================================================================

interface ApprovalQueueState {
  /** Queue of pending approval items (FIFO order) */
  queue: ApprovalItem[];

  /**
   */
  // ───────────────────────────────────────────────────────────────────────────
  // Enqueue methods
  // ───────────────────────────────────────────────────────────────────────────

  /** Add a plan actions approval to the queue */
  enqueuePlanActions: (actions: PlanAction[]) => void;

  /** Add a project context file edit to the queue */
  enqueueClaudeMdEdit: (oldContent: string | null, newContent: string) => void;

  /** Add a document update to the queue */
  enqueueDocumentUpdate: (filePath: string, content: string, oldContent: string | null) => void;

  /** Add a staged GitHub review reply for approval */
  enqueueReviewReply: (draft: Omit<PendingReviewReplyItem, 'type' | 'id'>) => void;

  /** Remove the current (first) item from the queue */
  dequeue: () => void;

  /** Remove a specific item by ID */
  removeById: (id: string) => void;

  /** Clear all items from the queue */
  clearQueue: () => void;

  /** Get the current (first) item to display */
  currentItem: () => ApprovalItem | null;

  /** Get count of items in queue */
  queueLength: () => number;

  /** Reset queue and expand counter. Called on project switch. */
  resetProjectState: () => void;

  // ───────────────────────────────────────────────────────────────────────────
  // Process methods — called by useChatIpcBridge when IPC events arrive.
  // ───────────────────────────────────────────────────────────────────────────

  processPlanActions: (projectId: string, actions: PlanAction[]) => void;

  processClaudeMdUpdate: (
    projectId: string,
    oldContent: string | null,
    newContent: string
  ) => void;

  processFileUpdate: (
    projectId: string,
    filePath: string,
    content: string,
  ) => void;

  /** Process a staged GitHub review reply draft - queues for approval */
  processReviewReplyDraft: (draft: {
    sessionId: string;
    threadId: string;
    threadUrl: string;
    threadTitle: string;
    threadLocation: string;
    latestCommentPreview: string | null;
    body: string;
    resolve: boolean;
  }) => void;

  // ───────────────────────────────────────────────────────────────────────────
  // Execute methods — called by approval modal when user approves.
  // ───────────────────────────────────────────────────────────────────────────

  /** Execute plan actions */
  executePlanActions: (actions: PlanAction[]) => Promise<{ success: boolean; error?: string }>;

  /** Execute project context file write */
  executeClaudeMdWrite: (
    projectId: string,
    content: string
  ) => Promise<{ success: boolean; error?: string }>;

  /** Execute file write */
  executeFileWrite: (
    projectId: string,
    filePath: string,
    content: string
  ) => Promise<{ success: boolean; error?: string }>;

  /** Execute a staged GitHub review reply */
  executeReviewReply: (draft: {
    sessionId: string;
    threadId: string;
    body: string;
    resolve: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
}

// =============================================================================
// Helper to generate unique IDs
// =============================================================================

let idCounter = 0;
function generateId(): string {
  return `approval-${Date.now()}-${++idCounter}`;
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useApprovalQueueStore = create<ApprovalQueueState>((set, get) => ({
  queue: [],

  // ─────────────────────────────────────────────────────────────────────────
  // Enqueue Methods
  // ─────────────────────────────────────────────────────────────────────────

  enqueuePlanActions: (actions) => {
    if (actions.length === 0) return;

    const newItem: PendingPlanActionsItem = {
      type: 'plan-actions',
      id: generateId(),
      actions,
    };

    set((state) => {
      // For plan actions, we merge with any existing plan-actions item
      // (same behavior as before - replace by item_id)
      const existingPlanActionsIndex = state.queue.findIndex(
        (item) => item.type === 'plan-actions'
      );

      if (existingPlanActionsIndex !== -1) {
        const existing = state.queue[existingPlanActionsIndex] as PendingPlanActionsItem;
        const existingByItemId = new Map<string, number>();
        existing.actions.forEach((action, index) => {
          if ('item_id' in action) {
            existingByItemId.set(action.item_id, index);
          }
        });

        const merged = [...existing.actions];
        for (const newAction of actions) {
          if ('item_id' in newAction) {
            const existingIndex = existingByItemId.get(newAction.item_id);
            if (existingIndex !== undefined) {
              merged[existingIndex] = newAction;
            } else {
              merged.push(newAction);
              existingByItemId.set(newAction.item_id, merged.length - 1);
            }
          } else {
            merged.push(newAction);
          }
        }

        const updatedQueue = [...state.queue];
        updatedQueue[existingPlanActionsIndex] = {
          ...existing,
          actions: merged,
        };
      }

    });
  },

  enqueueClaudeMdEdit: (oldContent, newContent) => {
    set((state) => {
      const filtered = state.queue.filter((item) => item.type !== 'claude-md');
    });
  },

  enqueueDocumentUpdate: (filePath, content, oldContent) => {
    set((state) => {
      // Check if there's already a pending update for the same file path
      const existingIndex = state.queue.findIndex(
        (item) => item.type === 'document' && item.filePath === filePath
      );

      if (existingIndex !== -1) {
        const updatedQueue = [...state.queue];
        return { queue: updatedQueue };
      }

    });
  },

  enqueueReviewReply: (draft) => {
    const newItem: PendingReviewReplyItem = {
      type: 'review-reply',
      id: generateId(),
      ...draft,
    };

    set((state) => {
      const filtered = state.queue.filter((item) => (
        item.type !== 'review-reply' ||
        item.sessionId !== draft.sessionId ||
        item.threadId !== draft.threadId
      ));
    });
  },

  dequeue: () => {
    set((state) => ({
      queue: state.queue.slice(1),
    }));
  },

  removeById: (id) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.id !== id),
    }));
  },

  clearQueue: () => {
    set({ queue: [] });
  },

  currentItem: () => {
    const { queue } = get();
    return queue.length > 0 ? queue[0] : null;
  },

  queueLength: () => {
    return get().queue.length;
  },

  resetProjectState: () => {
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  processPlanActions: (_projectId, actions) => {
    if (actions.length === 0) return;

  },

      return;
    }

  },

  processReviewReplyDraft: (draft) => {
    get().enqueueReviewReply(draft);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Execute Methods - Called by approval modal when user approves
  // ─────────────────────────────────────────────────────────────────────────

  executePlanActions: async (actions) => {
    try {
      await usePlanDomainStore.getState().executePlanActions(actions);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  executeClaudeMdWrite: async (projectId, content) => {
    try {
      const result = await writeClaudeMdFile(projectId, content);
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  executeFileWrite: async (projectId, filePath, content) => {
    try {
      const result = await writeProjectFile(projectId, filePath, content);
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  executeReviewReply: async (draft) => {
    try {
      const result = await replyToSessionReviewThread(draft.sessionId, draft.threadId, draft.body, draft.resolve);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to post review reply' };
      }

      if (result.inbox) {
        useDevSessionsStore.setState((state) => {
          const reviewInboxBySessionId = new Map(state.reviewInboxBySessionId);

          const reviewErrorBySessionId = new Map(state.reviewErrorBySessionId);
          reviewErrorBySessionId.set(draft.sessionId, null);

          return {
            reviewInboxBySessionId,
            reviewErrorBySessionId,
          };
        });
      }

      const projectId = useDevSessionsStore.getState().projectId;
      if (projectId) {
        await useDevSessionsStore.getState().loadSessions(projectId);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
}));

