import { useShallow } from 'zustand/react/shallow';
import {
  useResourceDomainStore,
  useProjectUiDomainStore,
  useFileTreeStore,
  isEditableFile,
  useConfluenceStore,
  useWorkspaceStore,
} from '../../stores';
import { isImageFile, formatFileSize } from '../../utils/image';
import { subscribe as subscribeToStoreEvent } from '../../stores/storeEvents';
import {
  useFileViewers,
  useFileContextMenus,
  useConfluenceLinks,
  useAddMenu,
} from './hooks';

const MAX_EXTERNAL_FILE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024; // 10MB (matches createFile validation)

interface ReposAndFilesSectionProps {
  projectId: string;
  /**
   * Called when a file is opened (double-click).
   * If not provided, markdown files open in viewer, others reveal in Finder.
   */
  onFileOpen?: (source: 'project', path: string, isEditable: boolean) => void;
}

/**
 * Shared component for displaying repositories and project files in sidebar.
 * Used by the Sidebar component in both planning and workspace modes.
 */
export const ReposAndFilesSection = memo(function ReposAndFilesSection({
  projectId,
  onFileOpen,
}: ReposAndFilesSectionProps) {
  const [filesCollapsed, setFilesCollapsed] = useState(false);

  // Confluence store
  const { loadLinks, getLinkForDocument, unlinkDocument, isDocumentLinked } = useConfluenceStore(
    useShallow((s) => ({
      loadLinks: s.loadLinks,
      getLinkForDocument: s.getLinkForDocument,
      unlinkDocument: s.unlinkDocument,
      isDocumentLinked: s.isDocumentLinked,
    }))
  );

  const repos = useResourceDomainStore((state) => state.repos);
    useShallow((state) => ({
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
      removeFocusedResource: state.removeFocusedResource,
    }))
  );

  // File tree store
  const {
    nodes: projectNodes,
    expandedPaths: projectExpanded,
    loadingPaths: projectLoading,
    renamingPath,
    creatingItem,
    loadDirectory: loadProjectDirectory,
    toggleExpanded: toggleProjectExpanded,
    setRenamingPath,
    setCreatingItem,
    createItemAndSelect,
    deleteEntry,
    rename,
    moveEntry,
    getNodeByPath,
    expandToPath,
  } = useFileTreeStore();

  // Workspace editing state (only relevant when onFileOpen is provided, i.e. workspace mode)
  const editingFile = useWorkspaceStore((state) => state.editingFile);
  const editingPath = onFileOpen && editingFile?.source === 'project' ? editingFile.path : null;

  // ==========================================================================
  // Extracted hooks
  // ==========================================================================

  const fileViewers = useFileViewers({ projectId });

  const fileContextMenus = useFileContextMenus({
    projectId,
    deleteEntry,
    getNodeByPath,
    removeFocusedResource,
    closeIfViewing: fileViewers.closeIfViewing,
  });

  const confluenceLinks = useConfluenceLinks({
    projectId,
    contextMenuPath: fileContextMenus.contextMenu?.path ?? null,
    unlinkDocument,
    setContextMenu: fileContextMenus.setContextMenu,
  });

  const addMenu = useAddMenu();

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Auto-expand folders to reveal the currently editing file
  useEffect(() => {
    if (editingPath && projectId) {
      void expandToPath(projectId, editingPath);
    }
  }, [editingPath, projectId, expandToPath]);

  useEffect(() => {
    if (projectId) {
      void loadLinks(projectId);
    }
  }, [projectId, loadProjectDirectory, loadLinks]);

  // Start/stop watching project folder for external file changes
  useEffect(() => {
    if (!projectId) return;


    return () => {
    };
  }, [projectId]);

  // Subscribe to bridged file system changes to refresh tree and viewer in real-time
  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('file-explorer-changed', (event) => {
      const data = event.payload;
      if (data.projectId !== projectId) return;

      switch (data.type) {
        case 'created': {
          const parentPath = getParentPath(data.path);
          void loadProjectDirectory(projectId, parentPath || undefined);
          break;
        }
        case 'updated': {
          // If the path doesn't exist in the tree, it's a newly created file
          // that the watcher reported as 'updated' (e.g., editors with atomic saves).
          const existingNode = getNodeByPath(data.path);
          if (!existingNode) {
            const parentPath = getParentPath(data.path);
            void loadProjectDirectory(projectId, parentPath || undefined);
          }
          fileViewers.handleFileChange(data.type, data.path);
          break;
        }
        case 'deleted':
          fileViewers.handleFileChange(data.type, data.path);
          break;
        case 'renamed': {
          fileViewers.handleFileChange(data.type, data.path, data.newPath);
          const sourceParent = getParentPath(data.path);
          void loadProjectDirectory(projectId, sourceParent || undefined);
          if (data.newPath) {
            const destParent = getParentPath(data.newPath);
            if (destParent !== sourceParent) {
              void loadProjectDirectory(projectId, destParent || undefined);
            }
          }
          break;
        }
      }
    });
    return unsubscribe;
  }, [projectId, fileViewers.handleFileChange, loadProjectDirectory]);

  // ==========================================================================
  // Repo handlers
  // ==========================================================================

  const handleAddRepo = useCallback(async () => {
    if (!projectId) return;

  const isRepoFocused = useCallback(
    (repoId: string): boolean => {
      return focusedResources.some((r) => r.type === 'repo' && r.id === repoId && !r.path);
    },
    [focusedResources]
  );

  const handleToggleRepoFocus = useCallback(
    (repoId: string) => {
      const isFocused = isRepoFocused(repoId);
      const resource: FocusedResource = { type: 'repo', id: repoId };
      if (isFocused) {
        removeFocusedResource(resource);
      } else {
        addFocusedResource(resource);
      }
    },
    [isRepoFocused, addFocusedResource, removeFocusedResource]
  );

  const handleRemoveRepo = useCallback(
    async (repoId: string) => {
      fileContextMenus.setRepoContextMenu(null);
    },
  );

  const handleRevealRepoInFinder = useCallback(
      fileContextMenus.setRepoContextMenu(null);
    },
    [fileContextMenus.setRepoContextMenu]
  );

  // ==========================================================================
  // File tree handlers
  // ==========================================================================

  const isPathFocused = useCallback(
    (path: string): boolean => {
      return focusedResources.some((r) => r.type === 'project_file' && r.path === path);
    },
    [focusedResources]
  );

  const handleToggleFileFocus = useCallback(
    (path: string, isDirectory: boolean) => {
      const isFocused = isPathFocused(path);
      const resource: FocusedResource = { type: 'project_file', path, isDirectory };
      if (isFocused) {
        removeFocusedResource(resource);
      } else {
        addFocusedResource(resource);
      }
    },
    [isPathFocused, addFocusedResource, removeFocusedResource]
  );

  const handleStartCreate = useCallback(
      setFilesCollapsed(false);
      addMenu.closeAddMenu();
      fileContextMenus.setEmptySpaceMenu(null);
    },
  );

  const handleCreateSubmit = useCallback(
    (name: string) => {
      void createItemAndSelect(name);
    },
    [createItemAndSelect]
  );

  const handleCreateCancel = useCallback(() => {
    setCreatingItem(null);
  }, [setCreatingItem]);

  const handleFileOpen = useCallback(
    async (path: string, node: FileNode) => {
      if (node.isDirectory) {
        toggleProjectExpanded(path);
        if (projectId && !node.children?.length) {
          void loadProjectDirectory(projectId, path);
        }
      } else if (isImageFile(node.name)) {
        await fileViewers.openImageViewer(path, node);
      } else if (onFileOpen) {
        const isEditable = isEditableFile(node.name);
        onFileOpen('project', path, isEditable);
      } else if (node.name.endsWith('.md')) {
        await fileViewers.openMarkdownViewer(path);
      } else {
      }
    },
    [projectId, loadProjectDirectory, toggleProjectExpanded, onFileOpen, fileViewers.openImageViewer, fileViewers.openMarkdownViewer]
  );

  // Rename handlers
  const handleStartRename = useCallback(
    (path: string) => {
      setRenamingPath(path);
      fileContextMenus.setContextMenu(null);
    },
    [setRenamingPath, fileContextMenus.setContextMenu]
  );

  const handleEndRename = useCallback(() => {
    setRenamingPath(null);
  }, [setRenamingPath]);

  // Markdown view handler (from context menu)
  const handleViewMarkdown = useCallback(
    async (path: string) => {
      await fileViewers.openMarkdownViewer(path);
      fileContextMenus.setContextMenu(null);
    },
    [fileViewers.openMarkdownViewer, fileContextMenus.setContextMenu]
  );

  // Text file extensions (files we should read as text)
  const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
    '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg',
    '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    '.py', '.rb', '.php', '.java', '.kt', '.kts', '.scala', '.clj',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift',
    '.sql', '.graphql', '.gql',
    '.env', '.gitignore', '.dockerignore', '.editorconfig',
    '.eslintrc', '.prettierrc', '.babelrc',
    '.lock', '.sum', // package-lock.json, go.sum, etc.
  ]);

  const isTextFile = useCallback((filename: string): boolean => {
    const ext = filename.includes('.') ? '.' + filename.split('.').pop()?.toLowerCase() : '';
    return TEXT_EXTENSIONS.has(ext);
  }, []);

  // External file drop handler
  const handleExternalDrop = useCallback(
    async (files: FileList, targetPath: string) => {
      if (!projectId) return;

      for (const file of Array.from(files)) {
        try {
          const newPath = targetPath ? `${targetPath}/${file.name}` : file.name;
          const filePath = (file as File & { path?: string }).path;
          const isText = isTextFile(file.name);

          if (file.size > MAX_EXTERNAL_FILE_BYTES) {
            console.error(
              `File too large to import (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_EXTERNAL_FILE_BYTES)}.`
            );
            continue;
          }

          if (isText) {
            if (filePath && file.size > MAX_TEXT_FILE_BYTES) {
              continue;
            }

            if (file.size > MAX_TEXT_FILE_BYTES) {
              console.error(
                `Text file too large to import (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_TEXT_FILE_BYTES)}.`
              );
              continue;
            }

            const content = await file.text();
            continue;
          }

          if (filePath) {
            continue;
          }

          const arrayBuffer = await file.arrayBuffer();
          const data = new Uint8Array(arrayBuffer);
        } catch (err) {
          console.error(`Failed to copy file ${file.name}:`, err);
        }
      }

      void loadProjectDirectory(projectId, targetPath || undefined);
    },
    [projectId, loadProjectDirectory, isTextFile]
  );

  // Internal move handler (drag-and-drop within tree)
  const handleInternalMove = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      await moveEntry(sourcePath, targetFolderPath);
    },
    [moveEntry]
  );

  // ==========================================================================
  // Computed values
  // ==========================================================================

  const deleteNode = fileContextMenus.deleteConfirmPath
    ? getNodeByPath(fileContextMenus.deleteConfirmPath)
    : null;
  const deleteFilename = deleteNode?.name ?? '';

  const contextNode = fileContextMenus.contextMenu
    ? getNodeByPath(fileContextMenus.contextMenu.path)
    : null;

  // Confluence link info for context menu
  const contextMenuConfluenceLink = fileContextMenus.contextMenu?.path
    ? getLinkForDocument(fileContextMenus.contextMenu.path)
    : null;

  // Get Confluence link for sync modal
  const syncConfluenceLink = confluenceLinks.confluenceSyncPath
    ? getLinkForDocument(confluenceLinks.confluenceSyncPath)
    : null;

  // Get document title for link modal
  const linkDocumentNode = confluenceLinks.confluenceLinkPath
    ? getNodeByPath(confluenceLinks.confluenceLinkPath)
    : null;
  const linkDocumentTitle = linkDocumentNode?.name.replace(/\.md$/, '') ?? '';

  return (
    <div className="flex flex-col h-full min-h-0">
        isCollapsed={reposCollapsed}
        onToggleCollapsed={() => setReposCollapsed(!reposCollapsed)}
      <div className="divider mx-4 my-2 flex-none" />

        isCollapsed={filesCollapsed}
        onToggleCollapsed={() => setFilesCollapsed(!filesCollapsed)}

          }
          }
          }
          }
          }
          }
          }
      />
    </div>
  );
});
