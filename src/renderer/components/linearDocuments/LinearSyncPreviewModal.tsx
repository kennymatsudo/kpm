import { useShallow } from 'zustand/react/shallow';
import type { LinearDocumentLink } from '../../../shared/types';
import { DocumentSyncPreviewModal } from '../documentSync/DocumentSyncPreviewModal';
import { useLinearDocumentsStore } from '../../stores/linearDocumentsStore';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly link: LinearDocumentLink;
  readonly onContentUpdated?: () => void;
}

export function LinearSyncPreviewModal({
  isOpen,
  onClose,
  projectId,
  link,
  onContentUpdated,
}: Props) {
  const operations = useLinearDocumentsStore(
    useShallow((state) => ({
      syncPreview: state.syncPreview,
      isSyncing: state.isSyncing,
      syncError: state.syncError,
      loadSyncPreview: state.loadSyncPreview,
      executePush: state.executePush,
      executePull: state.executePull,
      resetSync: state.resetSync,
    })),
  );

  return (
    <DocumentSyncPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      projectId={projectId}
      link={{
        documentPath: link.document_path,
        remoteName: link.document_title ?? link.linear_document_id,
        lastSyncedAt: link.last_synced_at,
      }}
      remoteLabel="Linear"
      remoteContentLabel="Linear document"
      remoteResourceLabel="Linear document"
      modalTitle="Linear sync"
      operations={operations}
      onContentUpdated={onContentUpdated}
      canPull={link.direction !== 'push-only'}
      pullDisabledMessage="This file is the original. Switch the document to two-way sync to pull Linear edits back."
    />
  );
}
