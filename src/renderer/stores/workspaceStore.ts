import { create } from 'zustand';
import type { FileNode } from '../../shared/types';

/**
 * File source identifier
 * - 'project': Project folder files
 */

export interface SelectedFile {
  source: FileSource;
  path: string;
}

export interface EditingFile {
  source: FileSource;
  path: string;
  content: string;
  originalContent: string;
  isReadOnly: boolean;
}

interface WorkspaceState {
  // Project context
  currentProjectId: string | null;

  // File tree state (keyed by source: 'project' | repoId)
  fileTreesBySource: Record<string, FileNode[]>;
  expandedPaths: Record<string, Set<string>>;
  loadingPaths: Record<string, Set<string>>;
  selectedFile: SelectedFile | null;

  // Editor state
  editingFile: EditingFile | null;
  isSaving: boolean;
  saveError: string | null;

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
  openFile: (source: FileSource, path: string, content: string, isReadOnly: boolean) => void;
  updateContent: (content: string) => void;
  saveFile: () => Promise<boolean>;
  closeEditor: () => void;

  // Actions - Reset
  reset: () => void;
}

const initialState = {
  currentProjectId: null as string | null,
  fileTreesBySource: {} as Record<string, FileNode[]>,
  expandedPaths: {} as Record<string, Set<string>>,
  loadingPaths: {} as Record<string, Set<string>>,
  selectedFile: null as SelectedFile | null,
  editingFile: null as EditingFile | null,
  isSaving: false,
  saveError: null as string | null,
};

/**
 * Editable file extensions - these can be edited in the workspace
 * Code files are read-only
 */
const EDITABLE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.toml'];

export function isEditableFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return EDITABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
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

  openFile: (source, path, content, isReadOnly) => {
    set({
      editingFile: {
        source,
        path,
        content,
        originalContent: content,
        isReadOnly,
      },
      saveError: null,
    });
  },

  updateContent: (content) => {
    const { editingFile } = get();
    if (!editingFile || editingFile.isReadOnly) return;

    set({
      editingFile: {
        ...editingFile,
        content,
      },
    });
  },

  saveFile: async () => {
    const { editingFile, currentProjectId } = get();
    if (!editingFile || editingFile.isReadOnly) return false;
    if (editingFile.content === editingFile.originalContent) return true;

    set({ isSaving: true, saveError: null });

    try {

      set({
        editingFile: {
          ...editingFile,
          originalContent: editingFile.content,
        },
        isSaving: false,
      });

      return true;
    } catch (error) {
      console.error('[WorkspaceStore] Failed to save file:', error);
      set({
        saveError: String(error),
        isSaving: false,
      });
      return false;
    }
  },

  closeEditor: () => {
    set({
      editingFile: null,
      saveError: null,
    });
  },

  reset: () => {
    set({
      ...initialState,
      expandedPaths: {},
      loadingPaths: {},
    });
  },
}));

/**
 * Check if the current file has unsaved changes
 */
export function useHasUnsavedChanges(): boolean {
  return useWorkspaceStore((state) => {
    if (!state.editingFile) return false;
    return state.editingFile.content !== state.editingFile.originalContent;
  });
}
