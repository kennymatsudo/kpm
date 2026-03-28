import { useState, useCallback } from 'react';
import type { Project } from '../../../../shared/types';
import { listProjects, updateProject } from '../../../services/projectService';

interface ProjectEditDeps {
  currentProject: Project | null;
  currentProjectId: string | null;
  setProjects: (projects: Project[]) => void;
}

interface ProjectEditReturn {
  isEditing: boolean;
  editName: string;
  setEditName: (name: string) => void;
  handleStartEdit: () => void;
  handleSaveEdit: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useProjectEdit({
  currentProject,
  currentProjectId,
  setProjects,
}: ProjectEditDeps): ProjectEditReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const handleStartEdit = useCallback(() => {
    if (currentProject) {
      setEditName(currentProject.name);
      setIsEditing(true);
    }
  }, [currentProject]);

  const handleSaveEdit = useCallback(async () => {
    if (editName.trim() && editName !== currentProject?.name && currentProjectId) {
      await updateProject(currentProjectId, { name: editName.trim() });
      const projects = await listProjects();
      setProjects(projects);
    }
    setIsEditing(false);
  }, [editName, currentProject?.name, currentProjectId, setProjects]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleSaveEdit();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
      }
    },
    [handleSaveEdit]
  );

  return {
    isEditing,
    editName,
    setEditName,
    handleStartEdit,
    handleSaveEdit,
    handleKeyDown,
  };
}
