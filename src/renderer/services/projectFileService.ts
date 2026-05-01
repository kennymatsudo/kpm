import type { FileNode } from '../../shared/types';

export interface ProjectFileChangeEvent {
  projectId: string;
  type: 'created' | 'updated' | 'deleted' | 'renamed';
  path: string;
  newPath?: string;
  isDirectory: boolean;
}

export function watchProjectFiles(projectId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.watchProject(projectId);
}

  return window.api.fileExplorer.unwatchProject();
}

export function copyExternalProjectFile(
  projectId: string,
  sourcePath: string,
  destinationPath: string
  return window.api.fileExplorer.copyExternalFile(projectId, sourcePath, destinationPath);
}

export function createProjectTextFile(
  projectId: string,
  path: string,
  content: string
): Promise<FileNode> {
  return window.api.fileExplorer.createFile(projectId, path, content);
}

export function createProjectBinaryFile(
  projectId: string,
  path: string,
  data: Uint8Array
): Promise<FileNode> {
  return window.api.fileExplorer.createBinaryFile(projectId, path, data);
}

export function listProjectDirectory(
  projectId: string,
  path?: string,
  options?: { recursive?: boolean; depth?: number }
): Promise<FileNode[]> {
  return window.api.fileExplorer.listDirectory(projectId, path, options);
}

export function createProjectFolder(projectId: string, path: string): Promise<FileNode> {
  return window.api.fileExplorer.createFolder(projectId, path);
}

export function createProjectSymlink(
  projectId: string,
  targetPath: string,
  linkPath: string
): Promise<FileNode> {
  return window.api.fileExplorer.createSymlink(projectId, targetPath, linkPath);
}

export function deleteProjectEntry(
  projectId: string,
  path: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.delete(projectId, path);
}

export function renameProjectEntry(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<FileNode> {
  return window.api.fileExplorer.rename(projectId, oldPath, newPath);
}

export function showProjectItemInFolder(
  projectId: string,
  path: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.showItemInFolder(projectId, path);
}

export function subscribeToProjectFileChanges(
  callback: (event: ProjectFileChangeEvent) => void
): () => void {
  return window.api.fileExplorer.onFileChange(callback);
}
