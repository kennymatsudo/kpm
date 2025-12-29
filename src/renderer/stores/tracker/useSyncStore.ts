import { create } from 'zustand';
import type {
  SyncPreview,
  SyncResult,
  ConflictResolution,
  DeletedItemAction,
} from '../../../shared/types';
interface SyncState {
  isSyncing: boolean;
  syncProgress: { phase: string; current: number; total: number } | null;
  syncPreview: SyncPreview | null;
  error: string | null;

  // Conflict resolutions (user selections)
  resolutions: Record<string, ConflictResolution>;
  deletedAction: DeletedItemAction;
  deletedDecisions: Record<string, 'keep' | 'delete'>;

  // UI state
  showPanel: boolean;
  activeAssociationId: string | null;

  // Actions
  startSync: (projectId: string, associationId: string) => Promise<void>;
  setResolution: (planItemId: string, resolution: ConflictResolution) => void;
  setDeletedAction: (action: DeletedItemAction) => void;
  setDeletedDecision: (planItemId: string, decision: 'keep' | 'delete') => void;
  applySync: (projectId: string, onComplete?: () => Promise<void>) => Promise<SyncResult | null>;
  discardSync: () => void;
  setShowPanel: (show: boolean, associationId?: string) => void;
  clearError: () => void;

  // Progress listener setup
  setupProgressListener: () => () => void;

  // Reset
  reset: () => void;
}

const initialState = {
  isSyncing: false,
  syncProgress: null as SyncState['syncProgress'],
  syncPreview: null as SyncPreview | null,
  error: null as string | null,
  resolutions: {} as Record<string, ConflictResolution>,
  deletedAction: 'decide_each' as DeletedItemAction,
  deletedDecisions: {} as Record<string, 'keep' | 'delete'>,
  showPanel: false,
  activeAssociationId: null as string | null,
};

export const useSyncStore = create<SyncState>((set, get) => ({
  ...initialState,

  startSync: async (projectId, associationId) => {
    set({
      isSyncing: true,
      syncProgress: null,
      error: null,
      syncPreview: null,
      resolutions: {},
      deletedDecisions: {},
      deletedAction: 'decide_each',
      activeAssociationId: associationId,
    });

    try {
        set({
          showPanel: true,
        });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load sync preview' });
    } finally {
      set({ isSyncing: false, syncProgress: null });
    }
  },

  setResolution: (planItemId, resolution) => {
    set(state => ({
      resolutions: { ...state.resolutions, [planItemId]: resolution },
    }));
  },

  setDeletedAction: (action) => {
    set({ deletedAction: action });
  },

  setDeletedDecision: (planItemId, decision) => {
    set(state => ({
      deletedDecisions: { ...state.deletedDecisions, [planItemId]: decision },
    }));
  },

  applySync: async (projectId, onComplete) => {
    const { syncPreview, resolutions, deletedAction, deletedDecisions } = get();
    if (!syncPreview) return null;

    set({ isSyncing: true, error: null });

    try {
        projectId,
        syncPreview,
        resolutions,
        deletedAction,
        deletedDecisions
      );

      if (result.success && result.result) {
        set({
          syncPreview: null,
          showPanel: false,
          resolutions: {},
          deletedDecisions: {},
          activeAssociationId: null,
        });
        // Allow caller to reload associations or other data
        await onComplete?.();
        return result.result;
      } else {
        set({ error: result.error || 'Sync failed' });
        return null;
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Sync failed' });
      return null;
    } finally {
      set({ isSyncing: false });
    }
  },

  discardSync: () => {
    set({
      syncPreview: null,
      error: null,
      showPanel: false,
      resolutions: {},
      deletedDecisions: {},
      activeAssociationId: null,
    });
  },

  setShowPanel: (show, associationId) => {
    set({
      showPanel: show,
      activeAssociationId: show ? (associationId ?? get().activeAssociationId) : null,
    });
    if (!show) {
      set({ syncPreview: null, error: null, resolutions: {}, deletedDecisions: {} });
    }
  },

  clearError: () => set({ error: null }),

  setupProgressListener: () => {
      const { phase, current, total } = data;
      set({
        syncProgress: { phase, current, total },
      });
    });
  },

}));
