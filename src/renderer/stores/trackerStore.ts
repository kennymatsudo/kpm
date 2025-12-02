import { create } from 'zustand';
import type {
  ImportPreview,
  ImportResult,
} from '../../shared/types';

interface TrackerState {
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

  loadAssociations: (projectId: string) => Promise<void>;
  removeAssociation: (associationId: string) => Promise<void>;
  hasAssociationItems: (associationId: string) => Promise<boolean>;

  applyImport: (projectId: string, associationId: string, selectedTypes: string[]) => Promise<ImportResult | null>;
  clearImport: () => void;

  setShowAssociationDialog: (show: boolean) => void;
  setShowImportPanel: (show: boolean, associationId?: string) => void;
  clearError: () => void;

  // Progress listener setup
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
