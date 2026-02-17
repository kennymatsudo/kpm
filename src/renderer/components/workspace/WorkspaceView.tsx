import { useShallow } from 'zustand/react/shallow';
import { Chat, ChatHeader } from '../chat';
import { FileEditor } from './FileEditor';
import { getParentPath } from '../../utils/path';
import { subscribe as subscribeToStoreEvent } from '../../stores/storeEvents';
import { useWorkspaceResize } from './useWorkspaceResize';

interface WorkspaceViewProps {
  projectId: string;
}

/**
 * Workspace View - Chat-first interface with document editing.
 * Sidebar is rendered by Layout, this component handles editor and chat panels.
 *
 * Adaptive layout:
 * - Default: Chat (full width)
 * - Editing: Editor (center) + Chat (right, narrower)
 *
 * Note: Pending file approvals (from Claude-generated content) are now handled
 * by ApprovalOverlays via the unified approval queue.
 */
  const {
    editingFile,
    closeEditor,
    openFile,
    setCurrentProjectId,
  } = useWorkspaceStore(
    useShallow((state) => ({
      editingFile: state.editingFile,
      closeEditor: state.closeEditor,
      openFile: state.openFile,
      setCurrentProjectId: state.setCurrentProjectId,
    }))
  );

  const hasUnsavedChanges = useHasUnsavedChanges();

  // File tree store for highlighting recently changed files
  const { markRecentlyChanged, expandToPath, refreshDirectory } = useFileTreeStore(
    useShallow((state) => ({
      markRecentlyChanged: state.markRecentlyChanged,
      expandToPath: state.expandToPath,
      refreshDirectory: state.refreshDirectory,
    }))
  );

  // Animation state for editor panel
  const [editorVisible, setEditorVisible] = useState(false);

  // Set project ID in store for saveFile to use
  useEffect(() => {
    setCurrentProjectId(projectId);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

  // Subscribe to bridged file changes for real-time editor updates
  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('file-explorer-changed', (event) => {
      const data = event.payload;
      if (data.projectId !== projectId) return;
      if (!editingFile?.source || editingFile.source !== 'project') return;

      // Handle file being updated externally
      if (data.type === 'updated' && data.path === editingFile.path) {
        // Only auto-refresh if there are no unsaved changes
        if (!hasUnsavedChanges) {
            openFile(editingFile.source, editingFile.path, content, editingFile.isReadOnly);
          }).catch(console.error);
        }
        // If there are unsaved changes, let the user keep editing
        // They will see the saved status indicator
      }

      // Handle file being deleted - close editor
      if (data.type === 'deleted' && data.path === editingFile.path) {
        closeEditor();
      }

      // Handle file being renamed - update the editing path
      if (data.type === 'renamed' && data.path === editingFile.path && data.newPath) {
        // Re-open with the new path
          openFile(editingFile.source, data.newPath!, content, editingFile.isReadOnly);
        }).catch(console.error);
      }
    });
    return unsubscribe;
  }, [projectId, editingFile, hasUnsavedChanges, openFile, closeEditor]);

  // Subscribe to bridged Claude file updates for file tree highlighting
  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('chat-file-updated', (event) => {
      const data = event.payload;
      if (data.projectId !== projectId) return;

      // Determine if this is a create or modify
      const changeType = data.oldContent === null ? 'created' : 'modified';

      // Highlight the file in the tree
      markRecentlyChanged(data.filePath, changeType);

    });
    return unsubscribe;
  }, [projectId, markRecentlyChanged, expandToPath, refreshDirectory]);


  // Track if we're in editing mode for layout transitions
  const isEditing = editingFile !== null;

  // Animate editor panel in/out
  useEffect(() => {
    if (isEditing) {
      // Small delay for mount animation
      requestAnimationFrame(() => setEditorVisible(true));
    } else {
      setEditorVisible(false);
    }
  }, [isEditing]);

  // Handle editor close
  const handleCloseEditor = useCallback(() => {
    closeEditor();
  }, [closeEditor]);

  return (
      {/* Editor Panel (only shown when editing) */}
      {isEditing && (
        <div
          className={`
            flex-1 min-w-0 bg-surface-1 relative
            transition-all duration-300 ease-out
            ${editorVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
          `}
          style={{
            boxShadow: 'inset -1px 0 0 var(--color-border-subtle)',
          }}
        >
          <ErrorBoundary name="FileEditor">
            {editingFile && (
              <FileEditor
                source={editingFile.source}
                path={editingFile.path}
                onClose={handleCloseEditor}
              />
            )}
          </ErrorBoundary>
        </div>
      )}

      {/* Workspace resize handle (only when editor is open) */}
      {isEditing && (
        <div
          onMouseDown={handleResizeStart}
          className="relative w-1.5 cursor-col-resize flex-shrink-0 bg-border-subtle/70 hover:bg-accent/35 active:bg-accent/45 transition-colors"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border-default/80" />
        </div>
      )}


    </div>
  );
}
