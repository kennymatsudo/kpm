import { useShallow } from 'zustand/react/shallow';
import { FileEditor } from './FileEditor';

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

  // Animation state for editor panel
  const [editorVisible, setEditorVisible] = useState(false);

  // Set project ID in store for saveFile to use
  useEffect(() => {
    setCurrentProjectId(projectId);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

  useEffect(() => {
        }


      }
    return unsubscribe;
  }, [projectId, editingFile, hasUnsavedChanges, openFile, closeEditor]);

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
          </ErrorBoundary>
        </div>
      )}


    </div>
  );
}
