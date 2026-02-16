import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useCredentialStore,
  useTrackerStore,
  useExportStore,
  useSyncStore,
  usePlanDomainStore,
} from '../../../stores';

  currentProjectId: string | null;
}

  // Derived state
  hasAssociations: boolean;
  associations: TrackerAssociationWithScope[];
  // Sync panel for association
  syncPanelAssociationId: string | null;
  setSyncPanelAssociationId: (id: string | null) => void;
  // Export
  queueCount: number;
  // Handlers
  handleSyncComplete: () => Promise<void>;
  handleExportComplete: () => Promise<void>;
}

  currentProjectId,
  const [syncPanelAssociationId, setSyncPanelAssociationId] = useState<string | null>(null);

  // Credential store
  const {
    credentials,
    loadCredentials,
    setShowDialog: setShowCredentialsDialog,
  } = useCredentialStore(
    useShallow((state) => ({
      credentials: state.credentials,
      loadCredentials: state.loadCredentials,
      setShowDialog: state.setShowDialog,
    }))
  );

  // Tracker store (associations)
  const {
    associations,
    loadAssociations,
    setShowAssociationDialog,
  } = useTrackerStore(
    useShallow((state) => ({
      associations: state.associations,
      loadAssociations: state.loadAssociations,
      setShowAssociationDialog: state.setShowAssociationDialog,
    }))
  );

  // Sync store
    useShallow((state) => ({
      discardSync: state.discardSync,
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

      setShowCredentialsDialog(true);
      return;
    }
    if (!hasAssociations) {
      setShowAssociationDialog(true);
      return;
    }

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
    hasAssociations,
    syncPanelAssociationId,
    setSyncPanelAssociationId,
    queueCount,
    handleSyncComplete,
    handleExportComplete,
  };
}
