import { useState, useEffect, useCallback } from 'react';
import type { MainView } from '../MainViewSwitcher';

export interface UsePersistedViewStateReturn {
  mainView: MainView;
  setMainView: (view: MainView) => void;
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
    setMainView,
  };
}
