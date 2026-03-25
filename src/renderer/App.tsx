import { useCallback, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layout } from './components/layout';
import {
  useStoreSubscriptions,
  useProjectDomainStore,
  selectProjectSummary,
} from './stores';
import { ThemeProvider } from './contexts';
import { useProjectLoader } from './hooks/useProjectLoader';

export default function App() {
  // Initialize cross-store event subscriptions
  useStoreSubscriptions();

  // Track app ready state for E2E tests - app is ready when projects have been loaded
  const { projects, currentProjectId } = useProjectDomainStore(useShallow(selectProjectSummary));
  // App is ready when either we have a current project, or we know there are no projects
  // This ensures the initial project list has been fetched
  const isAppReady = currentProjectId !== null || projects.length === 0;

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const handleOpenNewProjectDialog = useCallback(() => {
    setShowNewProjectDialog(true);
  }, []);
  const handleCloseNewProjectDialog = useCallback(() => {
    setShowNewProjectDialog(false);
  }, []);

  const { createProject, deleteCurrentProject, loadProjectData } = useProjectLoader({
    onRequestNewProject: handleOpenNewProjectDialog,
  });


  // Delete the current project
  const handleDeleteProject = useCallback(async () => {
    await deleteCurrentProject();
  }, [deleteCurrentProject]);

  return (
    <MotionProvider>
      <ThemeProvider>
        <ErrorBoundary name="App">
          {/* data-testid for E2E tests to wait for app initialization */}
          <div data-testid={isAppReady ? 'app-ready' : undefined} />
          <Layout
            onDeleteProject={handleDeleteProject}
            onNewProject={handleOpenNewProjectDialog}
            onOpenProject={loadProjectData}
          />

            isOpen={showNewProjectDialog}
            onClose={handleCloseNewProjectDialog}
            onCreate={handleCreateProject}
          />
        </ErrorBoundary>
      </ThemeProvider>
    </MotionProvider>
  );
}
