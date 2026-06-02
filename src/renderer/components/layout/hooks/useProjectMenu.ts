import { useState, useRef, useCallback } from 'react';
import type { Project } from '../../../../shared/types';
import { openProjectFolder } from '../../../services/projectService';
import { getBaseName } from '../../../utils/path';
import { copyToClipboard } from '../../../utils/clipboard';

interface ProjectMenuDeps {
  currentProject: Project | null;
  currentProjectId: string | null;
  onDeleteProject?: () => void;
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void;
}

interface ProjectMenuReturn {
  showMenu: boolean;
  showDeleteConfirm: boolean;
  menuPos: DOMRect | null;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  setShowMenu: (show: boolean) => void;
  setShowDeleteConfirm: (show: boolean) => void;
  handleOpenMenu: () => void;
  handleDeleteClick: () => void;
  handleConfirmDelete: () => void;
  handleOpenProject: (projectId: string) => void;
  handleNewProject: () => void;
  handleOpenProjectFolder: () => Promise<void>;
  handleCopyPath: () => void;
  handleCopyRelativePath: () => void;
}

export function useProjectMenu({
  currentProject,
  currentProjectId,
  onDeleteProject,
  onNewProject,
  onOpenProject,
}: ProjectMenuDeps): ProjectMenuReturn {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuPos, setMenuPos] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleOpenMenu = useCallback(() => {
    if (!showMenu && buttonRef.current) {
      setMenuPos(buttonRef.current.getBoundingClientRect());
    }
    setShowMenu((prev) => !prev);
  }, [showMenu]);

  const handleDeleteClick = useCallback(() => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    onDeleteProject?.();
  }, [onDeleteProject]);

  const handleOpenProject = useCallback(
    (projectId: string) => {
      setShowMenu(false);
      onOpenProject?.(projectId);
    },
    [onOpenProject]
  );

  const handleNewProject = useCallback(() => {
    setShowMenu(false);
    onNewProject?.();
  }, [onNewProject]);

  const handleOpenProjectFolder = useCallback(async () => {
    if (currentProjectId) {
      await openProjectFolder(currentProjectId);
    }
  }, [currentProjectId]);

  const handleCopyPath = useCallback(() => {
    if (currentProject?.folder_path) {
      void copyToClipboard(`"${currentProject.folder_path}"`, 'Path');
    }
    setShowMenu(false);
  }, [currentProject?.folder_path]);

  const handleCopyRelativePath = useCallback(() => {
    if (currentProject?.folder_path) {
      const folderName = getBaseName(currentProject.folder_path, currentProject.folder_path);
      void copyToClipboard(`"${folderName}"`, 'Folder name');
    }
    setShowMenu(false);
  }, [currentProject?.folder_path]);

  return {
    showMenu,
    showDeleteConfirm,
    menuPos,
    buttonRef,
    setShowMenu,
    setShowDeleteConfirm,
    handleOpenMenu,
    handleDeleteClick,
    handleConfirmDelete,
    handleOpenProject,
    handleNewProject,
    handleOpenProjectFolder,
    handleCopyPath,
    handleCopyRelativePath,
  };
}
