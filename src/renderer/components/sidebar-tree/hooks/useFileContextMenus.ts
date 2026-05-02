import { useState, useCallback } from 'react';
import type { FocusedResource } from '../../../../shared/types';
import { getProjectAbsolutePath } from '../../../services/projectService';

interface FileContextMenusDeps {
  projectId: string;
  setProjectSelectedPath: (path: string) => void;
  deleteEntry: (path: string) => Promise<boolean>;
  getNodeByPath: (path: string) => { isDirectory: boolean } | null;
  removeFocusedResource: (resource: FocusedResource) => void;
  closeIfViewing: (path: string) => void;
}

export function useFileContextMenus({
  projectId,
  setProjectSelectedPath,
  deleteEntry,
  getNodeByPath,
  removeFocusedResource,
  closeIfViewing,
}: FileContextMenusDeps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(
    null
  );
  const [repoContextMenu, setRepoContextMenu] = useState<{
    x: number;
    y: number;
    repoId: string;
  } | null>(null);
  const [emptySpaceMenu, setEmptySpaceMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [_isDeletingFile, setIsDeletingFile] = useState(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.preventDefault();
      e.stopPropagation();
      setProjectSelectedPath(path);
      setContextMenu({ x: e.clientX, y: e.clientY, path });
    },
    [setProjectSelectedPath]
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRepoContextMenu = useCallback(
    (e: React.MouseEvent, repoId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setRepoContextMenu({ x: e.clientX, y: e.clientY, repoId });
    },
    []
  );

  const handleCloseRepoContextMenu = useCallback(() => {
    setRepoContextMenu(null);
  }, []);

  const handleEmptySpaceContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setEmptySpaceMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRequestDelete = useCallback(() => {
    if (contextMenu?.path) {
      setDeleteConfirmPath(contextMenu.path);
      setContextMenu(null);
    }
  }, [contextMenu?.path]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmPath(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmPath) return;
    setIsDeletingFile(true);
    const pathToDelete = deleteConfirmPath;
    try {
      const success = await deleteEntry(pathToDelete);
      if (success) {
        const node = getNodeByPath(pathToDelete);
        if (node) {
          const resource: FocusedResource = {
            type: 'project_file',
            path: pathToDelete,
            isDirectory: node.isDirectory,
          };
          removeFocusedResource(resource);
        }
        closeIfViewing(pathToDelete);
      }
    } finally {
      setDeleteConfirmPath(null);
      setIsDeletingFile(false);
    }
  }, [deleteConfirmPath, deleteEntry, getNodeByPath, removeFocusedResource, closeIfViewing]);

  const handleRevealInFinder = useCallback(
    async (path: string) => {
      if (projectId && path) {
        await showProjectItemInFolder(projectId, path);
      }
      setContextMenu(null);
    },
    [projectId]
  );

  const handleCopyFullPath = useCallback(
    async (path: string) => {
      if (projectId && path) {
        const fullPath = await getProjectAbsolutePath(projectId, path);
        if (fullPath) {
        }
      }
      setContextMenu(null);
    },
    [projectId]
  );

  const handleCopyRelativePath = useCallback((path: string) => {
    if (path) {
    }
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    repoContextMenu,
    emptySpaceMenu,
    deleteConfirmPath,
    setContextMenu,
    setRepoContextMenu,
    setEmptySpaceMenu,
    handleContextMenu,
    handleCloseContextMenu,
    handleRepoContextMenu,
    handleCloseRepoContextMenu,
    handleEmptySpaceContextMenu,
    handleRequestDelete,
    handleCancelDelete,
    handleConfirmDelete,
    handleRevealInFinder,
    handleCopyFullPath,
    handleCopyRelativePath,
  };
}
