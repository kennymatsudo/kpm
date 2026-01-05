import { useState, useEffect, useCallback } from 'react';
import type { ViewMode } from '../../planning/ViewSwitcher';

export interface UsePersistedViewStateReturn {
  mainView: MainView;
  viewMode: ViewMode;
  setMainView: (view: MainView) => void;
  setViewMode: (mode: ViewMode) => void;
}

  // Migrate retired views (documents, development) to workspace.
  if (saved === 'documents' || saved === 'development') {
  return saved === 'workspace' || saved === 'planning' ? saved : 'workspace';
export function usePersistedViewState(projectId: string | null): UsePersistedViewStateReturn {
  // View mode state - persisted per project in localStorage

  // Update view mode when project changes
  useEffect(() => {
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

  // Update main view when project changes
  useEffect(() => {
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
