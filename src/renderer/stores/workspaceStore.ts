import { create } from 'zustand';
import type { FileNode } from '../../shared/types';
import { readWorkspaceFile, writeWorkspaceFile } from '../services/workspaceFileService';
import {
  readPersistedDocuments,
  writePersistedDocuments,
} from './workspaceDocumentPersistence';

/**
 * File source identifier
 * - 'project': Project folder files
 * - repo ID (any other string): Files from a connected repository
 */
export type FileSource = string;

export interface SelectedFile {
  source: FileSource;
  path: string;
}

export interface OpenDocument {
  /**
   * `${source}:${path}`. Stable across reopens, so clicking a file already in
   * the strip activates that tab instead of adding a second one for it.
   */
  id: string;
  source: FileSource;
  path: string;
  content: string;
  originalContent: string;
  saveError: string | null;
}

export function documentId(source: FileSource, path: string): string {
  return `${source}:${path}`;
}

export function isDocumentDirty(document: OpenDocument): boolean {
  return document.content !== document.originalContent;
}

interface WorkspaceState {
  // Project context
  currentProjectId: string | null;

  // File tree state (keyed by source: 'project' | repoId)
  fileTreesBySource: Record<string, FileNode[]>;
  expandedPaths: Record<string, Set<string>>;
  loadingPaths: Record<string, Set<string>>;
  selectedFile: SelectedFile | null;

  // Editor state — the strip's tab order is the array order
  openDocuments: OpenDocument[];
  activeDocumentId: string | null;
  savingDocumentIds: Set<string>;
  /** Project whose tab arrangement is being written. Set by hydrateOpenDocuments. */
  persistedProjectId: string | null;

  // Actions - Project
  setCurrentProjectId: (projectId: string | null) => void;

  // Actions - File Tree
  setFileTree: (source: FileSource, nodes: FileNode[]) => void;
  toggleExpanded: (source: FileSource, path: string) => void;
  setExpanded: (source: FileSource, path: string, expanded: boolean) => void;
  selectFile: (source: FileSource, path: string) => void;
  clearSelection: () => void;
  setLoadingPath: (source: FileSource, path: string, loading: boolean) => void;

  // Actions - Editor
  openDocument: (source: FileSource, path: string, content: string) => void;
  setActiveDocument: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveDocument: (id: string) => Promise<boolean>;
  closeDocument: (id: string) => Promise<void>;
  discardDocument: (id: string) => void;
  reloadDocument: (id: string, content: string) => void;
  renameDocument: (id: string, newPath: string) => void;
  hydrateOpenDocuments: (projectId: string, shouldContinue?: () => boolean) => Promise<void>;

  // Actions - Reset
  reset: () => void;
  resetProjectState: () => void;
}

const initialState = {
  currentProjectId: null as string | null,
  fileTreesBySource: {} as Record<string, FileNode[]>,
  expandedPaths: {} as Record<string, Set<string>>,
  loadingPaths: {} as Record<string, Set<string>>,
  selectedFile: null as SelectedFile | null,
  openDocuments: [] as OpenDocument[],
  activeDocumentId: null as string | null,
  savingDocumentIds: new Set<string>(),
  persistedProjectId: null as string | null,
};

/**
 * Removes a document from the list and hands the active slot to a neighbour:
 * the tab that took its place, or the one to its left when it was last.
 */
function withoutDocument(state: WorkspaceState, id: string): Partial<WorkspaceState> {
  const index = state.openDocuments.findIndex((document) => document.id === id);
  if (index === -1) return {};

  const openDocuments = state.openDocuments.filter((document) => document.id !== id);
  const activeDocumentId =
    state.activeDocumentId === id
      ? (openDocuments[index] ?? openDocuments[index - 1])?.id ?? null
      : state.activeDocumentId;

  return { openDocuments, activeDocumentId };
}

function withoutSavingId(state: WorkspaceState, id: string): Set<string> {
  const savingDocumentIds = new Set(state.savingDocumentIds);
  savingDocumentIds.delete(id);
  return savingDocumentIds;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...initialState,

  setCurrentProjectId: (projectId) => {
    set({ currentProjectId: projectId });
  },

  setFileTree: (source, nodes) => {
    set((state) => ({
      fileTreesBySource: {
        ...state.fileTreesBySource,
        [source]: nodes,
      },
    }));
  },

  toggleExpanded: (source, path) => {
    const { expandedPaths } = get();
    const sourceExpanded = expandedPaths[source] ?? new Set<string>();
    const newExpanded = new Set(sourceExpanded);

    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }

    set({
      expandedPaths: {
        ...expandedPaths,
        [source]: newExpanded,
      },
    });
  },

  setExpanded: (source, path, expanded) => {
    const { expandedPaths } = get();
    const sourceExpanded = expandedPaths[source] ?? new Set<string>();
    const newExpanded = new Set(sourceExpanded);

    if (expanded) {
      newExpanded.add(path);
    } else {
      newExpanded.delete(path);
    }

    set({
      expandedPaths: {
        ...expandedPaths,
        [source]: newExpanded,
      },
    });
  },

  selectFile: (source, path) => {
    set({ selectedFile: { source, path } });
  },

  clearSelection: () => {
    set({ selectedFile: null });
  },

  setLoadingPath: (source, path, loading) => {
    const { loadingPaths } = get();
    const sourceLoading = loadingPaths[source] ?? new Set<string>();
    const newLoading = new Set(sourceLoading);

    if (loading) {
      newLoading.add(path);
    } else {
      newLoading.delete(path);
    }

    set({
      loadingPaths: {
        ...loadingPaths,
        [source]: newLoading,
      },
    });
  },

  openDocument: (source, path, content) => {
    const id = documentId(source, path);
    set((state) => {
      const existing = state.openDocuments.find((document) => document.id === id);
      if (!existing) {
        return {
          openDocuments: [
            ...state.openDocuments,
            { id, source, path, content, originalContent: content, saveError: null },
          ],
          activeDocumentId: id,
        };
      }

      // Callers re-read the file before opening it, so activating a tab that
      // already has unsaved edits would hand the user back the older on-disk
      // copy. The buffer wins; a clean tab adopts what was just read.
      const openDocuments = isDocumentDirty(existing)
        ? state.openDocuments
        : state.openDocuments.map((document) =>
            document.id === id
              ? { ...document, content, originalContent: content, saveError: null }
              : document
          );

      return { openDocuments, activeDocumentId: id };
    });
  },

  setActiveDocument: (id) => {
    set((state) =>
      state.openDocuments.some((document) => document.id === id) ? { activeDocumentId: id } : {}
    );
  },

  updateContent: (id, content) => {
    set((state) => ({
      openDocuments: state.openDocuments.map((document) =>
        document.id === id ? { ...document, content } : document
      ),
    }));
  },

  saveDocument: async (id) => {
    const { openDocuments, currentProjectId } = get();
    const document = openDocuments.find((candidate) => candidate.id === id);
    if (!document) return false;
    if (!isDocumentDirty(document)) return true;

    // Snapshot what we are about to write: typing during the write must leave
    // the document dirty so autosave comes back for the rest.
    const written = document.content;

    set((state) => ({
      savingDocumentIds: new Set(state.savingDocumentIds).add(id),
      openDocuments: state.openDocuments.map((candidate) =>
        candidate.id === id ? { ...candidate, saveError: null } : candidate
      ),
    }));

    try {
      await writeWorkspaceFile(document.source, document.path, written, currentProjectId);

      set((state) => ({
        openDocuments: state.openDocuments.map((candidate) =>
          candidate.id === id ? { ...candidate, originalContent: written } : candidate
        ),
        savingDocumentIds: withoutSavingId(state, id),
      }));

      return true;
    } catch (error) {
      console.error('[WorkspaceStore] Failed to save file:', error);
      set((state) => ({
        openDocuments: state.openDocuments.map((candidate) =>
          candidate.id === id ? { ...candidate, saveError: String(error) } : candidate
        ),
        savingDocumentIds: withoutSavingId(state, id),
      }));
      return false;
    }
  },

  closeDocument: async (id) => {
    const document = get().openDocuments.find((candidate) => candidate.id === id);
    if (!document) return;

    // Autosave usually got here first; inside its debounce window the buffer is
    // still the only copy of the edit, so closing writes it out rather than
    // asking whether to throw it away. A failed write keeps the tab open with
    // its error instead of closing over content that never reached disk.
    if (isDocumentDirty(document) && !(await get().saveDocument(id))) return;

    set((state) => withoutDocument(state, id));
  },

  /** Close without writing — for a file that is gone from disk. */
  discardDocument: (id) => {
    set((state) => withoutDocument(state, id));
  },

  reloadDocument: (id, content) => {
    set((state) => ({
      openDocuments: state.openDocuments.map((document) =>
        document.id === id
          ? { ...document, content, originalContent: content, saveError: null }
          : document
      ),
    }));
  },

  renameDocument: (id, newPath) => {
    set((state) => {
      const document = state.openDocuments.find((candidate) => candidate.id === id);
      if (!document) return {};

      const newId = documentId(document.source, newPath);
      // The destination is already open (an overwrite), so the renamed tab
      // would be a duplicate of it.
      if (state.openDocuments.some((candidate) => candidate.id === newId)) {
        return withoutDocument(state, id);
      }

      return {
        openDocuments: state.openDocuments.map((candidate) =>
          candidate.id === id ? { ...candidate, id: newId, path: newPath } : candidate
        ),
        activeDocumentId: state.activeDocumentId === id ? newId : state.activeDocumentId,
      };
    });
  },

  /**
   * Reopen the documents that were open when this project was last used.
   *
   * Runs after the project-scoped stores are cleared, and takes a
   * `shouldContinue` guard because another project can be loaded while these
   * reads are still in flight — restoring the previous project's tabs over the
   * new one would be worse than restoring nothing.
   */
  hydrateOpenDocuments: async (projectId, shouldContinue) => {
    const isCurrent = () => (shouldContinue ? shouldContinue() : true);

    // Set first, so tabs opened before or during the restore are still written.
    set({ persistedProjectId: projectId });

    const persisted = readPersistedDocuments(projectId);
    if (!persisted || persisted.open.length === 0) return;

    const restored = await Promise.all(
      persisted.open.map(async (entry) => {
        try {
          const content = await readWorkspaceFile(
            entry.source,
            entry.path,
            entry.source === 'project' ? projectId : null
          );
          return { entry, content };
        } catch {
          // Deleted since last launch, or in a repo that is no longer
          // connected. That tab simply does not come back.
          return null;
        }
      })
    );

    if (!isCurrent()) return;

    for (const document of restored) {
      if (!document) continue;
      get().openDocument(document.entry.source, document.entry.path, document.content);
    }

    // Each open activates its own tab, so the remembered one is restored last.
    if (persisted.active && get().openDocuments.some((d) => d.id === persisted.active)) {
      get().setActiveDocument(persisted.active);
    }
  },

  reset: () => {
    set({
      ...initialState,
      expandedPaths: {},
      loadingPaths: {},
      openDocuments: [],
      savingDocumentIds: new Set<string>(),
    });
  },
  resetProjectState: () => {
    set({
      ...initialState,
      expandedPaths: {},
      loadingPaths: {},
      openDocuments: [],
      savingDocumentIds: new Set<string>(),
    });
  },
}));

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export function useSaveStatus(id: string | null): SaveStatus {
  return useWorkspaceStore((state) => {
    if (!id) return 'saved';
    if (state.savingDocumentIds.has(id)) return 'saving';
    const document = state.openDocuments.find((candidate) => candidate.id === id);
    return document && isDocumentDirty(document) ? 'unsaved' : 'saved';
  });
}

/**
 * Persist the tab arrangement whenever it changes. Keyed off the document ids
 * and the active tab, so typing — which changes content, not arrangement —
 * does not touch localStorage.
 */
let previousArrangement = '';
useWorkspaceStore.subscribe((state) => {
  if (!state.persistedProjectId) return;

  // The project is part of the key so a switch between two projects holding the
  // same files can never look like "nothing changed" and skip a write.
  const arrangement = `${state.persistedProjectId}|${state.openDocuments
    .map((document) => document.id)
    .join(',')}|${state.activeDocumentId ?? ''}`;
  if (arrangement === previousArrangement) return;
  previousArrangement = arrangement;

  writePersistedDocuments(state.persistedProjectId, {
    open: state.openDocuments.map((document) => ({
      source: document.source,
      path: document.path,
    })),
    active: state.activeDocumentId,
  });
});
