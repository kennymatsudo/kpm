import { useEffect, useState } from 'react';
import {
  useSyncStore,
  useTrackerStore,
  useExportStore,
  usePlanDomainStore,
  useProjectDomainStore,
} from '../../../stores';
import { CloseIcon } from '../../icons';
import { LoadingSpinner } from '../../ui/LoadingButton';
import { Z_INDEX } from '../../../constants/zIndex';
import { TrackerIcon, trackerLabelFor } from '../shared/trackerDisplay';

interface TrackerSyncPanelProps {
  associationId: string;
  onClose: () => void;
}

export function TrackerSyncPanel({ associationId, onClose }: TrackerSyncPanelProps) {
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const refreshPlanItems = usePlanDomainStore((state) => state.refreshPlanItems);

  const {
    isSyncing,
    startSync,
    setupProgressListener: setupSyncProgressListener,
  } = useSyncStore();

  const {
    loadAssociations,
    getAssociationById,
    updateAssociationEpicKey,
    hasAssociationItems,
    importAll,
    isImporting,
    importProgress,
    importError,
    clearError,
    setupImportProgressListener,
  } = useTrackerStore();

  const {
    getQueueCountForAssociation,
    setShowQueuePanel,
    setShowMappingDialog,
    refreshQueueCount,
  } = useExportStore();

  const queueCount = getQueueCountForAssociation(associationId);

  const [isImported, setIsImported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const association = getAssociationById(associationId);

  // Epic key state
  const [epicKey, setEpicKey] = useState(association?.epic_key ?? '');
  const [isSavingEpicKey, setIsSavingEpicKey] = useState(false);

  // Clear any stale errors when panel opens
  useEffect(() => {
    clearError();

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

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  const handleSaveEpicKey = async () => {
    setIsSavingEpicKey(true);
    try {
      const result = await updateAssociationEpicKey(associationId, epicKey.trim() || null);
      if (!result.success && currentProjectId) {
        void loadAssociations(currentProjectId);
      }
    } finally {
      setIsSavingEpicKey(false);
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

  const trackerLabel = trackerLabelFor(association.tracker_type);
  const isLinear = association.tracker_type === 'linear';
  const filterLabel = isLinear ? 'Filter' : 'JQL Filter';
  const linkedEntity = isLinear ? 'team' : 'project';

  return (
    <div className="dialog-overlay" style={{ zIndex: Z_INDEX.panel }}>
      <div className="dialog-content flex flex-col" style={{ maxWidth: '42rem', maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <div className="flex items-center gap-3">
            <TrackerIcon trackerType={association.tracker_type} className="w-6 h-6 text-info" />
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
                  <label className="text-xs text-text-muted uppercase tracking-wide">{isLinear ? 'Team Key' : 'Project Key'}</label>
                  <p className="text-sm text-text-primary font-medium">{association.project_key}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wide">{filterLabel}</label>
                  <p className="text-sm text-text-primary font-mono break-words">{association.jql_filter}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wide">Last Synced</label>
                  <p className="text-sm text-text-primary">{formatRelativeTime(association.last_synced_at)}</p>
                </div>
                {/* Parent Epic is a Jira-specific concept; Linear uses Projects (not yet wired). */}
                {!isLinear && (
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Parent Epic</label>
                    <p className="text-xs text-text-muted mb-1">New items will be created under this epic</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={epicKey}
                        onChange={(e) => setEpicKey(e.target.value.toUpperCase())}
                        placeholder="e.g., PROJ-1234"
                        className="flex-1 bg-surface-3 text-text-primary text-sm rounded-lg px-3 py-1.5 border border-border-default focus:border-accent focus:outline-none placeholder:text-text-muted font-mono"
                      />
                      <button
                        onClick={handleSaveEpicKey}
                        disabled={isSavingEpicKey || epicKey === (association.epic_key ?? '')}
                        className="btn btn-secondary text-sm px-3 py-1.5"
                      >
                        {isSavingEpicKey ? <LoadingSpinner className="w-4 h-4" color="accent" /> : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-3">
                {isImported ? (
                  <>
                    <p className="text-sm text-text-muted">
                      Sync to pull updates from {trackerLabel} or push your changes back.
                    </p>
                    <button
                      onClick={handleSync}
                      disabled={isSyncing}
                      className="w-full btn btn-primary"
                    >
                      {isSyncing ? (
                        <>
                          <LoadingSpinner className="w-4 h-4" color="white" />
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Sync Now
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-text-muted">
                      Import existing {trackerLabel} issues or export local items to {trackerLabel}.
                    </p>
                    <button
                      onClick={handleImport}
                      disabled={isImporting}
                      className="w-full btn btn-secondary"
                    >
                      {isImporting ? (
                        <>
                          <LoadingSpinner className="w-4 h-4" color="accent" />
                          {importProgress?.phase === 'fetching'
                            ? `Fetching... ${importProgress.fetched ?? 0}`
                            : 'Importing...'}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Import from {trackerLabel}
                        </>
                      )}
                    </button>
                    {importError && (
                      <div className="p-3 rounded-lg bg-danger/10 border border-danger/20">
                        <p className="text-sm text-danger">{importError}</p>
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={handleExport}
                  className={isImported ? "w-full btn btn-secondary" : "w-full btn btn-primary"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Export Queue
                  {queueCount > 0 && (
                    <span className="bg-accent text-white text-xs px-2 py-0.5 rounded-full">
                      {queueCount}
                    </span>
                  )}
                </button>

                {/* Type mappings are a Jira concept — Linear has no equivalent. */}
                {!isLinear && (
                  <button
                    onClick={handleOpenMappings}
                    className="w-full text-center text-sm text-text-muted hover:text-text-primary transition-colors py-2"
                  >
                    Configure type mappings...
                  </button>
                )}
                {isLinear && (
                  <p className="text-center text-xs text-text-tertiary py-2">
                    Syncing {linkedEntity}: {association.project_name ?? association.project_key}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
