import { create } from 'zustand';
import type { FileNode } from '../../shared/types';
import { getBaseName, getParentPath } from '../utils/path';

/** Information about a recently changed file */
interface RecentlyChangedInfo {
  type: 'created' | 'modified';
  timestamp: number;
}

/** Phantom input state for creating a new file or folder */
interface CreatingItem {
  type: 'file' | 'folder';
  parentPath: string;
}

interface FileTreeState {
  // Data
  projectId: string | null;
  nodes: FileNode[];
  expandedPaths: Set<string>;
  focusedPaths: Set<string>;
  renamingPath: string | null;
  /** Phantom input state for inline file/folder creation */
  creatingItem: CreatingItem | null;
  /** Tracks recently changed files for visual highlighting */
  recentlyChangedPaths: Map<string, RecentlyChangedInfo>;

  // Loading state
  isLoading: boolean;
  loadingPaths: Set<string>;
  error: string | null;

  // Actions
  setProjectId: (projectId: string | null) => void;
  setNodes: (nodes: FileNode[]) => void;
  toggleExpanded: (path: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  toggleFocused: (path: string) => void;
  setFocused: (paths: string[]) => void;
  clearFocused: () => void;
  setRenamingPath: (path: string | null) => void;
  /** Begin inline creation of a new file or folder */
  setCreatingItem: (item: CreatingItem | null) => void;
  /** Create the item on disk and select it in the tree */
  createItemAndSelect: (name: string) => Promise<void>;
  /** Mark a path as recently changed (will auto-clear after 3 seconds) */
  markRecentlyChanged: (path: string, type: 'created' | 'modified') => void;
  /** Clear recently changed status for a path */
  clearRecentlyChanged: (path: string) => void;
  /** Expand tree to reveal a file path, loading intermediate directories as needed */
  expandToPath: (projectId: string, path: string) => Promise<void>;

  // File operations
  loadDirectory: (projectId: string, path?: string) => Promise<void>;
  refreshDirectory: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<FileNode | null>;
  createFile: (path: string, content?: string) => Promise<FileNode | null>;
  createSymlink: (targetPath: string, linkPath: string) => Promise<FileNode | null>;
  deleteEntry: (path: string) => Promise<boolean>;
  rename: (oldPath: string, newPath: string) => Promise<FileNode | null>;
  moveEntry: (sourcePath: string, targetFolderPath: string) => Promise<FileNode | null>;

  // Utility
  getNodeByPath: (path: string) => FileNode | null;
  getChildrenOfPath: (path: string) => FileNode[];

  // Reset
  reset: () => void;
}

const initialState = {
  projectId: null as string | null,
  nodes: [] as FileNode[],
  expandedPaths: new Set<string>(),
  focusedPaths: new Set<string>(),
  renamingPath: null as string | null,
  creatingItem: null as CreatingItem | null,
  recentlyChangedPaths: new Map<string, RecentlyChangedInfo>(),
  isLoading: false,
  loadingPaths: new Set<string>(),
  error: null as string | null,
};

/**
 * Find a node in a tree by path
 */
function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Update nodes in tree at a specific path with new children
 */
function updateNodesAtPath(nodes: FileNode[], parentPath: string, children: FileNode[]): FileNode[] {
  return nodes.map(node => {
    if (node.path === parentPath) {
      return { ...node, children };
    }
    if (node.children) {
      return { ...node, children: updateNodesAtPath(node.children, parentPath, children) };
    }
    return node;
  });
}

/**
 * Remove a node from tree by path
 */
function removeNodeByPath(nodes: FileNode[], path: string): FileNode[] {
  return nodes
    .filter(node => node.path !== path)
    .map(node => {
      if (node.children) {
        return { ...node, children: removeNodeByPath(node.children, path) };
      }
      return node;
    });
}

/**
 * Add a node to the tree at the correct location
 */
function addNodeToTree(nodes: FileNode[], newNode: FileNode): FileNode[] {
  const parentPath = getParentPath(newNode.path);

  if (parentPath === '') {
    // Add to root level
    const newNodes = [...nodes, newNode];
    return sortNodes(newNodes);
  }

  // Add to parent's children
  return nodes.map(node => {
    if (node.path === parentPath && node.isDirectory) {
      const children = node.children ? [...node.children, newNode] : [newNode];
      return { ...node, children: sortNodes(children) };
    }
    if (node.children) {
      return { ...node, children: addNodeToTree(node.children, newNode) };
    }
    return node;
  });
}

/**
 * Sort nodes: directories first, then alphabetically
 */
function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  ...initialState,

  setProjectId: (projectId) => set({ projectId }),

  setNodes: (nodes) => set({ nodes }),


  toggleExpanded: (path) => {
    const { expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    set({ expandedPaths: newExpanded });
  },

  setExpanded: (path, expanded) => {
    const { expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    if (expanded) {
      newExpanded.add(path);
    } else {
      newExpanded.delete(path);
    }
    set({ expandedPaths: newExpanded });
  },

  toggleFocused: (path) => {
    const { focusedPaths } = get();
    const newFocused = new Set(focusedPaths);
    if (newFocused.has(path)) {
      newFocused.delete(path);
    } else {
      newFocused.add(path);
    }
    set({ focusedPaths: newFocused });
  },

  setFocused: (paths) => {
    set({ focusedPaths: new Set(paths) });
  },

  clearFocused: () => {
    set({ focusedPaths: new Set() });
  },

  setRenamingPath: (path) => set({ renamingPath: path }),

  setCreatingItem: (item) => set({ creatingItem: item, renamingPath: null }),

  createItemAndSelect: async (name) => {
    const { creatingItem } = get();
    if (!creatingItem) return;

    const path = creatingItem.parentPath
      ? `${creatingItem.parentPath}/${name}`
      : name;

    const node = creatingItem.type === 'folder'
      ? await get().createFolder(path)
      : await get().createFile(path);

    if (node) {
      get().markRecentlyChanged(node.path, 'created');
    } else {
      set({ creatingItem: null });
    }
  },

  markRecentlyChanged: (path, type) => {
    const { recentlyChangedPaths } = get();
    const newMap = new Map(recentlyChangedPaths);
    newMap.set(path, { type, timestamp: Date.now() });
    set({ recentlyChangedPaths: newMap });

    // Auto-clear after 3 seconds
    setTimeout(() => {
      get().clearRecentlyChanged(path);
    }, 3000);
  },

  clearRecentlyChanged: (path) => {
    const { recentlyChangedPaths } = get();
    if (recentlyChangedPaths.has(path)) {
      const newMap = new Map(recentlyChangedPaths);
      newMap.delete(path);
      set({ recentlyChangedPaths: newMap });
    }
  },

  expandToPath: async (projectId, path) => {
    // Build list of ancestor directory paths
    const parts = path.split('/');
    const ancestorPaths: string[] = [];
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      ancestorPaths.push(currentPath);
    }

    // Load each ancestor directory sequentially (parent must load before child)
    for (const dirPath of ancestorPaths) {
      const node = findNodeByPath(get().nodes, dirPath);
      if (node?.isDirectory && !node.children) {
        await get().loadDirectory(projectId, dirPath);
      }
    }

    // Expand all ancestors
    const { expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    for (const dirPath of ancestorPaths) {
      newExpanded.add(dirPath);
    }
    set({ expandedPaths: newExpanded });
  },

  loadDirectory: async (projectId, path = '') => {
    const isRootLoad = path === '' || path === '.';

    // If project changed, reset state
    if (get().projectId !== projectId) {
      set({
        projectId,
        nodes: [],
        expandedPaths: new Set<string>(),
        focusedPaths: new Set<string>(),
      });
    }

    // Track loading state - use global isLoading for root, loadingPaths for subdirs
    if (isRootLoad) {
      set({ isLoading: true, error: null });
    } else {
      const newLoadingPaths = new Set(get().loadingPaths);
      newLoadingPaths.add(path);
      set({ loadingPaths: newLoadingPaths, error: null });
    }

    try {

      if (get().projectId === projectId) {
        if (isRootLoad) {
          // Root level - replace all nodes
          set({ nodes, isLoading: false });
        } else {
          // Subdirectory - update children of that path
          const updatedNodes = updateNodesAtPath(get().nodes, path, nodes);
          const currentLoadingPaths = new Set(get().loadingPaths);
          currentLoadingPaths.delete(path);
          set({ nodes: updatedNodes, loadingPaths: currentLoadingPaths });
        }
      }
    } catch (error) {
      console.error('[FileTreeStore] Failed to load directory:', error);
      if (isRootLoad) {
        set({ error: String(error), isLoading: false });
      } else {
        const currentLoadingPaths = new Set(get().loadingPaths);
        currentLoadingPaths.delete(path);
        set({ error: String(error), loadingPaths: currentLoadingPaths });
      }
    }
  },

  refreshDirectory: async (path) => {
    const { projectId, loadingPaths } = get();
    if (!projectId) return;

    // Mark path as loading
    const newLoadingPaths = new Set(loadingPaths);
    newLoadingPaths.add(path);
    set({ loadingPaths: newLoadingPaths });

    try {

      if (get().projectId === projectId) {
        if (path === '' || path === '.') {
          set({ nodes: children });
        } else {
          const updatedNodes = updateNodesAtPath(get().nodes, path, children);
          set({ nodes: updatedNodes });
        }
      }
    } catch (error) {
      console.error('[FileTreeStore] Failed to refresh directory:', error);
    } finally {
      // Remove from loading paths
      const currentLoadingPaths = new Set(get().loadingPaths);
      currentLoadingPaths.delete(path);
      set({ loadingPaths: currentLoadingPaths });
    }
  },

  createFolder: async (path) => {
    const { projectId } = get();
    if (!projectId) return null;

    try {

      // Add to tree
      const updatedNodes = addNodeToTree(get().nodes, node);
      set({ nodes: updatedNodes });

      return node;
    } catch (error) {
      console.error('[FileTreeStore] Failed to create folder:', error);
      return null;
    }
  },

  createFile: async (path, content = '') => {
    const { projectId } = get();
    if (!projectId) return null;

    try {

      // Add to tree
      const updatedNodes = addNodeToTree(get().nodes, node);
      set({ nodes: updatedNodes });

      return node;
    } catch (error) {
      console.error('[FileTreeStore] Failed to create file:', error);
      return null;
    }
  },

  createSymlink: async (targetPath, linkPath) => {
    const { projectId } = get();
    if (!projectId) return null;

    try {

      // Add to tree
      const updatedNodes = addNodeToTree(get().nodes, node);
      set({ nodes: updatedNodes });

      return node;
    } catch (error) {
      console.error('[FileTreeStore] Failed to create symlink:', error);
      return null;
    }
  },

  deleteEntry: async (path) => {
    const { projectId } = get();
    if (!projectId) return false;

    try {

      if (result.success) {
        // Remove from tree
        const updatedNodes = removeNodeByPath(get().nodes, path);
        set({ nodes: updatedNodes });

        // Clear selection if deleted item was selected
        }

        // Remove from focused if present
        const { focusedPaths } = get();
        if (focusedPaths.has(path)) {
          const newFocused = new Set(focusedPaths);
          newFocused.delete(path);
          set({ focusedPaths: newFocused });
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('[FileTreeStore] Failed to delete:', error);
      return false;
    }
  },

  rename: async (oldPath, newPath) => {
    const { projectId } = get();
    if (!projectId) return null;

    try {

      // Remove old node and add new one
      let updatedNodes = removeNodeByPath(get().nodes, oldPath);
      updatedNodes = addNodeToTree(updatedNodes, node);
      set({ nodes: updatedNodes });

      // Update selection if renamed item was selected
      }

      // Update focused paths if needed
      const { focusedPaths } = get();
      if (focusedPaths.has(oldPath)) {
        const newFocused = new Set(focusedPaths);
        newFocused.delete(oldPath);
        newFocused.add(newPath);
        set({ focusedPaths: newFocused });
      }

      return node;
    } catch (error) {
      console.error('[FileTreeStore] Failed to rename:', error);
      return null;
    }
  },

  moveEntry: async (sourcePath, targetFolderPath) => {
    const { projectId } = get();
    if (!projectId) return null;

    // Calculate new path
    const fileName = getBaseName(sourcePath, sourcePath);
    const newPath = targetFolderPath
      ? `${targetFolderPath}/${fileName}`
      : fileName;

    // Don't move if already in target folder
    if (sourcePath === newPath) return null;

    try {

      // Remove old node and add new one
      let updatedNodes = removeNodeByPath(get().nodes, sourcePath);
      updatedNodes = addNodeToTree(updatedNodes, node);
      set({ nodes: updatedNodes });

      // Update selection if moved item was selected
      }

      // Update focused paths if needed
      const { focusedPaths } = get();
      if (focusedPaths.has(sourcePath)) {
        const newFocused = new Set(focusedPaths);
        newFocused.delete(sourcePath);
        newFocused.add(newPath);
        set({ focusedPaths: newFocused });
      }

      return node;
    } catch (error) {
      console.error('[FileTreeStore] Failed to move:', error);
      return null;
    }
  },

  getNodeByPath: (path) => {
    return findNodeByPath(get().nodes, path);
  },

  getChildrenOfPath: (path) => {
    if (path === '' || path === '.') {
      return get().nodes;
    }
    const node = findNodeByPath(get().nodes, path);
    return node?.children ?? [];
  },

  reset: () => set({
    ...initialState,
    expandedPaths: new Set<string>(),
    focusedPaths: new Set<string>(),
    loadingPaths: new Set<string>(),
    recentlyChangedPaths: new Map<string, RecentlyChangedInfo>(),
  }),
}));
