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
      setSyncPanelAssociationId(trackerAssociations[0].id);
    }
  }, [
    hasTrackerCredentials,
    hasAssociations,
    trackerAssociations,
    setShowCredentialsDialog,
    setShowAssociationDialog,
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
