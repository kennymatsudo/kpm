/**
 * Approval Queue Store
 *
 * Manages a unified queue for all pending approvals from Claude:
 * - Plan actions (create/update/delete plan items)
 *
 */

import { create } from 'zustand';

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

export type ApprovalItem =
  | PendingPlanActionsItem
  | PendingClaudeMdItem
  | PendingDocumentItem

// =============================================================================
// Store Interface
// =============================================================================

interface ApprovalQueueState {
  /** Queue of pending approval items (FIFO order) */
  queue: ApprovalItem[];

  /** Add a plan actions approval to the queue */
  enqueuePlanActions: (actions: PlanAction[]) => void;

  enqueueClaudeMdEdit: (oldContent: string | null, newContent: string) => void;

  /** Add a document update to the queue */
  enqueueDocumentUpdate: (filePath: string, content: string, oldContent: string | null) => void;

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
}));

