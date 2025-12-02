import { create } from 'zustand';

type ReviewPhase = 'idle' | 'loading' | 'reviewing' | 'summary' | 'exporting' | 'complete';

interface SyncReviewState {
  // Review data
  reviewData: SyncReviewData | null;
  items: SyncReviewItem[];

  // Navigation state
  phase: ReviewPhase;
  currentIndex: number;

  // Results
  exportResult: ExportResult | null;
  error: string | null;

  // Actions
  startReview: (projectId: string, associationId: string) => Promise<void>;
  setDecision: (itemId: string, decision: SyncReviewItem['decision']) => void;
  executeApproved: (projectId: string, associationId: string) => Promise<ExportResult | null>;
  removeFromReview: (itemId: string) => Promise<void>;
  reset: () => void;
}

export const useSyncReviewStore = create<SyncReviewState>((set, get) => ({
  reviewData: null,
  items: [],
  phase: 'idle',
  currentIndex: 0,
  exportResult: null,
  error: null,

  startReview: async (projectId, associationId) => {
    set({ phase: 'loading', error: null, exportResult: null });
    try {
      if (result.success && result.reviewData) {
        set({
          reviewData: result.reviewData,
          items: result.reviewData.items,
          phase: result.reviewData.items.length > 0 ? 'reviewing' : 'summary',
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

  executeApproved: async (projectId, associationId) => {
    const { items } = get();
    const approvedItemIds = items
      .filter((item) => item.decision === 'approved')
      .map((item) => item.planItem.id);

    if (approvedItemIds.length === 0) {
      return null;
    }

    set({ phase: 'exporting', error: null });
    try {
      if (result.success && result.result) {
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

  removeFromReview: async (itemId) => {
    const { items } = get();
    const item = items.find((i) => i.planItem.id === itemId);
    if (!item) return;


    // Remove from the review list entirely (not just mark as removed)
    set((state) => ({
      items: state.items.filter((i) => i.planItem.id !== itemId),
      // Adjust currentIndex if needed
      currentIndex: Math.min(state.currentIndex, state.items.length - 2),
    }));
  },

  reset: () => {
    set({
      reviewData: null,
      items: [],
      phase: 'idle',
      currentIndex: 0,
      exportResult: null,
      error: null,
    });
  },
}));
