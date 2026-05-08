import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { applyLoadedProjectData, setProjectSwitching } from '../stores/project/domainService';
import { resetAllProjectScopedStores } from '../stores/projectScopedStores';
import {
  useProjectDomainActions,
  useResourceDomainActions,
} from './useStoreActions';
import { logPerfEvent, startPerfSpan } from '../utils/perfLogger';
import type { Attachment, PlanItem, Repo, Worktree } from '../../shared/types';
import {
  createProjectRecord,
  deleteProjectRecord,
  disconnectActiveChatSessions,
  getEffectiveRepoPath,
  getLastOpenedProjectId,
  listProjects,
  loadProjectRepoBranches,
  loadProjectResources,
  persistLastOpenedProjectId,
  subscribeToProjectMenuEvents,
  subscribeToRepoBranchChanges,
  unwatchProjectRepos,
  watchProjectRepos,
} from '../services/projectLoaderService';

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
  const { projects, currentProjectId } = useProjectDomainStore(useShallow(selectProjectSummary));

  const { setProjects, addProject, removeProject, reset } = useProjectDomainActions();
  const {
    addReposToProject,
    setRepoBranches,
    setRepoBranch,
  } = useResourceDomainActions();

  const watchedRepoPathsRef = useRef<string[]>([]);
  const loadSequenceRef = useRef(0);

  const teardownWatchers = useCallback(async () => {
    await unwatchProjectRepos(watchedRepoPathsRef.current);
    watchedRepoPathsRef.current = [];

  const loadProjectData = useCallback(async (projectId: string) => {
    const loadSequence = ++loadSequenceRef.current;
    const isSwitching = previousConnectedProjectId !== null && previousConnectedProjectId !== projectId;

    const endTotal = startPerfSpan('project.load.total', { projectId, switching: isSwitching });

    try {
      // 1. Fetch all new project data first (while old project is still visible)
      const endFetch = startPerfSpan('project.load.fetch', { projectId });
      let repos: Repo[] = [];
      let attachments: Attachment[] = [];
      let planItems: PlanItem[] = [];
      let worktrees: Worktree[] = [];

      try {
        const [resources] = await Promise.all([
          loadProjectResources(projectId),
          useGroupStore.getState().loadGroups(projectId),
        ]);
        repos = resources.repos;
        attachments = resources.attachments;
        planItems = resources.planItems;
        worktrees = resources.worktrees;
        endFetch({
          repoCount: repos.length,
          attachmentCount: attachments.length,
          planItemCount: planItems.length,
          worktreeCount: worktrees.length,
        });
      } catch (error) {
        endFetch({ error: true });
        throw error;
      }

        return;
      }

      // Load branches for repos (deferred to avoid blocking initial UI swap)
      const branchesById: Record<string, string | null> = {};
      const fetchBranches = async () => {
        const repoPaths = repos.map(getEffectiveRepoPath);
        const branchesByPath = await loadProjectRepoBranches(repoPaths);
        for (const repo of repos) {
          branchesById[repo.id] = branchesByPath[getEffectiveRepoPath(repo)] ?? null;
        }
      };

      // 2. Tear down old project resources
      await teardownWatchers();

        return;
      }

      if (previousConnectedProjectId && previousConnectedProjectId !== projectId) {
        // Reset all project-scoped stores when switching projects to prevent memory leaks
        // See projectScopedStores.ts to add new stores that need cleanup
        resetAllProjectScopedStores();
      }

        return;
      }

      // 3. Batch update all store state at once (atomic swap)
      applyLoadedProjectData({
        projectId,
        repos,
        attachments,
        planItems,
        worktrees,
      });

      const shouldRestoreChat = () =>
        useProjectDomainStore.getState().currentProjectId === projectId;

      const scheduleRepoTasks = () => {

        // 4. Setup new watchers (deferred)
        if (repos.length > 0) {
          watchedRepoPathsRef.current = watchProjectRepos(repos);
        } else {
          watchedRepoPathsRef.current = [];
        }

        // Fetch repo branches after watchers are scheduled.
        if (repos.length === 0) return;
        const endBranchFetch = startPerfSpan('repo.branches.fetch', { projectId, repoCount: repos.length });
        void (async () => {
          try {
            await fetchBranches();
            endBranchFetch({ repoCount: repos.length });
          } catch {
            endBranchFetch({ error: true });
            return;
          }

          setRepoBranches(branchesById);
        })();
      };

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      } else {
      }

      // Track project for session cleanup on switch
      previousConnectedProjectId = projectId;

      // Save as last opened project (non-blocking)
      persistLastOpenedProjectId(projectId).catch((err: unknown) => {
        console.warn('[useProjectLoader] Failed to persist last project:', err);
      });

      logPerfEvent('project.load.complete', {
        projectId,
        repoCount: repos.length,
        attachmentCount: attachments.length,
        planItemCount: planItems.length,
        worktreeCount: worktrees.length,
      });
    } finally {
        setProjectSwitching(false);
      }
      endTotal();
    }

  const createProject = useCallback(async (input: {
    name: string;
    repoPaths?: string[];
    folderPath?: string;
  }) => {
    const project = await createProjectRecord({
      name: input.name,
      folderPath: input.folderPath,
    });
    addProject(project);
    await loadProjectData(project.id);

    if (input.repoPaths && input.repoPaths.length > 0) {
      await addReposToProject(project.id, input.repoPaths);
    }

    return project;
  }, [addProject, addReposToProject, loadProjectData]);

  const deleteCurrentProject = useCallback(async () => {
    if (!currentProjectId) return;

    // Disconnect ALL streaming sessions before deleting project
    if (previousConnectedProjectId === currentProjectId) {
      try {
        await disconnectActiveChatSessions(currentProjectId);
      } catch {
        // Best effort - continue with delete
      }
      previousConnectedProjectId = null;
    }

    // Delete via API
    await deleteProjectRecord(currentProjectId);

    // Remove from store
    removeProject(currentProjectId);

    // Reset all project-scoped stores so stale data from the deleted project is cleared
    resetAllProjectScopedStores();

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
      const endList = startPerfSpan('project.list');
      const projects = await listProjects();
      endList({ projectCount: projects.length });
      setProjects(projects);

      if (projects.length > 0) {
        // Try to load the last opened project
        const lastProjectId = await getLastOpenedProjectId();
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
    return subscribeToProjectMenuEvents({
      onNewProject: onRequestNewProject,
      onOpenProject: loadProjectData,
    });
  }, [loadProjectData, onRequestNewProject]);

  // Listen for repo branch changes
  useEffect(() => {
    const unsubBranchChange = subscribeToRepoBranchChanges(
      ({ repoId, branch }) => {
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
