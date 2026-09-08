import { useCallback, useState } from 'react';
import { useLinearDocumentsStore } from '../../../stores/linearDocumentsStore';
import { toast } from '../../../stores/toastStore';

interface LinearDocumentLinksDeps {
  projectId: string;
  contextMenuPath: string | null;
  setContextMenu: (value: null) => void;
}

export function useLinearDocumentLinks({
  projectId,
  contextMenuPath,
  setContextMenu,
}: LinearDocumentLinksDeps) {
  const [publishPath, setPublishPath] = useState<string | null>(null);
  const [syncPath, setSyncPath] = useState<string | null>(null);
  const unlinkDocument = useLinearDocumentsStore((s) => s.unlinkDocument);

  const handlePublishToLinear = useCallback(() => {
    if (contextMenuPath) setPublishPath(contextMenuPath);
  }, [contextMenuPath]);

  const handleClosePublishModal = useCallback(() => {
    setPublishPath(null);
  }, []);

  const handleSyncLinear = useCallback(() => {
    if (contextMenuPath) setSyncPath(contextMenuPath);
  }, [contextMenuPath]);

  const handleCloseSyncModal = useCallback(() => {
    setSyncPath(null);
  }, []);

  const handleUnlinkFromLinear = useCallback(async () => {
    if (!contextMenuPath || !projectId) return;
    const path = contextMenuPath;
    setContextMenu(null);
    const unlinked = await unlinkDocument(projectId, path);
    if (!unlinked) toast.error('Failed to unlink from Linear');
  }, [contextMenuPath, projectId, unlinkDocument, setContextMenu]);

  return {
    publishPath,
    syncPath,
    handlePublishToLinear,
    handleClosePublishModal,
    handleSyncLinear,
    handleCloseSyncModal,
    handleUnlinkFromLinear,
  };
}
