/**
 * Linear Documents Store
 *
 * State for documents published from this project to Linear. Link rows are the
 * only source: nothing here fetches from Linear on render, so the published
 * state a user sees is what KPM recorded at the last sync.
 */

import { create } from 'zustand';
import type { LinearDocumentLink, SyncDirection } from '../../shared/types';
import {
  getLinearDocumentSyncPreview,
  listLinearDocumentLinks,
  pullLinearDocument,
  publishLinearDocument,
  pushLinearDocument,
  setLinearDocumentDirection,
  unlinkLinearDocument,
} from '../services/linearDocumentsService';
import {
  createDocumentSyncState,
  initialDocumentSyncState,
  type DocumentSyncState,
} from './documentSyncState';

interface LinearDocumentsState extends DocumentSyncState {
  links: LinearDocumentLink[];
  isLoading: boolean;
  error: string | null;

  loadLinks: (projectId: string) => Promise<void>;
  publishDocument: (
    projectId: string,
    documentPath: string,
    target: { kind: 'project' | 'issue'; id: string },
    title: string,
    direction: SyncDirection,
    documentId: string
  ) => Promise<{ success: boolean; error?: string }>;
  unlinkDocument: (projectId: string, documentPath: string) => Promise<boolean>;
  setDirection: (
    projectId: string,
    documentPath: string,
    direction: SyncDirection
  ) => Promise<boolean>;
  getLinkForDocument: (documentPath: string) => LinearDocumentLink | null;

  resetProjectState: () => void;
}

const initialState = {
  links: [],
  isLoading: false,
  error: null,
};

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const useLinearDocumentsStore = create<LinearDocumentsState>((set, get) => ({
  ...initialState,
  ...createDocumentSyncState(set, {
    getPreview: getLinearDocumentSyncPreview,
    push: pushLinearDocument,
    pull: pullLinearDocument,
    previewFailureMessage: 'Failed to load sync preview',
    pushFailureMessage: 'Failed to push to Linear',
    pullFailureMessage: 'Failed to pull from Linear',
    afterSuccessfulSync: async (projectId) => {
      await get().loadLinks(projectId);
    },
  }),

  loadLinks: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await listLinearDocumentLinks({ projectId });
      set({ links: result.data, isLoading: false });
    } catch (error) {
      set({ error: toMessage(error, 'Failed to load Linear documents'), isLoading: false });
    }
  },

  publishDocument: async (projectId, documentPath, target, title, direction, documentId) => {
    try {
      const result = await publishLinearDocument({
        projectId,
        documentPath,
        target,
        title,
        direction,
        documentId,
      });
      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to publish to Linear' };
      }
      set((state) => ({ links: [...state.links, result.data] }));
      return { success: true };
    } catch (error) {
      return { success: false, error: toMessage(error, 'Failed to publish to Linear') };
    }
  },

  unlinkDocument: async (projectId, documentPath) => {
    try {
      const result = await unlinkLinearDocument({ projectId, documentPath });
      if (result.success) {
        set((state) => ({
          links: state.links.filter((link) => link.document_path !== documentPath),
        }));
      }
      return result.success;
    } catch {
      return false;
    }
  },

  setDirection: async (projectId, documentPath, direction) => {
    try {
      const result = await setLinearDocumentDirection({ projectId, documentPath, direction });
      if (result.success) {
        set((state) => ({
          links: state.links.map((link) =>
            link.document_path === documentPath ? { ...link, direction } : link
          ),
        }));
      }
      return result.success;
    } catch {
      return false;
    }
  },

  getLinkForDocument: (documentPath) =>
    get().links.find((link) => link.document_path === documentPath) ?? null,

  resetProjectState: () =>
    set({ ...initialState, ...initialDocumentSyncState }),
}));
