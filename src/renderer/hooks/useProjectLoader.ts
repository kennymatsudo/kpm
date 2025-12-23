import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

interface UseProjectLoaderOptions {
  onRequestNewProject?: () => void;
}

// Track the previously connected project to disconnect on switch
let previousConnectedProjectId: string | null = null;

/**
 * Centralized controller for loading project data and wiring repo watchers.
 * Keeps App.tsx focused on UI concerns and makes this logic easier to test.
 */
export function useProjectLoader(options: UseProjectLoaderOptions = {}) {
  const { onRequestNewProject } = options;

  // State we need to react to

  const {
    setRepoBranches,
    setRepoBranch,

  const watchedRepoPathsRef = useRef<string[]>([]);

  const teardownWatchers = useCallback(async () => {
    watchedRepoPathsRef.current = [];

  const loadProjectData = useCallback(async (projectId: string) => {



    addProject(project);
    await loadProjectData(project.id);
    return project;

  const deleteCurrentProject = useCallback(async () => {
    if (!currentProjectId) return;

    if (previousConnectedProjectId === currentProjectId) {
      previousConnectedProjectId = null;
    }

    // Delete via API

    // Remove from store
    removeProject(currentProjectId);

    // Find another project to switch to
    const remainingProjects = projects.filter(p => p.id !== currentProjectId);
    if (remainingProjects.length > 0) {
      await loadProjectData(remainingProjects[0].id);
    } else {
      await teardownWatchers();
      reset();
    }
  }, [currentProjectId, projects, removeProject, loadProjectData, reset, teardownWatchers]);

  // Load projects on startup
  useEffect(() => {
    const loadProjects = async () => {
      setProjects(projects);

      if (projects.length > 0) {
      }
    };

    void loadProjects();
  }, [setProjects, loadProjectData]);

  // Listen for menu events
  useEffect(() => {
    });
  }, [loadProjectData, onRequestNewProject]);

  // Listen for repo branch changes
  useEffect(() => {
        setRepoBranch(repoId, branch);
      }
    );

    return () => {
      unsubBranchChange();
    };
  }, [setRepoBranch]);

  useEffect(() => {
    return () => {
      void teardownWatchers();
    };

  return {
    loadProjectData,
    createProject,
    deleteCurrentProject,
  };
}
