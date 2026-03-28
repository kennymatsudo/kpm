import { create } from 'zustand';
import type {
  TrackerAssociationWithScope,
  ImportPreview,
  ImportResult,
} from '../../shared/types';
import {
  addTrackerAssociation,
  applyTrackerImport,
  getTrackerImportPreview,
  importAllTrackerItems,
  listTrackerAssociations,
  removeTrackerAssociation,
  subscribeToTrackerImportProgress,
  trackerAssociationHasImportedItems,
  updateTrackerAssociationEpicKey,
} from '../services/trackerService';

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
  getAssociationById: (associationId: string) => TrackerAssociationWithScope | null;
  updateAssociationEpicKey: (associationId: string, epicKey: string | null) => Promise<{ success: boolean; error?: string }>;
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

  // Reset
  reset: () => void;
}

const initialState = {
  associations: [] as TrackerAssociationWithScope[],
  isLoadingAssociations: false,
  isImporting: false,
  importProgress: null as TrackerState['importProgress'],
  importPreview: null as ImportPreview | null,
  importError: null as string | null,
  showAssociationDialog: false,
  showImportPanel: false,
  activeAssociationId: null as string | null,
  error: null as string | null,
};

export const useTrackerStore = create<TrackerState>((set, get) => ({
  ...initialState,

  loadAssociations: async (projectId) => {
    set({ isLoadingAssociations: true, error: null });
    try {
      const associations = await listTrackerAssociations(projectId);
      set({ associations });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load associations' });
    } finally {
      set({ isLoadingAssociations: false });
    }
  },

  getAssociationById: (associationId) => {
    return get().associations.find((association) => association.id === associationId) ?? null;
  },

    set({ error: null });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    await get().loadAssociations(projectId);
    return { success: true };
  },

  updateAssociationEpicKey: async (associationId, epicKey) => {
    const association = get().getAssociationById(associationId);

    set({ error: null });
    try {
      const result = await updateTrackerAssociationEpicKey(associationId, epicKey);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to update epic key' };
      }

      if (association) {
        await get().loadAssociations(association.kpm_project_id);
      }

      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to update epic key';
      set({ error });
      return { success: false, error };
    }
  },

  removeAssociation: async (associationId) => {
    const { associations } = get();
    const association = associations.find(a => a.id === associationId);
    if (!association) return;

    set({ error: null });
    try {
      await removeTrackerAssociation(associationId);
      await get().loadAssociations(association.kpm_project_id);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove association' });
    }
  },

  hasAssociationItems: (associationId) => {
    return trackerAssociationHasImportedItems(associationId);
  },

  fetchImportPreview: async (projectId, associationId) => {
    set({
      isImporting: true,
      importProgress: { phase: 'fetching' },
      importError: null,
      importPreview: null,
    });

    try {
      const result = await getTrackerImportPreview(projectId, associationId);
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
      const result = await applyTrackerImport(projectId, associationId, selectedTypes);
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
      const result = await importAllTrackerItems(projectId, associationId);
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
    return subscribeToTrackerImportProgress((data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => {
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

  reset: () => set(initialState),
}));

// Selector for checking if any associations exist (avoids re-renders on association changes)
export const useHasAssociations = () => useTrackerStore(state => state.associations.length > 0);
