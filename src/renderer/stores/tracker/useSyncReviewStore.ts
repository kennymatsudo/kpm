import { create } from 'zustand';
import type {
  CustomFieldValues,
  SyncReviewData,
  SyncReviewItem,
  SyncReviewDeleteItem,
  ExportResult,
} from '../../../shared/types';
import {
  executeApprovedTrackerExport,
  getTrackerExportReview,
} from '../../services/trackerService';
import { emit } from '../storeEvents';

type ReviewPhase = 'idle' | 'loading' | 'reviewing' | 'summary' | 'exporting' | 'complete';

interface SyncReviewState {
  // Review data
  reviewData: SyncReviewData | null;
  items: SyncReviewItem[];
  deleteItems: SyncReviewDeleteItem[];

  // Navigation state
  phase: ReviewPhase;
  currentIndex: number;

  // Results
  exportResult: ExportResult | null;
  error: string | null;

  // Actions
  startReview: (projectId: string, associationId: string) => Promise<void>;
  /**
   * Approve or un-approve one item. Approving is parent-transitive: an unsynced
   * ancestor has to go out in the same batch or its child lands in the tracker
   * as an orphan. Un-approving is deliberately not transitive -- an approved
   * child keeps its decision, and the export re-includes the parent it needs.
   * An item with validation errors can never be approved.
   */
  toggleItemApproval: (itemId: string) => void;
  /** Approve every valid item, or return them all to pending once they all are. */
  toggleAllValid: () => void;
  /** Deletes are keyed by queue entry id (no plan item) and have no hierarchy. */
  setDeleteDecision: (queueEntryId: string, decision: SyncReviewDeleteItem['decision']) => void;
  executeApproved: (projectId: string, associationId: string) => Promise<ExportResult | null>;
  removeFromReview: (itemId: string) => Promise<void>;
  removeDeleteFromReview: (queueEntryId: string) => Promise<void>;
  updateCustomFieldOverrides: (queueEntryId: string, overrides: CustomFieldValues | null) => Promise<void>;
  reset: () => void;
  resetProjectState: () => void;
}

const initialState = {
  reviewData: null,
  items: [],
  deleteItems: [],
  phase: 'idle' as ReviewPhase,
  currentIndex: 0,
  exportResult: null,
  error: null,
};

function indexByPlanItem(items: SyncReviewItem[]): Map<string, SyncReviewItem> {
  return new Map(items.map((item) => [item.planItem.id, item]));
}

function isApprovable(item: SyncReviewItem): boolean {
  return item.validationErrors.length === 0;
}

export const useSyncReviewStore = create<SyncReviewState>((set, get) => ({
  ...initialState,

  startReview: async (projectId, associationId) => {
    set({ phase: 'loading', error: null, exportResult: null });
    try {
      const result = await getTrackerExportReview(projectId, associationId);
      if (result.success) {
        const hasReviewable = result.reviewData.items.length > 0 || result.reviewData.deleteItems.length > 0;
        set({
          reviewData: result.reviewData,
          items: result.reviewData.items,
          deleteItems: result.reviewData.deleteItems,
          phase: hasReviewable ? 'reviewing' : 'summary',
          currentIndex: 0,
        });
      } else {
        set({ error: result.error || 'Failed to load review data', phase: 'idle' });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load review data', phase: 'idle' });
    }
  },

  toggleItemApproval: (itemId) => {
    set((state) => {
      const byPlanItem = indexByPlanItem(state.items);
      const item = byPlanItem.get(itemId);
      if (!item || !isApprovable(item)) return {};

      if (item.decision === 'approved') {
        return {
          items: state.items.map((candidate) =>
            candidate.planItem.id === itemId ? { ...candidate, decision: 'pending' as const } : candidate
          ),
        };
      }

      const approving = new Set<string>([itemId]);
      const walked = new Set<string>();
      let parentId = item.planItem.parent_id;
      while (parentId && !walked.has(parentId)) {
        walked.add(parentId);
        const parent = byPlanItem.get(parentId);
        if (!parent) break;
        if (!parent.planItem.external_key && isApprovable(parent)) {
          approving.add(parent.planItem.id);
        }
        parentId = parent.planItem.parent_id;
      }

      return {
        items: state.items.map((candidate) =>
          approving.has(candidate.planItem.id) ? { ...candidate, decision: 'approved' as const } : candidate
        ),
      };
    });
  },

  toggleAllValid: () => {
    set((state) => {
      const approvable = state.items.filter(isApprovable);
      if (approvable.length === 0) return {};

      const decision = approvable.every((item) => item.decision === 'approved')
        ? ('pending' as const)
        : ('approved' as const);
      return {
        items: state.items.map((item) => (isApprovable(item) ? { ...item, decision } : item)),
      };
    });
  },

  setDeleteDecision: (queueEntryId, decision) => {
    set((state) => ({
      deleteItems: state.deleteItems.map((item) =>
        item.queueEntry.id === queueEntryId ? { ...item, decision } : item
      ),
    }));
  },

  executeApproved: async (projectId, associationId) => {
    const { items, deleteItems } = get();
    const approvedItemIds = items
      .filter((item) => item.decision === 'approved')
      .map((item) => item.planItem.id);
    const approvedDeleteIds = deleteItems
      .filter((item) => item.decision === 'approved')
      .map((item) => item.queueEntry.id);

    if (approvedItemIds.length === 0 && approvedDeleteIds.length === 0) {
      return null;
    }

    set({ phase: 'exporting', error: null });
    try {
      const result = await executeApprovedTrackerExport(projectId, associationId, approvedItemIds, approvedDeleteIds);
      if (result.success) {
        emit({
          type: 'tracker-export-completed',
          payload: { projectId, associationId },
        });
        set({ exportResult: result.result, phase: 'complete' });
        return result.result;
      } else {
        set({ error: result.error || 'Export failed', phase: 'summary' });
        return null;
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Export failed', phase: 'summary' });
      return null;
    }
  },

  removeFromReview: (itemId) => {
    const { items } = get();
    const item = items.find((i) => i.planItem.id === itemId);
    if (!item) return Promise.resolve();

    emit({
      type: 'sync-review-item-removed',
      payload: { queueEntryId: item.queueEntry.id },
    });

    // Remove from the review list entirely (not just mark as removed)
    set((state) => ({
      items: state.items.filter((i) => i.planItem.id !== itemId),
      // Adjust currentIndex if needed
      currentIndex: Math.min(state.currentIndex, state.items.length - 2),
    }));

    return Promise.resolve();
  },

  removeDeleteFromReview: (queueEntryId) => {
    emit({
      type: 'sync-review-item-removed',
      payload: { queueEntryId },
    });

    set((state) => ({
      deleteItems: state.deleteItems.filter((i) => i.queueEntry.id !== queueEntryId),
    }));

    return Promise.resolve();
  },

  updateCustomFieldOverrides: (queueEntryId, overrides) => {
    emit({
      type: 'sync-review-custom-field-overrides-updated',
      payload: { queueEntryId, overrides },
    });

    set((state) => ({
      items: state.items.map((item) =>
        item.queueEntry.id === queueEntryId
          ? { ...item, queueEntry: { ...item.queueEntry, custom_field_overrides: overrides } }
          : item
      ),
    }));

    return Promise.resolve();
  },

  reset: () => set(initialState),
  resetProjectState: () => get().reset(),
}));
