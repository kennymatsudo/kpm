/**
 * Approval Queue Store
 *
 * Manages a unified queue for all pending approvals from Claude:
 * - Plan actions (create/update/delete plan items)
 * - Project context file edits (AGENTS.md / CLAUDE.md)
 * - Document updates (markdown files in the project folder)
 *
 * Items are queued and processed one at a time in manual review mode to prevent
 * UI conflicts when Claude proposes multiple changes in a single response.
 * In auto-apply mode, process methods execute the same backing operations
 * immediately without rendering approval UI.
 *
 * Also contains process methods (called by IPC bridge when events arrive)
 * and execute methods (called by approval modal when user approves or by
 * process methods in auto-apply mode).
 */

import { create } from 'zustand';
import { isContextFile } from '../../shared/contextFile';
import type { PlanAction } from '../../shared/types';
import type { ApplyPlanActionsResult } from './project/types';
import { usePlanDomainStore } from './projectDomains';
import { useDevSessionsStore } from './devSessions';
import { useGeneralSettingsStore } from './generalSettingsStore';
import { useFileTreeStore } from './fileTreeStore';
import { toast } from './toastStore';
import { replyToSessionReviewThread } from '../services/reviewService';
import { writeClaudeMdFile } from '../services/contextFileService';
import { writeProjectFile, deleteProjectFile } from '../services/workspaceFileService';
import { getParentPath } from '../utils/path';

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

export interface PendingDeleteItem {
  type: 'delete';
  id: string;
  filePath: string;
  isDirectory: boolean;
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
  | PendingDeleteItem
  | PendingReviewReplyItem;

// =============================================================================
// Store Interface
// =============================================================================

interface ApprovalQueueState {
  /** Queue of pending approval items (FIFO order) */
  queue: ApprovalItem[];

  /**
   * True iff the user explicitly minimized the panel this batch.
   * Resets to false on any meaningful new enqueue (new item, new file, new
   * plan-actions batch) so subsequent approvals always surface. Same-file
   * dedupes during streaming preserve the user's minimize choice.
   */
  userMinimized: boolean;

  /** Current width of the approval side panel in pixels (user-resizable). */
  panelWidth: number;

  setUserMinimized: (minimized: boolean) => void;
  setPanelWidth: (width: number) => void;

  // ───────────────────────────────────────────────────────────────────────────
  // Enqueue methods
  // ───────────────────────────────────────────────────────────────────────────

  /** Add a plan actions approval to the queue */
  enqueuePlanActions: (actions: PlanAction[]) => void;

  /** Add a project context file edit to the queue */
  enqueueClaudeMdEdit: (oldContent: string | null, newContent: string) => void;

  /** Add a document update to the queue */
  enqueueDocumentUpdate: (filePath: string, content: string, oldContent: string | null) => void;

  /** Add a file/folder deletion to the queue */
  enqueueFileDelete: (filePath: string, isDirectory: boolean) => void;

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
  // Changes are queued for review or auto-applied based on the global setting.
  // ───────────────────────────────────────────────────────────────────────────

  /** Process plan actions from Claude */
  processPlanActions: (projectId: string, actions: PlanAction[]) => void;

  /** Process project context file update from Claude */
  processClaudeMdUpdate: (
    projectId: string,
    oldContent: string | null,
    newContent: string
  ) => void;

  /** Process document/file update from Claude */
  processFileUpdate: (
    projectId: string,
    filePath: string,
    content: string,
    oldContent: string | null,
    options?: { forceReview?: boolean }
  ) => void;

  /** Process a file/folder deletion proposal from Claude */
  processFileDelete: (
    projectId: string,
    filePath: string,
    isDirectory: boolean
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

  /**
   * Execute plan actions. `success` is true only when the batch committed
   * without an outright error; `warning` is set when it committed but some
   * actions were skipped (or nothing was applied), so callers can dequeue
   * without falsely reporting a clean apply.
   */
  executePlanActions: (actions: PlanAction[]) => Promise<{ success: boolean; error?: string; warning?: string }>;

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

  /** Execute a file/folder deletion */
  executeFileDelete: (
    projectId: string,
    filePath: string
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

function shouldAutoApplyApprovals(): boolean {
  const settings = useGeneralSettingsStore.getState();
  if (!settings.approvalModeLoaded) {
    void settings.loadApprovalMode();
  }
  return settings.approvalMode === 'auto_apply';
}

/**
 * Translate a plan-apply outcome into an approval result. Only a batch that
 * committed with every action applied reports a clean `success` with no
 * warning; an outright rejection is a failure (retryable), while skips or an
 * empty apply commit but carry a warning so the UI never claims "applied" when
 * nothing (or only part) landed.
 */
export function planApplyToApprovalOutcome(
  result: ApplyPlanActionsResult
): { success: boolean; error?: string; warning?: string } {
  if (result.error) {
    return { success: false, error: result.error };
  }
  if (result.skipped.length > 0) {
    const summary = result.skipped.map((s) => `${s.type}: ${s.reason}`).join('; ');
    return {
      success: true,
      warning:
        result.applied > 0
          ? `${result.applied} change(s) applied, ${result.skipped.length} skipped: ${summary}`
          : `No changes applied — ${result.skipped.length} skipped: ${summary}`,
    };
  }
  if (result.applied === 0) {
    return { success: true, warning: 'No changes were applied' };
  }
  return { success: true };
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useApprovalQueueStore = create<ApprovalQueueState>((set, get) => ({
  queue: [],
  userMinimized: false,
  panelWidth: 560,

  setUserMinimized: (minimized) => set({ userMinimized: minimized }),
  setPanelWidth: (width) => set({ panelWidth: width }),

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
        return { queue: updatedQueue, userMinimized: false };
      }

      return { queue: [...state.queue, newItem], userMinimized: false };
    });
  },

  enqueueClaudeMdEdit: (oldContent, newContent) => {
    set((state) => {
      // Replace any existing claude-md item (user should handle one at a time).
      // Preserve the *first* event's oldContent so the diff shown is original
      // disk → latest proposal, not intermediate → latest.
      const existing = state.queue.find(
        (item): item is PendingClaudeMdItem => item.type === 'claude-md'
      );
      const newItem: PendingClaudeMdItem = {
        type: 'claude-md',
        id: existing?.id ?? generateId(),
        oldContent: existing?.oldContent ?? oldContent,
        newContent,
      };
      const filtered = state.queue.filter((item) => item.type !== 'claude-md');
      // Same-content replacement during streaming preserves the user's minimize
      // choice; a brand-new claude-md edit re-opens the panel.
      return existing
        ? { queue: [...filtered, newItem] }
        : { queue: [...filtered, newItem], userMinimized: false };
    });
  },

  enqueueDocumentUpdate: (filePath, content, oldContent) => {
    set((state) => {
      // Check if there's already a pending update for the same file path
      const existingIndex = state.queue.findIndex(
        (item) => item.type === 'document' && item.filePath === filePath
      );

      if (existingIndex !== -1) {
        // Same-file replacement — Claude is still editing this file. Preserve
        // both the *first* event's oldContent (so the diff stays anchored to
        // the original disk content) and the user's minimize choice.
        const existing = state.queue[existingIndex] as PendingDocumentItem;
        const updatedQueue = [...state.queue];
        updatedQueue[existingIndex] = {
          ...existing,
          content,
        };
        return { queue: updatedQueue };
      }

      const newItem: PendingDocumentItem = {
        type: 'document',
        id: generateId(),
        filePath,
        content,
        oldContent,
      };

      // New file (first or different) — surface it.
      return { queue: [...state.queue, newItem], userMinimized: false };
    });
  },

  enqueueFileDelete: (filePath, isDirectory) => {
    set((state) => {
      // Dedupe repeat proposals for the same path; keep a single confirmation.
      const existing = state.queue.find(
        (item): item is PendingDeleteItem => item.type === 'delete' && item.filePath === filePath
      );
      if (existing) return state;

      const newItem: PendingDeleteItem = {
        type: 'delete',
        id: generateId(),
        filePath,
        isDirectory,
      };
      return { queue: [...state.queue, newItem], userMinimized: false };
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
      return { queue: [...filtered, newItem], userMinimized: false };
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
    set({ queue: [], userMinimized: false });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Process Methods - Queue or auto-apply changes
  // ─────────────────────────────────────────────────────────────────────────

  processPlanActions: (_projectId, actions) => {
    if (actions.length === 0) return;

    if (!shouldAutoApplyApprovals()) {
      get().enqueuePlanActions(actions);
      return;
    }

    void (async () => {
      const result = await get().executePlanActions(actions);
      if (!result.success) {
        toast.error(`Failed to apply plan changes: ${result.error}`);
      } else if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success('Plan changes applied');
      }
    })();
  },

  processClaudeMdUpdate: (projectId, oldContent, newContent) => {
    if (!shouldAutoApplyApprovals()) {
      get().enqueueClaudeMdEdit(oldContent, newContent);
      return;
    }

    void (async () => {
      const result = await get().executeClaudeMdWrite(projectId, newContent);
      if (result.success) {
        toast.success('Project context updated');
      } else {
        toast.error(`Failed to update project context file: ${result.error}`);
      }
    })();
  },

  processFileUpdate: (projectId, filePath, content, oldContent, options) => {
    void (async () => {
      const forceReview = options?.forceReview ?? false;
      // Handle project context files specially
      if (isContextFile(filePath)) {
        if (forceReview || !shouldAutoApplyApprovals()) {
          get().enqueueClaudeMdEdit(oldContent, content);
          return;
        }

        const result = await get().executeClaudeMdWrite(projectId, content);
        if (result.success) {
          toast.success('Project context updated');
        } else {
          toast.error(`Failed to update project context file: ${result.error}`);
        }
        return;
      }

      if (forceReview || !shouldAutoApplyApprovals()) {
        get().enqueueDocumentUpdate(filePath, content, oldContent);
        return;
      }

      const result = await get().executeFileWrite(projectId, filePath, content);
      if (result.success) {
        const parentPath = getParentPath(filePath, '');
        void useFileTreeStore.getState().refreshDirectory(parentPath);
        toast.success(`Updated ${filePath}`);
      } else {
        toast.error(`Failed to update ${filePath}: ${result.error}`);
      }
    })();
  },

  processFileDelete: (projectId, filePath, isDirectory) => {
    if (!shouldAutoApplyApprovals()) {
      get().enqueueFileDelete(filePath, isDirectory);
      return;
    }

    void (async () => {
      const result = await get().executeFileDelete(projectId, filePath);
      if (result.success) {
        const parentPath = getParentPath(filePath, '');
        void useFileTreeStore.getState().refreshDirectory(parentPath);
        toast.success(`Deleted ${filePath}`);
      } else {
        toast.error(`Failed to delete ${filePath}: ${result.error}`);
      }
    })();
  },

  processReviewReplyDraft: (draft) => {
    get().enqueueReviewReply(draft);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Execute Methods - Called by approval modal when user approves
  // ─────────────────────────────────────────────────────────────────────────

  executePlanActions: async (actions) => {
    try {
      const result = await usePlanDomainStore.getState().executePlanActions(actions);
      return planApplyToApprovalOutcome(result);
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

  executeFileDelete: async (projectId, filePath) => {
    try {
      const result = await deleteProjectFile(projectId, filePath);
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  executeReviewReply: async (draft) => {
    try {
      const result = await replyToSessionReviewThread({ sessionId: draft.sessionId, threadId: draft.threadId, body: draft.body, resolve: draft.resolve });
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to post review reply' };
      }

      if (result.inbox) {
        const inbox = result.inbox;
        useDevSessionsStore.setState((state) => {
          const reviewInboxBySessionId = new Map(state.reviewInboxBySessionId);
          reviewInboxBySessionId.set(draft.sessionId, inbox);

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

