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
  setDecision: (itemId: string, decision: SyncReviewItem['decision']) => void;
  setDecisions: (itemIds: string[], decision: SyncReviewItem['decision']) => void;
  /** Deletes are keyed by queue entry id (no plan item) and never touched by setDecisions. */
  setDeleteDecision: (queueEntryId: string, decision: SyncReviewDeleteItem['decision']) => void;
  executeApproved: (projectId: string, associationId: string) => Promise<ExportResult | null>;
  removeFromReview: (itemId: string) => Promise<void>;
  removeDeleteFromReview: (queueEntryId: string) => Promise<void>;
  updateCustomFieldOverrides: (queueEntryId: string, overrides: CustomFieldValues | null) => Promise<void>;
  reset: () => void;
  resetProjectState: () => void;
}

export const useSyncReviewStore = create<SyncReviewState>((set, get) => ({
  reviewData: null,
  items: [],
  deleteItems: [],
  phase: 'idle',
  currentIndex: 0,
  exportResult: null,
  error: null,

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

  setDecision: (itemId, decision) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.planItem.id === itemId ? { ...item, decision } : item
      ),
    }));
  },

  setDecisions: (itemIds, decision) => {
    const selectedIds = new Set(itemIds);
    set((state) => ({
      items: state.items.map((item) =>
        selectedIds.has(item.planItem.id) ? { ...item, decision } : item
      ),
    }));
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

  reset: () => {
    set({
      reviewData: null,
      items: [],
      deleteItems: [],
      phase: 'idle',
      currentIndex: 0,
      exportResult: null,
      error: null,
    });
  },
  resetProjectState: () => {
    set({
      reviewData: null,
      items: [],
      deleteItems: [],
      phase: 'idle',
      currentIndex: 0,
      exportResult: null,
      error: null,
    });
  },
}));
