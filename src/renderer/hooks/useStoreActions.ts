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


/**
 * Returns stable references to project-domain actions.
 * Does not subscribe to store state.
 */
export function useProjectDomainActions() {
}

/**
 * Returns stable references to resource-domain actions.
 * Does not subscribe to store state.
 */
export function useResourceDomainActions() {
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
