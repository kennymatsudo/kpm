import { useState, useEffect, useCallback } from 'react';
import type { ViewMode } from '../../planning/ViewSwitcher';
import type { MainView } from '../MainViewSwitcher';

export interface UsePersistedViewStateReturn {
  mainView: MainView;
  viewMode: ViewMode;
  setMainView: (view: MainView) => void;
  setViewMode: (mode: ViewMode) => void;
}

function readStoredViewMode(projectId: string | null): ViewMode {
  if (!projectId) return 'board';
  const saved = localStorage.getItem(`kpm-view-mode-${projectId}`);
  return saved === 'tree' || saved === 'card' ? saved : 'board';
}

function readStoredMainView(projectId: string | null): MainView {
  if (!projectId) return 'workspace';
  const saved = localStorage.getItem(`kpm-main-view-${projectId}`);
  // Migrate retired views (documents, development) to workspace.
  if (saved === 'documents' || saved === 'development') {
    localStorage.setItem(`kpm-main-view-${projectId}`, 'workspace');
    return 'workspace';
  }
  return saved === 'workspace' || saved === 'planning' ? saved : 'workspace';
}

export function usePersistedViewState(projectId: string | null): UsePersistedViewStateReturn {
  // View mode state - persisted per project in localStorage
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readStoredViewMode(projectId));

  // Update view mode when project changes
  useEffect(() => {
    setViewModeState(readStoredViewMode(projectId));
  }, [projectId]);

  // Persist view mode changes
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      if (projectId) {
        localStorage.setItem(`kpm-view-mode-${projectId}`, mode);
      }
    },
    [projectId]
  );

  // Main view state (planning vs development vs workspace) - persisted per project
  // Default to 'workspace' for chat-first experience
  const [mainView, setMainViewState] = useState<MainView>(() => readStoredMainView(projectId));

  // Update main view when project changes
  useEffect(() => {
    setMainViewState(readStoredMainView(projectId));
  }, [projectId]);

  // Persist main view changes
  const setMainView = useCallback(
    (view: MainView) => {
      setMainViewState(view);
      if (projectId) {
        localStorage.setItem(`kpm-main-view-${projectId}`, view);
      }
    },
    [projectId]
  );

  return {
    mainView,
    viewMode,
    setMainView,
    setViewMode,
  };
}
