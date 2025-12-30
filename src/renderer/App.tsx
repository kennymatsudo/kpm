import { Layout } from './components/layout';
import { ThemeProvider } from './contexts';
import { useProjectLoader } from './hooks/useProjectLoader';

export default function App() {
  // Initialize cross-store event subscriptions
  useStoreSubscriptions();

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  const { createProject, deleteCurrentProject, loadProjectData } = useProjectLoader({
  });


  // Delete the current project
  const handleDeleteProject = useCallback(async () => {
    await deleteCurrentProject();
  }, [deleteCurrentProject]);

  return (
  );
}
