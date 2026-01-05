import { useShallow } from 'zustand/react/shallow';
import { FileEditor } from './FileEditor';

interface WorkspaceViewProps {
  projectId: string;
}

/**
 *
 * Adaptive layout:
 */
  const {
    editingFile,
    closeEditor,
    setCurrentProjectId,
  } = useWorkspaceStore(
    useShallow((state) => ({
      editingFile: state.editingFile,
      closeEditor: state.closeEditor,
      setCurrentProjectId: state.setCurrentProjectId,
    }))
  );

  // Animation state for editor panel
  const [editorVisible, setEditorVisible] = useState(false);

  // Set project ID in store for saveFile to use
  useEffect(() => {
    setCurrentProjectId(projectId);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

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
        <div
          className={`
            transition-all duration-300 ease-out
          `}
        >

    </div>
  );
}
