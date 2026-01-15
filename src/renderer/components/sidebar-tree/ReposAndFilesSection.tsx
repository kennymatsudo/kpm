import { useShallow } from 'zustand/react/shallow';

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
    loadDirectory: loadProjectDirectory,
    toggleExpanded: toggleProjectExpanded,
    setRenamingPath,
    deleteEntry,
    rename,
    moveEntry,
    getNodeByPath,
  } = useFileTreeStore();

  useEffect(() => {
    if (projectId) {
    }

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

  const handleFileOpen = useCallback(
    async (path: string, node: FileNode) => {
      if (node.isDirectory) {
        toggleProjectExpanded(path);
        if (projectId && !node.children?.length) {
        }
      } else if (onFileOpen) {
        const isEditable = isEditableFile(node.name);
        onFileOpen('project', path, isEditable);
      } else if (node.name.endsWith('.md')) {
      } else {
      }
    },
  );

  // Rename handlers
  const handleStartRename = useCallback(
    (path: string) => {
      setRenamingPath(path);
    },
  );

  const handleEndRename = useCallback(() => {
    setRenamingPath(null);
  }, [setRenamingPath]);

  const handleViewMarkdown = useCallback(
    async (path: string) => {
    },
  );

  // External file drop handler
  const handleExternalDrop = useCallback(
    async (files: FileList, targetPath: string) => {
      if (!projectId) return;

      for (const file of Array.from(files)) {
        try {
          const newPath = targetPath ? `${targetPath}/${file.name}` : file.name;

        } catch (err) {
          console.error(`Failed to copy file ${file.name}:`, err);
        }
      }

    },
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

  const deleteFilename = deleteNode?.name ?? '';


  return (
        isCollapsed={reposCollapsed}
        onToggleCollapsed={() => setReposCollapsed(!reposCollapsed)}

        isCollapsed={filesCollapsed}
        onToggleCollapsed={() => setFilesCollapsed(!filesCollapsed)}

          }
          }
      />
  );
});
