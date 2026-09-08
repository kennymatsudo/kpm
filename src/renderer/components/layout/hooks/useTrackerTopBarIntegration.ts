import { useState, useEffect, useCallback, useRef } from 'react';
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

/** Ceiling on skipped availability polls, so an outage backs off to ~30 min, not forever. */
const MAX_AVAILABILITY_BACKOFF_TICKS = 15;

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

  // Per-association poll backoff: association id -> ticks left to skip, and the
  // consecutive-failure count that sizes the next skip. Refs, so a re-render or
  // a change in the association list doesn't reset an in-progress backoff.
  const availabilityBackoffRef = useRef<Map<string, number>>(new Map());
  const consecutiveFailuresRef = useRef<Map<string, number>>(new Map());

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
    const backoff = availabilityBackoffRef.current;
    const failures = consecutiveFailuresRef.current;

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
            backoff.delete(association.id);
            failures.delete(association.id);
            return;
          }

          const skipped = backoff.get(association.id) ?? 0;
          if (skipped > 0) {
            backoff.set(association.id, skipped - 1);
            return;
          }

          const availability = await checkForUpdates(currentProjectId, association.id);
          if (availability) {
            backoff.delete(association.id);
            failures.delete(association.id);
            return;
          }
          // A failed check means a full preview generation round-tripped to the
          // tracker and timed out, so retrying on every 2-minute tick during an
          // outage buys nothing and floods the main-process log. Double the
          // ticks skipped per consecutive failure.
          const consecutive = (failures.get(association.id) ?? 0) + 1;
          failures.set(association.id, consecutive);
          backoff.set(association.id, Math.min(2 ** (consecutive - 1), MAX_AVAILABILITY_BACKOFF_TICKS));
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
      // Opening the panel is the user's explicit "check now", so drop any
      // outage backoff rather than making them wait out the skip window.
      availabilityBackoffRef.current.clear();
      consecutiveFailuresRef.current.clear();
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
