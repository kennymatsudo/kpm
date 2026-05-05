import { useCallback, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layout } from './components/layout';
import { ErrorBoundary } from './components/app/ErrorBoundary';
import { ProjectOnboardingWizard } from './components/onboarding';
import { MotionProvider } from './components/app/MotionProvider';
import { TooltipProvider } from './components/ui';
import {
  useStoreSubscriptions,
  initCustomPromptTaskListeners,
  useProjectDomainStore,
  usePlanDomainStore,
  selectProjectSummary,
  useBackgroundTaskStore,
  useContextRegenerationStore,
} from './stores';
import { ThemeProvider } from './contexts';
import { useProjectLoader } from './hooks/useProjectLoader';
import { subscribeToRefreshRequested } from './services/planService';
import {
  initOnboardingTaskBridge,
  type OnboardingTaskMeta,
} from './services/onboardingTaskBridge';

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
  const [resumeTaskId, setResumeTaskId] = useState<string | null>(null);
  const handleOpenNewProjectDialog = useCallback(() => {
    setResumeTaskId(null);
    setShowNewProjectDialog(true);
  }, []);
  const handleCloseNewProjectDialog = useCallback(() => {
    setShowNewProjectDialog(false);
    setResumeTaskId(null);
  }, []);
  const handleResumeOnboardingTask = useCallback((taskId: string) => {
    const task = useBackgroundTaskStore.getState().tasks[taskId];
    const flow = (task?.meta as OnboardingTaskMeta | undefined)?.flow;
    if (flow === 'regen') {
      useContextRegenerationStore.getState().open(taskId);
      return;
    }
    // Default to wizard for 'create' or unknown
    setResumeTaskId(taskId);
    setShowNewProjectDialog(true);
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
        <TooltipProvider>
        <ErrorBoundary name="App">
          {/* data-testid for E2E tests to wait for app initialization */}
          <div data-testid={isAppReady ? 'app-ready' : undefined} />
          <Layout
            onDeleteProject={handleDeleteProject}
            onNewProject={handleOpenNewProjectDialog}
            onOpenProject={loadProjectData}
            onResumeOnboardingTask={handleResumeOnboardingTask}
          />

          <ProjectOnboardingWizard
            isOpen={showNewProjectDialog}
            onClose={handleCloseNewProjectDialog}
            onCreate={handleCreateProject}
            resumeTaskId={resumeTaskId}
          />
        </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
