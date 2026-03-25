/**
 * Store action hooks that provide stable references without causing re-renders.
 *
 * IMPORTANT: These hooks use getState() to access actions, which means they
 * don't create subscriptions. This is intentional - actions are stable references
 * that don't change between renders, so subscribing to the store just to get
 * them would cause unnecessary re-renders.
 *
 * Use these hooks in components that need to call store actions but don't need
 * to read store state (or read it via separate selectors).
 */

import { useExportStore } from '../stores';
import { useProjectStore } from '../stores/projectStore';

/**
 * Returns stable references to project-domain actions.
 * Does not subscribe to store state.
 */
export function useProjectDomainActions() {
  const state = useProjectStore.getState();
  return {
    setProjects: state.setProjects,
    addProject: state.addProject,
    removeProject: state.removeProject,
    setCurrentProject: state.setCurrentProject,
    refreshProjects: state.refreshProjects,
    updateProjectStorybookUrl: state.updateProjectStorybookUrl,
    testStorybookConnection: state.testStorybookConnection,
    reset: state.reset,
    resetProjectState: state.resetProjectState,
  };
}

/**
 * Returns stable references to resource-domain actions.
 * Does not subscribe to store state.
 */
export function useResourceDomainActions() {
  const state = useProjectStore.getState();
  return {
    setRepos: state.setRepos,
    setAttachments: state.setAttachments,
    addRepo: state.addRepo,
    addReposToProject: state.addReposToProject,
    addReposFromDialog: state.addReposFromDialog,
    removeRepo: state.removeRepo,
    removeRepoFromProject: state.removeRepoFromProject,
    addAttachment: state.addAttachment,
    removeAttachment: state.removeAttachment,
    refreshRepos: state.refreshRepos,
    setRepoBranches: state.setRepoBranches,
    setRepoBranch: state.setRepoBranch,
    updateRepoEnvironmentMode: state.updateRepoEnvironmentMode,
    setWorktrees: state.setWorktrees,
    addWorktree: state.addWorktree,
    removeWorktree: state.removeWorktree,
    openWorktreeInEditor: state.openWorktreeInEditor,
    deleteWorktree: state.deleteWorktree,
    destroyWorktree: state.destroyWorktree,
  };
}

/**
 * Returns stable references to exportStore actions.
 * Does not subscribe to store state - will not cause re-renders.
 */
export function useExportActions() {
  const store = useExportStore;
  return {
    loadQueue: store.getState().loadQueue,
    addToQueue: store.getState().addToQueue,
    addToQueueWithStatus: store.getState().addToQueueWithStatus,
    removeFromQueue: store.getState().removeFromQueue,
    clearQueue: store.getState().clearQueue,
    refreshQueueCount: store.getState().refreshQueueCount,
    loadMappings: store.getState().loadMappings,
    loadMappingsByScope: store.getState().loadMappingsByScope,
    saveMapping: store.getState().saveMapping,
    removeMapping: store.getState().removeMapping,
    createDefaultMappings: store.getState().createDefaultMappings,
    loadExportPreview: store.getState().loadExportPreview,
    setShowQueuePanel: store.getState().setShowQueuePanel,
    setShowMappingDialog: store.getState().setShowMappingDialog,
    clearError: store.getState().clearError,
  };
}
