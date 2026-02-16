import { useState, useCallback } from 'react';

interface ConfluenceLinksDeps {
  projectId: string;
  contextMenuPath: string | null;
  unlinkDocument: (projectId: string, documentPath: string) => Promise<boolean>;
  setContextMenu: (value: null) => void;
}

export function useConfluenceLinks({
  projectId,
  contextMenuPath,
  unlinkDocument,
  setContextMenu,
}: ConfluenceLinksDeps) {
  const [confluenceLinkPath, setConfluenceLinkPath] = useState<string | null>(null);
  const [confluenceSyncPath, setConfluenceSyncPath] = useState<string | null>(null);
  const [unlinkConfirmPath, setUnlinkConfirmPath] = useState<string | null>(null);

  const handleLinkToConfluence = useCallback(() => {
    if (contextMenuPath) {
      setConfluenceLinkPath(contextMenuPath);
    }
  }, [contextMenuPath]);

  const handleSyncConfluence = useCallback(() => {
    if (contextMenuPath) {
      setConfluenceSyncPath(contextMenuPath);
    }
  }, [contextMenuPath]);

  const handleCloseLinkModal = useCallback(() => {
    setConfluenceLinkPath(null);
  }, []);

  const handleCloseSyncModal = useCallback(() => {
    setConfluenceSyncPath(null);
  }, []);

  const handleRequestUnlink = useCallback(() => {
    if (contextMenuPath) {
      setUnlinkConfirmPath(contextMenuPath);
      setContextMenu(null);
    }
  }, [contextMenuPath, setContextMenu]);

  const handleCancelUnlink = useCallback(() => {
    setUnlinkConfirmPath(null);
  }, []);

  const handleConfirmUnlink = useCallback(async () => {
    if (!unlinkConfirmPath || !projectId) return;
    await unlinkDocument(projectId, unlinkConfirmPath);
    setUnlinkConfirmPath(null);
  }, [unlinkConfirmPath, projectId, unlinkDocument]);

  return {
    confluenceLinkPath,
    confluenceSyncPath,
    unlinkConfirmPath,
    handleLinkToConfluence,
    handleSyncConfluence,
    handleCloseLinkModal,
    handleCloseSyncModal,
    handleRequestUnlink,
    handleCancelUnlink,
    handleConfirmUnlink,
  };
}
