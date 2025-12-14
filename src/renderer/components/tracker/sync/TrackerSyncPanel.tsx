import { useEffect, useState } from 'react';
  associationId: string;
  onClose: () => void;
}


  const {
    isSyncing,
    startSync,
    setupProgressListener: setupSyncProgressListener,
  } = useSyncStore();

  const {
    loadAssociations,
    hasAssociationItems,
    importAll,
    isImporting,
    importProgress,
    setupImportProgressListener,
  } = useTrackerStore();

  const {
    setShowQueuePanel,
    setShowMappingDialog,
    refreshQueueCount,
  } = useExportStore();

  const [isImported, setIsImported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);


  // Check if association has imported items
  useEffect(() => {
    const checkImported = async () => {
      if (!associationId) return;
      setIsLoading(true);
      const hasItems = await hasAssociationItems(associationId);
      setIsImported(hasItems);
      setIsLoading(false);
    };
    void checkImported();
  }, [associationId, hasAssociationItems]);

  // Setup listeners
  useEffect(() => {
    const cleanupImport = setupImportProgressListener();
    const cleanupSync = setupSyncProgressListener();
    return () => {
      cleanupImport();
      cleanupSync();
    };
  }, [setupImportProgressListener, setupSyncProgressListener]);

  // Load queue count
  useEffect(() => {
    if (currentProjectId) {
      void refreshQueueCount(currentProjectId);
    }
  }, [currentProjectId, refreshQueueCount]);

  const handleImport = async () => {
    if (!currentProjectId) return;
    const result = await importAll(currentProjectId, associationId);
    if (result) {
      await handleRefresh();
      setIsImported(true);
    }
  };

  const handleSync = async () => {
    if (!currentProjectId) return;
    await startSync(currentProjectId, associationId);
    await handleRefresh();
  };

  const handleExport = () => {
    setShowQueuePanel(true, associationId);
  };

  const handleOpenMappings = () => {
    if (association?.scope_id) {
      setShowMappingDialog(true, association.scope_id);
    }
  };

  const handleRefresh = async () => {
    await refreshPlanItems();
    if (currentProjectId) {
      void loadAssociations(currentProjectId);
      void refreshQueueCount(currentProjectId);
    }
  };

  const formatRelativeTime = (isoString: string | null): string => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString();
  };

  if (!association) return null;

  return (
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {association.display_name || association.project_key}
              </h2>
              {association.project_name && (
                <p className="text-sm text-text-muted">{association.project_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-2 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner className="w-6 h-6" color="accent" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Association details */}
              <div className="bg-surface-2 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-sm text-text-primary font-medium">{association.project_key}</p>
                </div>
                <div>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wide">Last Synced</label>
                  <p className="text-sm text-text-primary">{formatRelativeTime(association.last_synced_at)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                  <>
                    <p className="text-sm text-text-muted">
                    </p>
                    <button
                      className="w-full btn btn-primary"
                    >
                        <>
                          <LoadingSpinner className="w-4 h-4" color="white" />
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          </svg>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-text-muted">
                    </p>
                    <button
                    >
                        <>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          </svg>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
