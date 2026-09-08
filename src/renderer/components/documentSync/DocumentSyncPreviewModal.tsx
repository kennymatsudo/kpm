import { useEffect, useState, type ReactNode } from 'react';
import type { DocumentSyncPreview } from '../../../shared/types';
import { ChevronRightIcon } from '../icons';
import { DiffViewer, getDiffStats } from '../ui/DiffViewer';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { Tooltip } from '../ui/Tooltip';
import type { DocumentSyncActionResult } from '../../stores/documentSyncState';

interface DocumentSyncLink {
  readonly documentPath: string;
  readonly remoteName: string;
  readonly lastSyncedAt: string | null;
}

interface DocumentSyncOperations {
  readonly syncPreview: DocumentSyncPreview | null;
  readonly isSyncing: boolean;
  readonly syncError: string | null;
  readonly loadSyncPreview: (projectId: string, documentPath: string) => Promise<void>;
  readonly executePush: (
    projectId: string,
    documentPath: string,
    syncReceipt: string,
  ) => Promise<DocumentSyncActionResult>;
  readonly executePull: (
    projectId: string,
    documentPath: string,
    syncReceipt: string,
  ) => Promise<DocumentSyncActionResult>;
  readonly resetSync: () => void;
}

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly link: DocumentSyncLink;
  readonly remoteLabel: string;
  readonly remoteContentLabel: string;
  readonly remoteResourceLabel: string;
  readonly modalTitle: string;
  readonly operations: DocumentSyncOperations;
  readonly onContentUpdated?: () => void;
  readonly canPull?: boolean;
  readonly pullDisabledMessage?: string;
}

export function DocumentSyncPreviewModal({
  isOpen,
  onClose,
  projectId,
  link,
  remoteLabel,
  remoteContentLabel,
  remoteResourceLabel,
  modalTitle,
  operations,
  onContentUpdated,
  canPull = true,
  pullDisabledMessage,
}: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const [diffDirection, setDiffDirection] = useState<'push' | 'pull'>('push');
  const [writeError, setWriteError] = useState<string | null>(null);
  const { syncPreview, isSyncing, syncError, loadSyncPreview, executePush, executePull, resetSync } =
    operations;

  useEffect(() => {
    if (isOpen) {
      void loadSyncPreview(projectId, link.documentPath);
    }
    return () => {
      resetSync();
      setShowDiff(false);
      setWriteError(null);
    };
  }, [isOpen, projectId, link.documentPath, loadSyncPreview, resetSync]);

  const handlePush = async () => {
    if (!syncPreview) return;
    setWriteError(null);
    const result = await executePush(projectId, link.documentPath, syncPreview.pushReceipt);
    if (result.success) {
      onContentUpdated?.();
      onClose();
      return;
    }
    setWriteError(result.error ?? `Failed to push to ${remoteLabel}`);
    await loadSyncPreview(projectId, link.documentPath);
  };

  const handlePull = async () => {
    if (!syncPreview) return;
    setWriteError(null);
    const result = await executePull(projectId, link.documentPath, syncPreview.pullReceipt);
    if (result.success) {
      onContentUpdated?.();
      onClose();
      return;
    }
    setWriteError(result.error ?? `Failed to pull from ${remoteLabel}`);
    await loadSyncPreview(projectId, link.documentPath);
  };

  const handleClose = () => {
    if (!isSyncing) onClose();
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
        {modalTitle}
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <DocumentMetadata label="Document" value={link.documentPath} />
            <DocumentMetadata label={remoteResourceLabel} value={link.remoteName} />
          </div>

          {isSyncing && !syncPreview ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-text-secondary">Loading sync status...</span>
            </div>
          ) : writeError ?? syncError ? (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">
              {writeError ?? syncError}
            </div>
          ) : (
            <SyncStatus preview={syncPreview} remoteContentLabel={remoteContentLabel} />
          )}

          {syncPreview && <SyncDiff preview={syncPreview} remoteContentLabel={remoteContentLabel} showDiff={showDiff} onShowDiffChange={setShowDiff} direction={diffDirection} onDirectionChange={setDiffDirection} />}

          {syncPreview && (
            <div className="text-xs text-text-muted">
              Last synced: {link.lastSyncedAt ? new Date(link.lastSyncedAt).toLocaleString() : 'Never'}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <MotionButton variant="secondary" onClick={handleClose} disabled={isSyncing}>
          Cancel
        </MotionButton>

        {syncPreview && (
          <>
            {canPull ? (
              <MotionButton variant="secondary" onClick={handlePull} disabled={isSyncing}>
                {isSyncing ? 'Pulling...' : `Pull from ${remoteLabel}`}
              </MotionButton>
            ) : (
              <Tooltip content={pullDisabledMessage ?? ''} side="top">
                <span>
                  <MotionButton variant="secondary" disabled>
                    Pull from {remoteLabel}
                  </MotionButton>
                </span>
              </Tooltip>
            )}
            <MotionButton variant="primary" onClick={handlePush} disabled={isSyncing}>
              {isSyncing ? 'Pushing...' : `Push to ${remoteLabel}`}
            </MotionButton>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

function DocumentMetadata({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-text-primary font-medium truncate">{value}</div>
    </div>
  );
}

function SyncStatus({
  preview,
  remoteContentLabel,
}: {
  readonly preview: DocumentSyncPreview | null;
  readonly remoteContentLabel: string;
}) {
  if (!preview) return null;

  if (preview.hasConflict) {
    return <StatusNotice color="yellow" title="Conflict Detected">Both the local document and {remoteContentLabel} have changed since the last sync. Choose which version to keep.</StatusNotice>;
  }

  if (preview.isInitialSync && preview.hasContentDifference) {
    const localHasContent = preview.localContent.trim().length > 0;
    const remoteHasContent = preview.remoteContent.trim().length > 0;
    const description =
      localHasContent && !remoteHasContent
        ? `The local document has content but the ${remoteContentLabel} is empty. Push to populate ${remoteContentLabel}.`
        : !localHasContent && remoteHasContent
          ? `The ${remoteContentLabel} has content but the local document is empty. Pull to populate the local document.`
          : `The local document and ${remoteContentLabel} have different content. Choose which version to keep.`;

    return <StatusNotice color="orange" title="Initial Sync Required">{description}</StatusNotice>;
  }

  if (preview.localChanged && !preview.remoteChanged) {
    return <StatusNotice color="blue" title="Local Changes">The local document has been modified. Push to update {remoteContentLabel}.</StatusNotice>;
  }

  if (!preview.localChanged && preview.remoteChanged) {
    return <StatusNotice color="purple" title="Remote Changes">The {remoteContentLabel} has been modified. Pull to update the local document.</StatusNotice>;
  }

  return <StatusNotice color="green" title="In Sync">The local document and {remoteContentLabel} are synchronized.</StatusNotice>;
}

function StatusNotice({
  color,
  title,
  children,
}: {
  readonly color: 'yellow' | 'orange' | 'blue' | 'purple' | 'green';
  readonly title: string;
  readonly children: ReactNode;
}) {
  const colorClasses = {
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-500',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-500',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-500',
    green: 'bg-green-500/10 border-green-500/30 text-green-500',
  };

  return (
    <div className={`p-3 border rounded-md ${colorClasses[color]}`}>
      <div className="font-medium mb-1">{title}</div>
      <div className="text-sm text-text-secondary">{children}</div>
    </div>
  );
}

function SyncDiff({
  preview,
  remoteContentLabel,
  showDiff,
  onShowDiffChange,
  direction,
  onDirectionChange,
}: {
  readonly preview: DocumentSyncPreview;
  readonly remoteContentLabel: string;
  readonly showDiff: boolean;
  readonly onShowDiffChange: (showDiff: boolean) => void;
  readonly direction: 'push' | 'pull';
  readonly onDirectionChange: (direction: 'push' | 'pull') => void;
}) {
  const hasChanges =
    preview.localChanged ||
    preview.remoteChanged ||
    preview.hasConflict ||
    (preview.isInitialSync && preview.hasContentDifference);
  if (!hasChanges) return null;

  const stats = getDiffStats(
    direction === 'push' ? preview.remoteContent : preview.localContent,
    direction === 'push' ? preview.localContent : preview.remoteContent,
  );

  return (
    <div className="space-y-3">
      <button
        onClick={() => onShowDiffChange(!showDiff)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ChevronRightIcon className={`w-4 h-4 transition-transform ${showDiff ? 'rotate-90' : ''}`} />
        <span>Preview changes</span>
        <DiffStats addedCount={stats.addedCount} removedCount={stats.removedCount} />
      </button>

      {showDiff && (
        <div className="border border-border-subtle rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 bg-surface-1 border-b border-border-subtle">
            <span className="text-xs text-text-muted">Preview:</span>
            <div className="flex rounded-md bg-surface-2 p-0.5">
              <DirectionButton direction="push" selectedDirection={direction} onDirectionChange={onDirectionChange} />
              <DirectionButton direction="pull" selectedDirection={direction} onDirectionChange={onDirectionChange} />
            </div>
            <span className="text-xs text-text-muted">
              {direction === 'push' ? 'Local' : remoteContentLabel}
              <ChevronRightIcon className="inline-block w-3 h-3 mx-1" />
              {direction === 'push' ? remoteContentLabel : 'Local'}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <DiffViewer
              oldContent={direction === 'push' ? preview.remoteContent : preview.localContent}
              newContent={direction === 'push' ? preview.localContent : preview.remoteContent}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DirectionButton({
  direction,
  selectedDirection,
  onDirectionChange,
}: {
  readonly direction: 'push' | 'pull';
  readonly selectedDirection: 'push' | 'pull';
  readonly onDirectionChange: (direction: 'push' | 'pull') => void;
}) {
  return (
    <button
      onClick={() => onDirectionChange(direction)}
      className={`px-3 py-1 text-xs rounded transition-colors ${
        selectedDirection === direction
          ? 'bg-surface-0 text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {direction === 'push' ? 'Push' : 'Pull'}
    </button>
  );
}

function DiffStats({
  addedCount,
  removedCount,
}: {
  readonly addedCount: number;
  readonly removedCount: number;
}) {
  if (addedCount === 0 && removedCount === 0) return null;

  return (
    <span className="text-xs text-text-muted">
      {addedCount > 0 && <span className="text-success">+{addedCount}</span>}
      {addedCount > 0 && removedCount > 0 && ' / '}
      {removedCount > 0 && <span className="text-danger">-{removedCount}</span>}
      <span className="ml-1">lines</span>
    </span>
  );
}
