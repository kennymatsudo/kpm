import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resetAllProjectScopedStores } from '../stores/projectScopedStores';

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
    const isSwitching = previousConnectedProjectId !== null && previousConnectedProjectId !== projectId;

    try {
      // 1. Fetch all new project data first (while old project is still visible)

        for (const repo of repos) {
        }

      // 2. Tear down old project resources
      await teardownWatchers();

      if (previousConnectedProjectId && previousConnectedProjectId !== projectId) {
        // Reset all project-scoped stores when switching projects to prevent memory leaks
        // See projectScopedStores.ts to add new stores that need cleanup
        resetAllProjectScopedStores();
      }

      // 3. Batch update all store state at once (atomic swap)
        }
      } else {
      }

      // Track project for session cleanup on switch
      previousConnectedProjectId = projectId;

    } finally {
      }
    }

    addProject(project);
    await loadProjectData(project.id);

    }

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
        // Try to load the last opened project
        const projectToLoad = lastProjectId && projects.some((p: { id: string }) => p.id === lastProjectId)
          ? lastProjectId
          : projects[0].id;

        await loadProjectData(projectToLoad);
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
