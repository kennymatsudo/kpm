import { create } from 'zustand';
import type {
  TrackerTypeMapping,
  SyncQueueEntryWithPlanItem,
  ExportPreview,
  ExportResult,
  StatusCategory,
} from '../../../shared/types';

interface ExportState {
  // Queue state
  queueEntries: SyncQueueEntryWithPlanItem[];
  queueCount: number;
  isLoadingQueue: boolean;

  // Type mappings
  typeMappings: TrackerTypeMapping[];
  isLoadingMappings: boolean;

  // Export preview/execute
  exportPreview: ExportPreview | null;
  isExporting: boolean;
  exportResult: ExportResult | null;

  // UI state
  showQueuePanel: boolean;
  showMappingDialog: boolean;
  activeAssociationId: string | null;
  activeScopeId: string | null;

  // Error state
  error: string | null;

  // Queue actions
  loadQueue: (projectId: string) => Promise<void>;
  addToQueue: (projectId: string, itemIds: string[]) => Promise<{ success: boolean; added?: number; skipped?: number; error?: string }>;
  addToQueueWithStatus: (projectId: string, itemIds: string[], statusCategory: StatusCategory) => Promise<{ success: boolean; error?: string }>;
  removeFromQueue: (queueEntryId: string) => Promise<void>;
  clearQueue: (projectId: string) => Promise<void>;
  refreshQueueCount: (projectId: string) => Promise<void>;

  // Type mapping actions
  loadMappings: (projectId: string) => Promise<void>;
  loadMappingsByScope: (projectId: string, scopeId: string) => Promise<void>;
  saveMapping: (
    projectId: string,
    scopeId: string,
    kpmLabel: string,
    jiraIssueTypeId: string,
    jiraIssueTypeName: string
  ) => Promise<{ success: boolean; error?: string }>;
  removeMapping: (mappingId: string) => Promise<void>;
  createDefaultMappings: (projectId: string, scopeId: string) => Promise<{ success: boolean; error?: string }>;

  // Export actions
  loadExportPreview: (projectId: string, associationId: string) => Promise<void>;

  // UI actions
  setShowQueuePanel: (show: boolean, associationId?: string) => void;
  setShowMappingDialog: (show: boolean, scopeId?: string) => void;
  clearError: () => void;
}

  queueCount: 0,
  isLoadingQueue: false,
  isLoadingMappings: false,
  isExporting: false,
  showQueuePanel: false,
  showMappingDialog: false,

  loadQueue: async (projectId) => {
    set({ isLoadingQueue: true, error: null });
    try {
      if (result.success && result.entries) {
      } else {
        set({ error: result.error || 'Failed to load queue' });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load queue' });
    } finally {
      set({ isLoadingQueue: false });
    }
  },

  addToQueue: async (projectId, itemIds) => {
    set({ error: null });
    try {
      if (result.success) {
        await get().loadQueue(projectId);
        return { success: true, added: result.added, skipped: result.skipped };
      }
      return { success: false, error: result.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to add to queue';
      set({ error });
      return { success: false, error };
    }
  },

  addToQueueWithStatus: async (projectId, itemIds, statusCategory) => {
    set({ error: null });
    try {
      // First add items to queue
      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Then update the status category on the queue entries
      // Get the latest queue to find the entry IDs
      if (queueResult.success && queueResult.entries) {
        const itemIdSet = new Set(itemIds);
        for (const entry of queueResult.entries) {
          if (itemIdSet.has(entry.plan_item_id)) {
          }
        }
      }

      await get().loadQueue(projectId);
      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to add to queue with status';
      set({ error });
      return { success: false, error };
    }
  },

  removeFromQueue: async (queueEntryId) => {
    set({ error: null });
    try {
      if (!result.success) {
        set({ error: result.error || 'Failed to remove from queue' });
        return;
      }
      const entries = get().queueEntries.filter(e => e.id !== queueEntryId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove from queue' });
    }
  },

  clearQueue: async (projectId) => {
    set({ error: null });
    try {
      if (result.success) {
      } else {
        set({ error: result.error || 'Failed to clear queue' });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to clear queue' });
    }
  },

  refreshQueueCount: async (projectId) => {
  },

  loadMappings: async (projectId) => {
    set({ isLoadingMappings: true, error: null });
    try {
      if (result.success && result.mappings) {
        set({ typeMappings: result.mappings });
      } else {
        set({ error: result.error || 'Failed to load mappings' });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load mappings' });
    } finally {
      set({ isLoadingMappings: false });
    }
  },

  loadMappingsByScope: async (projectId, scopeId) => {
    set({ isLoadingMappings: true, error: null });
    try {
      if (result.success && result.mappings) {
        set({ typeMappings: result.mappings });
      } else {
        set({ error: result.error || 'Failed to load mappings' });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load mappings' });
    } finally {
      set({ isLoadingMappings: false });
    }
  },

  saveMapping: async (projectId, scopeId, kpmLabel, jiraIssueTypeId, jiraIssueTypeName) => {
    set({ error: null });
    try {
      if (result.success) {
        await get().loadMappingsByScope(projectId, scopeId);
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save mapping';
      set({ error });
      return { success: false, error };
    }
  },

  removeMapping: async (mappingId) => {
    set({ error: null });
    try {
      if (!result.success) {
        set({ error: result.error || 'Failed to remove mapping' });
      }
      // Remove from local state
      const mappings = get().typeMappings.filter(m => m.id !== mappingId);
      set({ typeMappings: mappings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove mapping' });
    }
  },

  createDefaultMappings: async (projectId, scopeId) => {
    set({ error: null });
    try {
      if (result.success) {
        await get().loadMappingsByScope(projectId, scopeId);
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to create default mappings';
      set({ error });
      return { success: false, error };
    }
  },

  loadExportPreview: async (projectId, associationId) => {
    set({ isExporting: true, exportPreview: null, exportResult: null, error: null });
    try {
      if (result.success && result.preview) {
        set({ exportPreview: result.preview });
      } else {
        set({ error: result.error || 'Failed to load export preview' });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load export preview' });
    } finally {
      set({ isExporting: false });
    }
  },

  setShowQueuePanel: (show, associationId) => {
    set({
      showQueuePanel: show,
      activeAssociationId: show ? (associationId ?? get().activeAssociationId) : null,
    });
    if (!show) {
      set({ exportPreview: null, exportResult: null, error: null });
    }
  },

  setShowMappingDialog: (show, scopeId) => {
    set({
      showMappingDialog: show,
      activeScopeId: show ? (scopeId ?? get().activeScopeId) : null,
    });
    if (!show) {
      set({ error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
