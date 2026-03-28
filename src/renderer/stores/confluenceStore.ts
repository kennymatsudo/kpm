/**
 * Confluence Store
 *
 * State management for Confluence document sync.
 */

import { create } from 'zustand';
import type { ConfluencePageLink, ConfluenceSyncPreview } from '../../shared/types';
import {
  getConfluenceSyncPreview,
  linkConfluenceDocument,
  listConfluenceLinks,
  pullConfluenceDocument,
  pushConfluenceDocument,
  unlinkConfluenceDocument,
} from '../services/confluenceService';

interface ConfluenceState {
  // Links state
  links: ConfluencePageLink[];
  isLoading: boolean;
  error: string | null;

  // Sync preview state
  syncPreview: ConfluenceSyncPreview | null;
  isSyncing: boolean;
  syncError: string | null;

  // Actions
  setLinks: (links: ConfluencePageLink[]) => void;
  setError: (error: string | null) => void;
  setSyncPreview: (preview: ConfluenceSyncPreview | null) => void;
  setSyncError: (error: string | null) => void;

  // Async operations
  loadLinks: (projectId: string) => Promise<void>;
  linkDocument: (projectId: string, documentPath: string, confluenceUrl: string) => Promise<{ success: boolean; error?: string }>;
  unlinkDocument: (projectId: string, documentPath: string) => Promise<boolean>;
  loadSyncPreview: (projectId: string, documentPath: string) => Promise<void>;
  executePush: (projectId: string, documentPath: string) => Promise<{ success: boolean; pageUrl?: string; error?: string }>;
  executePull: (projectId: string, documentPath: string) => Promise<boolean>;
  isDocumentLinked: (documentPath: string) => boolean;
  getLinkForDocument: (documentPath: string) => ConfluencePageLink | null;

  // Reset
  reset: () => void;
}

const initialState = {
  links: [],
  isLoading: false,
  error: null,
  syncPreview: null,
  isSyncing: false,
  syncError: null,
};

export const useConfluenceStore = create<ConfluenceState>((set, get) => ({
  ...initialState,

  // State setters
  setLinks: (links) => set({ links }),
  setError: (error) => set({ error }),
  setSyncPreview: (syncPreview) => set({ syncPreview }),
  setSyncError: (syncError) => set({ syncError }),

  // Async operations
  loadLinks: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await listConfluenceLinks(projectId);
      if (result.success && result.data) {
        set({ links: result.data, isLoading: false });
      } else {
        set({ error: result.error ?? 'Failed to load Confluence links', isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load Confluence links',
        isLoading: false,
      });
    }
  },

  linkDocument: async (projectId, documentPath, confluenceUrl) => {
    try {
      const result = await linkConfluenceDocument(projectId, documentPath, confluenceUrl);
      if (result.success && result.data) {
        set((state) => ({
          links: [...state.links, result.data!],
        }));
        return { success: true };
      }
      return { success: false, error: result.error ?? 'Failed to link document' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to link document',
      };
    }
  },

  unlinkDocument: async (projectId, documentPath) => {
    try {
      const result = await unlinkConfluenceDocument(projectId, documentPath);
      if (result.success) {
        set((state) => ({
          links: state.links.filter((l) => l.document_path !== documentPath),
        }));
      }
      return result.success;
    } catch {
      return false;
    }
  },

  loadSyncPreview: async (projectId, documentPath) => {
    set({ isSyncing: true, syncError: null, syncPreview: null });
    try {
      const result = await getConfluenceSyncPreview(projectId, documentPath);
      if (result.success && result.data) {
        set({ syncPreview: result.data, isSyncing: false });
      } else {
        set({ syncError: result.error ?? 'Failed to load sync preview', isSyncing: false });
      }
    } catch (error) {
      set({
        syncError: error instanceof Error ? error.message : 'Failed to load sync preview',
        isSyncing: false,
      });
    }
  },

  executePush: async (projectId, documentPath) => {
    set({ isSyncing: true, syncError: null });
    try {
      const result = await pushConfluenceDocument(projectId, documentPath);
      set({ isSyncing: false });
      if (result.success && result.data) {
        return { success: true, pageUrl: result.data.pageUrl };
      }
      return { success: false, error: result.error ?? 'Failed to push to Confluence' };
    } catch (error) {
      set({ isSyncing: false });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to push to Confluence',
      };
    }
  },

  executePull: async (projectId, documentPath) => {
    set({ isSyncing: true, syncError: null });
    try {
      const result = await pullConfluenceDocument(projectId, documentPath);
      set({ isSyncing: false });
      return result.success;
    } catch {
      set({ isSyncing: false });
      return false;
    }
  },

  isDocumentLinked: (documentPath) => {
    return get().links.some((l) => l.document_path === documentPath);
  },

  getLinkForDocument: (documentPath) => {
    return get().links.find((l) => l.document_path === documentPath) ?? null;
  },

  reset: () => set(initialState),
}));
