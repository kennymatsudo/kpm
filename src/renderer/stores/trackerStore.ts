import { create } from 'zustand';
import type {
  TrackerAssociationWithScope,
  ImportPreview,
  ImportResult,
} from '../../shared/types';

interface TrackerState {
  associations: TrackerAssociationWithScope[];
  isLoadingAssociations: boolean;

  // Import state
  isImporting: boolean;
  importProgress: {
    phase: 'fetching' | 'importing' | 'complete';
    fetched?: number;
    current?: number;
    total?: number;
  } | null;
  importPreview: ImportPreview | null;
  importError: string | null;

  // UI state
  showAssociationDialog: boolean;
  showImportPanel: boolean;
  activeAssociationId: string | null;

  // Error state
  error: string | null;

  // Association actions
  loadAssociations: (projectId: string) => Promise<void>;
  removeAssociation: (associationId: string) => Promise<void>;
  hasAssociationItems: (associationId: string) => Promise<boolean>;

  // Import actions
  fetchImportPreview: (projectId: string, associationId: string) => Promise<boolean>;
  applyImport: (projectId: string, associationId: string, selectedTypes: string[]) => Promise<ImportResult | null>;
  importAll: (projectId: string, associationId: string) => Promise<ImportResult | null>;
  clearImport: () => void;

  // UI actions
  setShowAssociationDialog: (show: boolean) => void;
  setShowImportPanel: (show: boolean, associationId?: string) => void;
  clearError: () => void;

  // Progress listener setup
  setupImportProgressListener: () => () => void;
}

  isLoadingAssociations: false,
  isImporting: false,
  showAssociationDialog: false,
  showImportPanel: false,

  loadAssociations: async (projectId) => {
    set({ isLoadingAssociations: true, error: null });
    try {
      set({ associations });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load associations' });
    } finally {
      set({ isLoadingAssociations: false });
    }
  },

    set({ error: null });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    await get().loadAssociations(projectId);
    return { success: true };
  },

  removeAssociation: async (associationId) => {
    const { associations } = get();
    const association = associations.find(a => a.id === associationId);
    if (!association) return;

    set({ error: null });
    try {
      await get().loadAssociations(association.kpm_project_id);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove association' });
    }
  },

  hasAssociationItems: (associationId) => {
  },

  fetchImportPreview: async (projectId, associationId) => {
    set({
      isImporting: true,
      importProgress: { phase: 'fetching' },
      importError: null,
      importPreview: null,
    });

    try {
      if (result.success && result.preview) {
        set({
          importPreview: result.preview,
          importError: null,
        });
        return true;
      } else {
        set({ importError: result.error || 'Failed to load preview' });
        return false;
      }
    } catch (e) {
      set({ importError: e instanceof Error ? e.message : 'Failed to load preview' });
      return false;
    } finally {
      set({ isImporting: false, importProgress: null });
    }
  },

  applyImport: async (projectId, associationId, selectedTypes) => {
    set({
      isImporting: true,
      importProgress: { phase: 'importing' },
      importError: null,
    });

    try {
      if (result.success && result.result) {
        set({
          importPreview: null,
          showImportPanel: false,
          activeAssociationId: null,
        });
        // Reload associations to update last_synced_at
        await get().loadAssociations(projectId);
        return result.result;
      } else {
        set({ importError: result.error || 'Import failed' });
        return null;
      }
    } catch (e) {
      set({ importError: e instanceof Error ? e.message : 'Import failed' });
      return null;
    } finally {
      set({ isImporting: false, importProgress: null });
    }
  },

  importAll: async (projectId, associationId) => {
    set({
      isImporting: true,
      importProgress: { phase: 'fetching' },
      importError: null,
      activeAssociationId: associationId,
    });

    try {
      if (result.success && result.result) {
        set({
          importPreview: null,
          showImportPanel: false,
          activeAssociationId: null,
        });
        // Reload associations to update last_synced_at
        await get().loadAssociations(projectId);
        return result.result;
      } else {
        set({ importError: result.error || 'Import failed' });
        return null;
      }
    } catch (e) {
      set({ importError: e instanceof Error ? e.message : 'Import failed' });
      return null;
    } finally {
      set({ isImporting: false, importProgress: null });
    }
  },

  clearImport: () => {
    set({
      importPreview: null,
      importError: null,
      showImportPanel: false,
      activeAssociationId: null,
    });
  },

  setShowAssociationDialog: (show) => set({ showAssociationDialog: show }),

  setShowImportPanel: (show, associationId) => {
    set({
      showImportPanel: show,
      activeAssociationId: show ? (associationId ?? get().activeAssociationId) : null,
    });
    if (!show) {
      set({ importPreview: null, importError: null });
    }
  },

  clearError: () => set({ error: null, importError: null }),

  setupImportProgressListener: () => {
      const { phase, fetched, current, total } = data;
      set({
        importProgress: {
          phase: (phase as 'fetching' | 'importing' | 'complete') ?? 'fetching',
          fetched,
          current,
          total,
        },
      });
    });
  },
}));

// Selector for checking if any associations exist (avoids re-renders on association changes)
export const useHasAssociations = () => useTrackerStore(state => state.associations.length > 0);
