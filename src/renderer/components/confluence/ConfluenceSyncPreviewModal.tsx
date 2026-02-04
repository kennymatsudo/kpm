/**
 * Confluence Sync Preview Modal
 *
 * Shows sync state and allows push/pull operations.
 */

import { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { DiffViewer, getDiffStats } from '../ui/DiffViewer';
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
  const [showDiff, setShowDiff] = useState(false);
  const [diffDirection, setDiffDirection] = useState<'push' | 'pull'>('push');

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
      setShowDiff(false);
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

    // Handle initial sync state (never synced before)
    if (syncPreview.isInitialSync && syncPreview.hasContentDifference) {
      const localHasContent = syncPreview.localContent.trim().length > 0;
      const remoteHasContent = syncPreview.remoteContent.trim().length > 0;

      let description: string;
      if (localHasContent && !remoteHasContent) {
        description = 'The local document has content but the Confluence page is empty. Push to populate Confluence.';
      } else if (!localHasContent && remoteHasContent) {
        description = 'The Confluence page has content but the local document is empty. Pull to populate the local document.';
      } else {
        description = 'The local document and Confluence page have different content. Choose which version to keep.';
      }

      return (
        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md">
          <div className="font-medium text-orange-500 mb-1">Initial Sync Required</div>
          <div className="text-sm text-text-secondary">{description}</div>
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
      size="xl"
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

          {/* Only show diff when there are actionable changes, not just round-trip formatting differences */}
          {syncPreview && (
            syncPreview.localChanged ||
            syncPreview.remoteChanged ||
            syncPreview.hasConflict ||
            (syncPreview.isInitialSync && syncPreview.hasContentDifference)
          ) && (
            <div className="space-y-3">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showDiff ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Preview changes</span>
                <DiffStats localContent={syncPreview.localContent} remoteContent={syncPreview.remoteContent} direction={diffDirection} />
              </button>

              {showDiff && (
                <div className="border border-border-subtle rounded-lg overflow-hidden">
                  {/* Segmented control header */}
                  <div className="flex items-center gap-3 px-3 py-2 bg-surface-1 border-b border-border-subtle">
                    <span className="text-xs text-text-muted">Preview:</span>
                    <div className="flex rounded-md bg-surface-2 p-0.5">
                      <button
                        onClick={() => setDiffDirection('push')}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          diffDirection === 'push'
                            ? 'bg-surface-0 text-text-primary shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Push
                      </button>
                      <button
                        onClick={() => setDiffDirection('pull')}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          diffDirection === 'pull'
                            ? 'bg-surface-0 text-text-primary shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Pull
                      </button>
                    </div>
                    <span className="text-xs text-text-muted">
                      {diffDirection === 'push' ? 'Local' : 'Confluence'}
                      <svg className="inline-block w-3 h-3 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      {diffDirection === 'push' ? 'Confluence' : 'Local'}
                    </span>
                  </div>
                  {/* Diff viewer */}
                  <div className="max-h-64 overflow-y-auto">
                    <DiffViewer
                      oldContent={diffDirection === 'push' ? syncPreview.remoteContent : syncPreview.localContent}
                      newContent={diffDirection === 'push' ? syncPreview.localContent : syncPreview.remoteContent}
                    />
                  </div>
                </div>
              )}
            </div>
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

/** Helper component to show diff statistics inline */
function DiffStats({
  localContent,
  remoteContent,
  direction,
}: {
  localContent: string;
  remoteContent: string;
  direction: 'push' | 'pull';
}) {
  const stats = getDiffStats(
    direction === 'push' ? remoteContent : localContent,
    direction === 'push' ? localContent : remoteContent
  );

  if (stats.addedCount === 0 && stats.removedCount === 0) {
    return null;
  }

  return (
    <span className="text-xs text-text-muted">
      {stats.addedCount > 0 && (
        <span className="text-success">+{stats.addedCount}</span>
      )}
      {stats.addedCount > 0 && stats.removedCount > 0 && ' / '}
      {stats.removedCount > 0 && (
        <span className="text-danger">-{stats.removedCount}</span>
      )}
      <span className="ml-1">lines</span>
    </span>
  );
}
