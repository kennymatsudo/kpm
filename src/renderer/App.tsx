import { useCallback, useState, useEffect } from 'react';
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
    <MotionProvider>
      <ThemeProvider>
        <ErrorBoundary name="App">
          <Layout
            onDeleteProject={handleDeleteProject}
            onOpenProject={loadProjectData}
          />

            isOpen={showNewProjectDialog}
            onCreate={handleCreateProject}
          />
        </ErrorBoundary>
      </ThemeProvider>
    </MotionProvider>
  );
}
