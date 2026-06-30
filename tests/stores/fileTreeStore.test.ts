import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useFileTreeStore } from '../../src/renderer/stores/fileTreeStore';
import type { FileNode } from '../../src/shared/types';

// Helper to create test FileNode objects
function createNode(overrides: Partial<FileNode> & { name: string; path: string }): FileNode {
  return {
    isDirectory: false,
    isSymlink: false,
    modifiedAt: '2024-01-01T00:00:00.000Z',
    size: 0,
    ...overrides,
  };
}

// Mock window.api.fileExplorer
const mockFileExplorer = {
  listDirectory: vi.fn(),
  createFolder: vi.fn(),
  createFile: vi.fn(),
  createSymlink: vi.fn(),
  delete: vi.fn(),
  rename: vi.fn(),
};

// Setup global mock
beforeEach(() => {
  (global as unknown as { window: { api: { fileExplorer: typeof mockFileExplorer } } }).window = {
    api: {
      fileExplorer: mockFileExplorer,
    },
  };

  // Reset store state
  useFileTreeStore.getState().reset();

  // Clear all mocks
  vi.clearAllMocks();
});

afterEach(() => {
  delete (global as unknown as { window?: unknown }).window;
});

describe('fileTreeStore', () => {
  describe('expanded paths management', () => {
    it('toggleExpanded flips presence on each call', () => {
      const store = useFileTreeStore.getState();
      store.toggleExpanded('folder');
      expect(useFileTreeStore.getState().expandedPaths.has('folder')).toBe(true);
      store.toggleExpanded('folder');
      expect(useFileTreeStore.getState().expandedPaths.has('folder')).toBe(false);
    });

    it('setExpanded forces presence to the given value', () => {
      const store = useFileTreeStore.getState();
      store.setExpanded('folder', true);
      expect(useFileTreeStore.getState().expandedPaths.has('folder')).toBe(true);
      store.setExpanded('folder', false);
      expect(useFileTreeStore.getState().expandedPaths.has('folder')).toBe(false);
    });
  });

  describe('focused paths management', () => {
    it('toggleFocused flips presence on each call', () => {
      const store = useFileTreeStore.getState();
      store.toggleFocused('file.txt');
      expect(useFileTreeStore.getState().focusedPaths.has('file.txt')).toBe(true);
      store.toggleFocused('file.txt');
      expect(useFileTreeStore.getState().focusedPaths.has('file.txt')).toBe(false);
    });

    it('setFocused replaces all focused paths', () => {
      useFileTreeStore.getState().toggleFocused('old.txt');
      useFileTreeStore.getState().setFocused(['new1.txt', 'new2.txt']);

      const focused = useFileTreeStore.getState().focusedPaths;
      expect(focused.has('old.txt')).toBe(false);
      expect(focused.has('new1.txt')).toBe(true);
      expect(focused.has('new2.txt')).toBe(true);
    });

    it('clearFocused removes all focused paths', () => {
      useFileTreeStore.getState().setFocused(['a.txt', 'b.txt']);
      useFileTreeStore.getState().clearFocused();
      expect(useFileTreeStore.getState().focusedPaths.size).toBe(0);
    });
  });

  describe('getNodeByPath', () => {
    beforeEach(() => {
      const nodes: FileNode[] = [
        createNode({ name: 'file.txt', path: 'file.txt' }),
        createNode({
          name: 'folder',
          path: 'folder',
          isDirectory: true,
          children: [
            createNode({ name: 'nested.txt', path: 'folder/nested.txt' }),
            createNode({
              name: 'deep',
              path: 'folder/deep',
              isDirectory: true,
              children: [createNode({ name: 'deep-file.txt', path: 'folder/deep/deep-file.txt' })],
            }),
          ],
        }),
      ];
      useFileTreeStore.getState().setNodes(nodes);
    });

    it('finds root, nested, and deeply nested nodes', () => {
      for (const [filePath, expectedName] of [
        ['file.txt', 'file.txt'],
        ['folder/nested.txt', 'nested.txt'],
        ['folder/deep/deep-file.txt', 'deep-file.txt'],
      ]) {
        const node = useFileTreeStore.getState().getNodeByPath(filePath);
        expect(node?.name).toBe(expectedName);
      }
    });

    it('returns null for non-existent path', () => {
      const node = useFileTreeStore.getState().getNodeByPath('nonexistent');
      expect(node).toBe(null);
    });
  });

  describe('getChildrenOfPath', () => {
    beforeEach(() => {
      const nodes: FileNode[] = [
        createNode({ name: 'root-file.txt', path: 'root-file.txt' }),
        createNode({
          name: 'folder',
          path: 'folder',
          isDirectory: true,
          children: [
            createNode({ name: 'child1.txt', path: 'folder/child1.txt' }),
            createNode({ name: 'child2.txt', path: 'folder/child2.txt' }),
          ],
        }),
      ];
      useFileTreeStore.getState().setNodes(nodes);
    });

    it('returns root nodes for empty and "." paths', () => {
      for (const filePath of ['', '.']) {
        const children = useFileTreeStore.getState().getChildrenOfPath(filePath);
        expect(children).toHaveLength(2);
      }
    });

    it('returns children of folder', () => {
      const children = useFileTreeStore.getState().getChildrenOfPath('folder');
      expect(children).toHaveLength(2);
      expect(children.map((n) => n.name)).toContain('child1.txt');
      expect(children.map((n) => n.name)).toContain('child2.txt');
    });

    it('returns empty array for non-existent path', () => {
      const children = useFileTreeStore.getState().getChildrenOfPath('nonexistent');
      expect(children).toEqual([]);
    });

    it('returns empty array for file path', () => {
      const children = useFileTreeStore.getState().getChildrenOfPath('root-file.txt');
      expect(children).toEqual([]);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      // Set up some state
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([createNode({ name: 'file.txt', path: 'file.txt' })]);
      useFileTreeStore.getState().setSelectedPath('file.txt');
      useFileTreeStore.getState().toggleExpanded('folder');
      useFileTreeStore.getState().toggleFocused('file.txt');
      useFileTreeStore.getState().setRenamingPath('file.txt');

      // Reset
      useFileTreeStore.getState().reset();

      // Verify reset
      const state = useFileTreeStore.getState();
      expect(state.projectId).toBe(null);
      expect(state.nodes).toEqual([]);
      expect(state.selectedPaths.size).toBe(0);
      expect(state.expandedPaths.size).toBe(0);
      expect(state.focusedPaths.size).toBe(0);
      expect(state.renamingPath).toBe(null);
    });
  });

  describe('loadDirectory', () => {
    it('sets isLoading while loading root', async () => {
      mockFileExplorer.listDirectory.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50))
      );

      const loadPromise = useFileTreeStore.getState().loadDirectory('project-1');

      // Should be loading immediately
      expect(useFileTreeStore.getState().isLoading).toBe(true);

      await loadPromise;

      // Should not be loading after completion
      expect(useFileTreeStore.getState().isLoading).toBe(false);
    });

    it('replaces nodes on root load', async () => {
      const mockNodes = [createNode({ name: 'new.txt', path: 'new.txt' })];
      mockFileExplorer.listDirectory.mockResolvedValue(mockNodes);

      // Set initial nodes
      useFileTreeStore.getState().setNodes([createNode({ name: 'old.txt', path: 'old.txt' })]);

      await useFileTreeStore.getState().loadDirectory('project-1');

      expect(useFileTreeStore.getState().nodes).toEqual(mockNodes);
    });

    it('resets state when project changes', async () => {
      mockFileExplorer.listDirectory.mockResolvedValue([]);

      // Set up state for project-1
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setSelectedPath('file.txt');
      useFileTreeStore.getState().toggleExpanded('folder');
      useFileTreeStore.getState().toggleFocused('file.txt');

      // Load different project
      await useFileTreeStore.getState().loadDirectory('project-2');

      const state = useFileTreeStore.getState();
      expect(state.projectId).toBe('project-2');
      expect(state.selectedPaths.size).toBe(0);
      expect(state.expandedPaths.size).toBe(0);
      expect(state.focusedPaths.size).toBe(0);
    });

    it('handles errors', async () => {
      mockFileExplorer.listDirectory.mockRejectedValue(new Error('Network error'));

      await useFileTreeStore.getState().loadDirectory('project-1');

      const state = useFileTreeStore.getState();
      expect(state.error).toContain('Network error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('createFolder', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([]);
    });

    it('adds folder to tree at root', async () => {
      const newFolder = createNode({ name: 'new-folder', path: 'new-folder', isDirectory: true });
      mockFileExplorer.createFolder.mockResolvedValue(newFolder);

      const result = await useFileTreeStore.getState().createFolder('new-folder');

      expect(result).toEqual(newFolder);
      expect(useFileTreeStore.getState().nodes).toContainEqual(newFolder);
    });

    it('adds folder to correct parent', async () => {
      // Set up parent folder
      useFileTreeStore.getState().setNodes([
        createNode({ name: 'parent', path: 'parent', isDirectory: true, children: [] }),
      ]);

      const newFolder = createNode({ name: 'child', path: 'parent/child', isDirectory: true });
      mockFileExplorer.createFolder.mockResolvedValue(newFolder);

      await useFileTreeStore.getState().createFolder('parent/child');

      const parent = useFileTreeStore.getState().getNodeByPath('parent');
      expect(parent?.children).toContainEqual(newFolder);
    });

    it('returns null when no projectId', async () => {
      useFileTreeStore.getState().setProjectId(null);
      const result = await useFileTreeStore.getState().createFolder('folder');
      expect(result).toBe(null);
    });

    it('returns null on error', async () => {
      mockFileExplorer.createFolder.mockRejectedValue(new Error('Failed'));
      const result = await useFileTreeStore.getState().createFolder('folder');
      expect(result).toBe(null);
    });
  });

  describe('createFile', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([]);
    });

    it('adds file to tree and passes content to the API', async () => {
      const newFile = createNode({ name: 'file.txt', path: 'file.txt' });
      mockFileExplorer.createFile.mockResolvedValue(newFile);

      const result = await useFileTreeStore.getState().createFile('file.txt', 'content');

      expect(result).toEqual(newFile);
      expect(useFileTreeStore.getState().nodes).toContainEqual(newFile);
      expect(mockFileExplorer.createFile).toHaveBeenCalledWith('project-1', 'file.txt', 'content');
    });
  });

  describe('deleteEntry', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([
        createNode({ name: 'file.txt', path: 'file.txt' }),
        createNode({ name: 'other.txt', path: 'other.txt' }),
      ]);
    });

    it('removes node from tree on success', async () => {
      mockFileExplorer.delete.mockResolvedValue({ success: true });

      const result = await useFileTreeStore.getState().deleteEntry('file.txt');

      expect(result).toBe(true);
      expect(useFileTreeStore.getState().getNodeByPath('file.txt')).toBe(null);
      expect(useFileTreeStore.getState().getNodeByPath('other.txt')).not.toBe(null);
    });

    it('clears selected and focused paths when deleting that item', async () => {
      mockFileExplorer.delete.mockResolvedValue({ success: true });
      useFileTreeStore.getState().setSelectedPath('file.txt');
      useFileTreeStore.getState().toggleFocused('file.txt');

      await useFileTreeStore.getState().deleteEntry('file.txt');

      expect(useFileTreeStore.getState().selectedPaths.has('file.txt')).toBe(false);
      expect(useFileTreeStore.getState().focusedPaths.has('file.txt')).toBe(false);
    });

    it('returns false when API returns failure', async () => {
      mockFileExplorer.delete.mockResolvedValue({ success: false });

      const result = await useFileTreeStore.getState().deleteEntry('file.txt');

      expect(result).toBe(false);
      expect(useFileTreeStore.getState().getNodeByPath('file.txt')).not.toBe(null);
    });

    it('returns false on error', async () => {
      mockFileExplorer.delete.mockRejectedValue(new Error('Failed'));

      const result = await useFileTreeStore.getState().deleteEntry('file.txt');

      expect(result).toBe(false);
    });
  });

  describe('rename', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([createNode({ name: 'old.txt', path: 'old.txt' })]);
    });

    it('removes old node and adds renamed node', async () => {
      const renamedNode = createNode({ name: 'new.txt', path: 'new.txt' });
      mockFileExplorer.rename.mockResolvedValue(renamedNode);

      const result = await useFileTreeStore.getState().rename('old.txt', 'new.txt');

      expect(result).toEqual(renamedNode);
      expect(useFileTreeStore.getState().getNodeByPath('old.txt')).toBe(null);
      expect(useFileTreeStore.getState().getNodeByPath('new.txt')).not.toBe(null);
    });

    it('updates selected and focused paths when renaming that item', async () => {
      useFileTreeStore.getState().setSelectedPath('old.txt');
      useFileTreeStore.getState().toggleFocused('old.txt');
      const renamedNode = createNode({ name: 'new.txt', path: 'new.txt' });
      mockFileExplorer.rename.mockResolvedValue(renamedNode);

      await useFileTreeStore.getState().rename('old.txt', 'new.txt');

      expect(useFileTreeStore.getState().selectedPaths.has('new.txt')).toBe(true);
      expect(useFileTreeStore.getState().focusedPaths.has('old.txt')).toBe(false);
      expect(useFileTreeStore.getState().focusedPaths.has('new.txt')).toBe(true);
    });

    it('returns null on error', async () => {
      mockFileExplorer.rename.mockRejectedValue(new Error('Failed'));

      const result = await useFileTreeStore.getState().rename('old.txt', 'new.txt');

      expect(result).toBe(null);
    });
  });

  describe('tree sorting', () => {
    it('sorts directories before files', async () => {
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([]);

      // Add file first, then folder
      const file = createNode({ name: 'aaa.txt', path: 'aaa.txt' });
      const folder = createNode({ name: 'zzz', path: 'zzz', isDirectory: true });

      mockFileExplorer.createFile.mockResolvedValue(file);
      mockFileExplorer.createFolder.mockResolvedValue(folder);

      await useFileTreeStore.getState().createFile('aaa.txt');
      await useFileTreeStore.getState().createFolder('zzz');

      const nodes = useFileTreeStore.getState().nodes;
      expect(nodes[0].name).toBe('zzz'); // folder first despite alphabetical order
      expect(nodes[1].name).toBe('aaa.txt');
    });

    it('sorts alphabetically within same type (case-insensitive)', async () => {
      useFileTreeStore.getState().setProjectId('project-1');
      useFileTreeStore.getState().setNodes([]);

      const files = [
        createNode({ name: 'Zebra.txt', path: 'Zebra.txt' }),
        createNode({ name: 'apple.txt', path: 'apple.txt' }),
        createNode({ name: 'BANANA.txt', path: 'BANANA.txt' }),
      ];

      for (const file of files) {
        mockFileExplorer.createFile.mockResolvedValue(file);
        await useFileTreeStore.getState().createFile(file.path);
      }

      const nodes = useFileTreeStore.getState().nodes;
      expect(nodes.map((n) => n.name)).toEqual(['apple.txt', 'BANANA.txt', 'Zebra.txt']);
    });
  });
});
