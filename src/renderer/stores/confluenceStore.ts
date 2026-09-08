/**
 * Confluence Store
 *
 * State management for Confluence document sync.
 */

import { create } from 'zustand';
import type { ConfluencePageLink } from '../../shared/types';
import {
  getConfluenceSyncPreview,
  linkConfluenceDocument,
  listConfluenceLinks,
  pullConfluenceDocument,
  pushConfluenceDocument,
  unlinkConfluenceDocument,
} from '../services/confluenceService';
import {
  createDocumentSyncState,
  initialDocumentSyncState,
  type DocumentSyncState,
} from './documentSyncState';

interface ConfluenceState extends DocumentSyncState {
  // Links state
  links: ConfluencePageLink[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setLinks: (links: ConfluencePageLink[]) => void;
  setError: (error: string | null) => void;

  // Async operations
  loadLinks: (projectId: string) => Promise<void>;
  linkDocument: (projectId: string, documentPath: string, confluenceUrl: string) => Promise<{ success: boolean; error?: string }>;
  unlinkDocument: (projectId: string, documentPath: string) => Promise<boolean>;
  isDocumentLinked: (documentPath: string) => boolean;
  getLinkForDocument: (documentPath: string) => ConfluencePageLink | null;

  // Reset
  reset: () => void;
}

const initialState = {
  links: [],
  isLoading: false,
  error: null,
};

export const useConfluenceStore = create<ConfluenceState>((set, get) => ({
  ...initialState,

  // State setters
  setLinks: (links) => set({ links }),
  setError: (error) => set({ error }),
  ...createDocumentSyncState(set, {
    getPreview: getConfluenceSyncPreview,
    push: pushConfluenceDocument,
    pull: pullConfluenceDocument,
    previewFailureMessage: 'Failed to load sync preview',
    pushFailureMessage: 'Failed to push to Confluence',
    pullFailureMessage: 'Failed to pull from Confluence',
  }),

  // Async operations
  loadLinks: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await listConfluenceLinks({ projectId });
      set({ links: result.data, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load Confluence links',
        isLoading: false,
      });
    }
  },

  linkDocument: async (projectId, documentPath, confluenceUrl) => {
    try {
      const result = await linkConfluenceDocument({ projectId, documentPath, confluenceUrl });
      if (result.success) {
        const linked = result.data;
        set((state) => ({
          links: [...state.links, linked],
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
      const result = await unlinkConfluenceDocument({ projectId, documentPath });
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

  isDocumentLinked: (documentPath) => {
    return get().links.some((l) => l.document_path === documentPath);
  },

  getLinkForDocument: (documentPath) => {
    return get().links.find((l) => l.document_path === documentPath) ?? null;
  },

  reset: () => set({ ...initialState, ...initialDocumentSyncState }),
}));
