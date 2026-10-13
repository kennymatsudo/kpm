import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCredentialStore, useExportStore, useSyncStore, useTrackerStore } from '../../stores';
import {
  TrackerConfigDialog,
  TrackerLinkProjectDialog,
  SyncReviewPanel,
  SyncReviewModal,
  TypeMappingDialog,
  TrackerSyncPanel,
} from '../tracker';
import type { TrackerAssociationWithScope, TrackerCredentialInfo, TrackerType } from '../../../shared/types';

export const TopBarTrackerOverlaysContent = memo(function TopBarTrackerOverlaysContent({
  currentProjectId,
  selectedTrackerType,
  trackerCredential,
  associations,
  syncPanelAssociationId,
  onCloseSyncPanel,
  onSyncComplete,
  onExportComplete,
}: {
  currentProjectId: string | null;
  selectedTrackerType: TrackerType;
  trackerCredential: TrackerCredentialInfo | null;
  associations: TrackerAssociationWithScope[];
  syncPanelAssociationId: string | null;
  onCloseSyncPanel: () => void;
  onSyncComplete: () => Promise<void>;
  onExportComplete: () => Promise<void>;
}) {
  const { showCredentialsDialog, setShowCredentialsDialog } = useCredentialStore(
    useShallow((state) => ({
      showCredentialsDialog: state.showDialog,
      setShowCredentialsDialog: state.setShowDialog,
    }))
  );
  const { showAssociationDialog, setShowAssociationDialog } = useTrackerStore(
    useShallow((state) => ({
      showAssociationDialog: state.showAssociationDialog,
      setShowAssociationDialog: state.setShowAssociationDialog,
    }))
  );
  const { showSyncPanel, discardSync } = useSyncStore(
    useShallow((state) => ({
      showSyncPanel: state.showPanel,
      discardSync: state.discardSync,
    }))
  );
  const {
    showQueuePanel,
    showMappingDialog,
    exportActiveAssociationId,
    activeScopeId,
    setShowQueuePanel,
    setShowMappingDialog,
  } = useExportStore(
    useShallow((state) => ({
      showQueuePanel: state.showQueuePanel,
      showMappingDialog: state.showMappingDialog,
      exportActiveAssociationId: state.activeAssociationId,
      activeScopeId: state.activeScopeId,
      setShowQueuePanel: state.setShowQueuePanel,
      setShowMappingDialog: state.setShowMappingDialog,
    }))
  );

  return (
    <>
      {showCredentialsDialog && (
        <TrackerConfigDialog
          trackerType={selectedTrackerType}
          credential={trackerCredential}
          onClose={() => setShowCredentialsDialog(false)}
        />
      )}

      {showAssociationDialog && trackerCredential && (
        <TrackerLinkProjectDialog
          trackerType={selectedTrackerType}
          siteUrl={trackerCredential.site_url ?? ''}
          onClose={() => setShowAssociationDialog(false)}
        />
      )}

      {syncPanelAssociationId && (
        <TrackerSyncPanel associationId={syncPanelAssociationId} onClose={onCloseSyncPanel} />
      )}

      {showSyncPanel && currentProjectId && (
        <SyncReviewPanel
          projectId={currentProjectId}
          onClose={() => discardSync()}
          onSyncComplete={onSyncComplete}
        />
      )}

      {showQueuePanel && exportActiveAssociationId && currentProjectId && (
        <SyncReviewModal
          projectId={currentProjectId}
          associationId={exportActiveAssociationId}
          onClose={() => setShowQueuePanel(false)}
          onExportComplete={onExportComplete}
        />
      )}

      {showMappingDialog && activeScopeId && currentProjectId && (
        <TypeMappingDialog
          projectId={currentProjectId}
          scopeId={activeScopeId}
          projectKey={associations.find((a) => a.scope_id === activeScopeId)?.project_key ?? ''}
          onClose={() => setShowMappingDialog(false)}
        />
      )}
    </>
  );
});
