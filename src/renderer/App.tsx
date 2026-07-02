import { useCallback, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layout } from './components/layout';
import { ErrorBoundary } from './components/app/ErrorBoundary';
import { CreateProjectModal } from './components/onboarding';
import { MotionProvider } from './components/app/MotionProvider';
import { TooltipProvider } from './components/ui';
import {
  useStoreSubscriptions,
  initCustomPromptTaskListeners,
  initNotificationListener,
  useProjectDomainStore,
  usePlanDomainStore,
  selectProjectSummary,
  useBackgroundTaskStore,
  useContextRegenerationStore,
} from './stores';
import { ThemeProvider } from './contexts';
import { useProjectLoader } from './hooks/useProjectLoader';
import { subscribeToRefreshRequested } from './services/planService';
import { initOnboardingTaskBridge } from './services/onboardingTaskBridge';
import { getBaseName } from './utils/path';

export default function App() {
  // Initialize cross-store event subscriptions
  useStoreSubscriptions();

  // Track in-flight Cmd+K custom prompt generations
  useEffect(() => {
    return initCustomPromptTaskListeners();
  }, []);

  // Relay onboarding generation events into the generic background task store
  useEffect(() => {
    return initOnboardingTaskBridge();
  }, []);

  // Relay main-process notification events into the notification store
  useEffect(() => {
    return initNotificationListener();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      useBackgroundTaskStore.getState().reapStale();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Track app ready state for E2E tests - app is ready when projects have been loaded
  const { projects, currentProjectId } = useProjectDomainStore(useShallow(selectProjectSummary));
  const refreshPlanItems = usePlanDomainStore((state) => state.refreshPlanItems);
  // App is ready when either we have a current project, or we know there are no projects
  // This ensures the initial project list has been fetched
  const isAppReady = currentProjectId !== null || projects.length === 0;

  useEffect(() => {
    return subscribeToRefreshRequested((event) => {
      if (event.projectId === currentProjectId) {
        void refreshPlanItems();
      }
    });
  }, [currentProjectId, refreshPlanItems]);

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const handleOpenNewProjectDialog = useCallback(() => {
    setShowNewProjectDialog(true);
  }, []);
  const handleCloseNewProjectDialog = useCallback(() => {
    setShowNewProjectDialog(false);
  }, []);
  const handleResumeOnboardingTask = useCallback((taskId: string) => {
    useContextRegenerationStore.getState().open(taskId);
  }, []);

  const { createProject, deleteCurrentProject, loadProjectData } = useProjectLoader({
    onRequestNewProject: handleOpenNewProjectDialog,
  });

  // Create a new project (optionally cloning from a URL)
  const handleCreateProject = useCallback(
    async (input: { name: string; repoPaths?: string[]; folderPath?: string; cloneUrl?: string }) => {
      return createProject(input);
    },
    [createProject],
  );

  // Delete the current project
  const handleDeleteProject = useCallback(async () => {
    await deleteCurrentProject();
  }, [deleteCurrentProject]);

  const handleCreateProjectFromRepos = useCallback(
    async (paths: string[]) => {
      const name = getBaseName(paths[0], 'New Project');
      await createProject({ name, repoPaths: paths });
    },
    [createProject],
  );

  return (
    <MotionProvider>
      <ThemeProvider>
        <TooltipProvider>
        <ErrorBoundary name="App">
          {/* data-testid for E2E tests to wait for app initialization */}
          <div data-testid={isAppReady ? 'app-ready' : undefined} />
          <Layout
            onDeleteProject={handleDeleteProject}
            onNewProject={handleOpenNewProjectDialog}
            onOpenProject={loadProjectData}
            onResumeOnboardingTask={handleResumeOnboardingTask}
            onCreateProjectFromRepos={handleCreateProjectFromRepos}
          />

          <CreateProjectModal
            isOpen={showNewProjectDialog}
            onClose={handleCloseNewProjectDialog}
            onCreate={handleCreateProject}
          />
        </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
