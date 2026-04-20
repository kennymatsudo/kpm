import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useCredentialStore,
  useTrackerStore,
  useExportStore,
  useSyncStore,
  usePlanDomainStore,
} from '../../../stores';
import type {
  TrackerCredentialInfo,
  TrackerAssociationWithScope,
  TrackerType,
} from '../../../../shared/types';

interface TrackerTopBarDeps {
  currentProjectId: string | null;
  trackerType: TrackerType;
}

interface TrackerTopBarReturn {
  // Derived state
  hasTrackerCredentials: boolean;
  trackerCredential: TrackerCredentialInfo | undefined;
  hasAssociations: boolean;
  associations: TrackerAssociationWithScope[];
  // Sync panel for association
  syncPanelAssociationId: string | null;
  setSyncPanelAssociationId: (id: string | null) => void;
  // Export
  queueCount: number;
  // Handlers
  handleTrackerClick: () => void;
  handleSyncComplete: () => Promise<void>;
  handleExportComplete: () => Promise<void>;
}

export function useTrackerTopBarIntegration({
  currentProjectId,
  trackerType,
}: TrackerTopBarDeps): TrackerTopBarReturn {
  const [syncPanelAssociationId, setSyncPanelAssociationId] = useState<string | null>(null);

  // Credential store
  const {
    credentials,
    loadCredentials,
    setShowDialog: setShowCredentialsDialog,
    setSelectedTrackerType,
  } = useCredentialStore(
    useShallow((state) => ({
      credentials: state.credentials,
      loadCredentials: state.loadCredentials,
      setShowDialog: state.setShowDialog,
      setSelectedTrackerType: state.setSelectedTrackerType,
    }))
  );

  // Tracker store (associations)
  const {
    associations,
    loadAssociations,
    setShowAssociationDialog,
    hasAssociationItems,
  } = useTrackerStore(
    useShallow((state) => ({
      associations: state.associations,
      loadAssociations: state.loadAssociations,
      setShowAssociationDialog: state.setShowAssociationDialog,
      hasAssociationItems: state.hasAssociationItems,
    }))
  );

  // Sync store
  const {
    discardSync,
    checkForUpdates,
    clearSyncAvailability,
  } = useSyncStore(
    useShallow((state) => ({
      discardSync: state.discardSync,
      checkForUpdates: state.checkForUpdates,
      clearSyncAvailability: state.clearSyncAvailability,
    }))
  );

  // Export store
  const {
    queueCount,
    refreshQueueCount,
    setShowQueuePanel,
  } = useExportStore(
    useShallow((state) => ({
      queueCount: state.queueCount,
      refreshQueueCount: state.refreshQueueCount,
      setShowQueuePanel: state.setShowQueuePanel,
    }))
  );

  const refreshPlanItems = usePlanDomainStore((state) => state.refreshPlanItems);

  const trackerCredential = credentials.find((credential) => credential.type === trackerType);
  const hasTrackerCredentials = Boolean(trackerCredential);
  const trackerAssociations = associations.filter(
    (association) => association.tracker_type === trackerType
  );
  const hasAssociations = trackerAssociations.length > 0;

  // Load tracker credentials on mount
  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  // Load associations when project changes
  useEffect(() => {
    if (currentProjectId) {
      void loadAssociations(currentProjectId);
      void refreshQueueCount(currentProjectId);
    }
  }, [currentProjectId, loadAssociations, refreshQueueCount]);

  // A project uses exactly one tracker. When associations exist, lock the global
  // selectedTrackerType to match so the UI (TopBar, settings modal) can't drift
  // into showing the other tracker for this project.
  const projectTrackerType = associations.find(
    (a) => a.kpm_project_id === currentProjectId
  )?.tracker_type ?? null;
  useEffect(() => {
    if (projectTrackerType && projectTrackerType !== trackerType) {
      setSelectedTrackerType(projectTrackerType);
    }
  }, [projectTrackerType, trackerType, setSelectedTrackerType]);

  useEffect(() => {
    if (!currentProjectId || trackerAssociations.length === 0) return;

    let disposed = false;

    const runCheck = async () => {
      if (disposed || document.visibilityState !== 'visible') return;

      const importedResults = await Promise.all(
        trackerAssociations.map(async (association) => ({
          association,
          isImported: await hasAssociationItems(association.id),
        }))
      );

      if (disposed) return;

      await Promise.all(
        importedResults.map(async ({ association, isImported }) => {
          if (!isImported) {
            clearSyncAvailability(association.id);
            return;
          }

          await checkForUpdates(currentProjectId, association.id);
        })
      );
    };

    void runCheck();

    const intervalId = window.setInterval(() => {
      void runCheck();
    }, 120000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runCheck();
      }
    };

    const handleFocus = () => {
      void runCheck();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [
    currentProjectId,
    trackerAssociations,
    hasAssociationItems,
    checkForUpdates,
    clearSyncAvailability,
  ]);

  // Handle tracker button click
  const handleTrackerClick = useCallback(() => {
    if (!hasTrackerCredentials) {
      setShowCredentialsDialog(true);
      return;
    }
    if (!hasAssociations) {
      setShowAssociationDialog(true);
      return;
    }
    if (trackerAssociations[0]) {
      setSyncPanelAssociationId(trackerAssociations[0].id);
    }
  }, [
    hasTrackerCredentials,
    hasAssociations,
    trackerAssociations,
    setShowCredentialsDialog,
    setShowAssociationDialog,
    setSyncPanelAssociationId,
  ]);

  // Handle sync completion
  const handleSyncComplete = useCallback(async () => {
    discardSync();
    await refreshPlanItems();
    if (currentProjectId) {
      void loadAssociations(currentProjectId);
    }
  }, [discardSync, refreshPlanItems, currentProjectId, loadAssociations]);

  // Handle export completion
  const handleExportComplete = useCallback(async () => {
    setShowQueuePanel(false);
    await refreshPlanItems();
    if (currentProjectId) {
      void loadAssociations(currentProjectId);
      void refreshQueueCount(currentProjectId);
    }
  }, [setShowQueuePanel, refreshPlanItems, currentProjectId, loadAssociations, refreshQueueCount]);

  return {
    hasTrackerCredentials,
    trackerCredential,
    hasAssociations,
    associations: trackerAssociations,
    syncPanelAssociationId,
    setSyncPanelAssociationId,
    queueCount,
    handleTrackerClick,
    handleSyncComplete,
    handleExportComplete,
  };
}
