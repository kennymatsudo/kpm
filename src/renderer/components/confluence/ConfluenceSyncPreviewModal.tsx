/**
 * Confluence Sync Preview Modal
 *
 * Shows sync state and allows push/pull operations.
 */

import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { useConfluenceStore } from '../../stores/confluenceStore';
import { useShallow } from 'zustand/react/shallow';
import type { ConfluencePageLink } from '../../../shared/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  link: ConfluencePageLink;
  onContentUpdated?: () => void;
}

export function ConfluenceSyncPreviewModal({
  isOpen,
  onClose,
  projectId,
  link,
  onContentUpdated,
}: Props) {
  const {
    syncPreview,
    isSyncing,
    syncError,
    loadSyncPreview,
    executePush,
    executePull,
    setSyncPreview,
    setSyncError,
  } = useConfluenceStore(
    useShallow((s) => ({
      syncPreview: s.syncPreview,
      isSyncing: s.isSyncing,
      syncError: s.syncError,
      loadSyncPreview: s.loadSyncPreview,
      executePush: s.executePush,
      executePull: s.executePull,
      setSyncPreview: s.setSyncPreview,
      setSyncError: s.setSyncError,
    }))
  );

  useEffect(() => {
    if (isOpen) {
      void loadSyncPreview(projectId, link.document_path);
    }
    return () => {
      setSyncPreview(null);
      setSyncError(null);
    };
  }, [isOpen, projectId, link.document_path, loadSyncPreview, setSyncPreview, setSyncError]);

  const handlePush = async () => {
    const result = await executePush(projectId, link.document_path);
    if (result.success) {
      onContentUpdated?.();
      onClose();
    }
  };

  const handlePull = async () => {
    const success = await executePull(projectId, link.document_path);
    if (success) {
      onContentUpdated?.();
      onClose();
    }
  };

  const handleClose = () => {
    if (!isSyncing) {
      onClose();
    }
  };

  const renderStatus = () => {
    if (!syncPreview) return null;

    if (syncPreview.hasConflict) {
      return (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
          <div className="font-medium text-yellow-500 mb-1">Conflict Detected</div>
          <div className="text-sm text-text-secondary">
            Both the local document and Confluence page have changed since the last sync.
            Choose which version to keep.
          </div>
        </div>
      );
    }

    if (syncPreview.localChanged && !syncPreview.remoteChanged) {
      return (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
          <div className="font-medium text-blue-500 mb-1">Local Changes</div>
          <div className="text-sm text-text-secondary">
            The local document has been modified. Push to update Confluence.
          </div>
        </div>
      );
    }

    if (!syncPreview.localChanged && syncPreview.remoteChanged) {
      return (
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-md">
          <div className="font-medium text-purple-500 mb-1">Remote Changes</div>
          <div className="text-sm text-text-secondary">
            The Confluence page has been modified. Pull to update the local document.
          </div>
        </div>
      );
    }

    return (
      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md">
        <div className="font-medium text-green-500 mb-1">In Sync</div>
        <div className="text-sm text-text-secondary">
          The local document and Confluence page are synchronized.
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      preventClose={isSyncing}
      aria-labelledby="sync-preview-title"
    >
      <ModalHeader id="sync-preview-title" onClose={handleClose}>
        Confluence Sync
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-text-muted mb-1">Document</div>
              <div className="text-text-primary font-medium truncate">
                {link.document_path}
              </div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Confluence Page</div>
              <div className="text-text-primary font-medium truncate">
                {link.page_title ?? link.page_id}
              </div>
            </div>
          </div>

          {isSyncing && !syncPreview ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-text-secondary">Loading sync status...</span>
            </div>
          ) : syncError ? (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">
              {syncError}
            </div>
          ) : (
            renderStatus()
          )}

          {syncPreview && (
            <div className="text-xs text-text-muted">
              Last synced: {link.last_synced_at ? new Date(link.last_synced_at).toLocaleString() : 'Never'}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <MotionButton
          variant="secondary"
          onClick={handleClose}
          disabled={isSyncing}
        >
          Cancel
        </MotionButton>

        {syncPreview && (
          <>
            <MotionButton
              variant="secondary"
              onClick={handlePull}
              disabled={isSyncing}
            >
              {isSyncing ? 'Pulling...' : 'Pull from Confluence'}
            </MotionButton>
            <MotionButton
              variant="primary"
              onClick={handlePush}
              disabled={isSyncing}
            >
              {isSyncing ? 'Pushing...' : 'Push to Confluence'}
            </MotionButton>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
