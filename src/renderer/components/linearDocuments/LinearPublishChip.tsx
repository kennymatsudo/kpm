/**
 * Published-to-Linear state for the file editor toolbar.
 *
 * Reads only the link row KPM recorded at the last sync — never Linear itself —
 * so opening a file costs no network call and the timestamp cannot drift into
 * behaving like a live feed. Syncing goes through the preview modal rather than
 * writing on click: without it, one press could overwrite edits made on the
 * other side.
 */

import { useCallback, useState } from 'react';
import { Tooltip } from '../ui/Tooltip';
import { useLinearDocumentsStore } from '../../stores/linearDocumentsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { readWorkspaceFile } from '../../services/workspaceFileService';
import { formatRelativeTime } from '../../utils/relativeTime';
import { LinearSyncPreviewModal } from './LinearSyncPreviewModal';

interface Props {
  projectId: string;
  documentId: string;
  documentPath: string;
}

export function LinearPublishChip({ projectId, documentId, documentPath }: Props) {
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const link = useLinearDocumentsStore(
    (s) => s.links.find((candidate) => candidate.document_path === documentPath) ?? null
  );
  const reloadDocument = useWorkspaceStore((s) => s.reloadDocument);

  /** A pull rewrites the file underneath the open buffer; without this the next
   *  autosave would put the stale buffer straight back. */
  const handleContentUpdated = useCallback(() => {
    void readWorkspaceFile('project', documentPath, projectId).then((content) => {
      reloadDocument(documentId, content);
    });
  }, [documentPath, projectId, documentId, reloadDocument]);

  if (!link) return null;

  const lastPushed = link.last_synced_at
    ? `Last synced ${formatRelativeTime(link.last_synced_at)}`
    : 'Not synced yet';
  const ownership =
    link.direction === 'push-only' ? 'This file is the original.' : 'Syncs both ways.';

  return (
    <>
      <Tooltip content={`Published to Linear. ${lastPushed}. ${ownership}`} side="bottom">
        <button
          type="button"
          onClick={() => setIsSyncOpen(true)}
          className="h-7 px-2 rounded-sm text-xs flex items-center gap-1.5 transition-colors
                     text-text-muted hover:text-text-primary hover:bg-surface-3"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span>Linear</span>
        </button>
      </Tooltip>

      {isSyncOpen && (
        <LinearSyncPreviewModal
          isOpen={true}
          onClose={() => setIsSyncOpen(false)}
          projectId={projectId}
          link={link}
          onContentUpdated={handleContentUpdated}
        />
      )}
    </>
  );
}
