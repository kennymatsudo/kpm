import type { FileNode } from '../../shared/types';
import type { EndpointPayload } from '../../shared/ipc/endpoints';
import type { FileExplorerEndpointName, fileExplorerEndpoints } from '../../shared/ipc/fileExplorerEndpoints';

type FileExplorerEndpointPayload<K extends FileExplorerEndpointName> = EndpointPayload<(typeof fileExplorerEndpoints)[K]>;

export interface ProjectFileChangeEvent {
  projectId: string;
  type: 'created' | 'updated' | 'deleted' | 'renamed';
  path: string;
  newPath?: string;
  isDirectory: boolean;
}

export function watchProjectFiles(payload: FileExplorerEndpointPayload<'watchProject'>): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.watchProject(payload);
}

export function unwatchProjectFiles(): Promise<{ success: boolean }> {
  return window.api.fileExplorer.unwatchProject({});
}

export function copyExternalProjectFile(payload: FileExplorerEndpointPayload<'copyExternalFile'>): Promise<FileNode> {
  return window.api.fileExplorer.copyExternalFile(payload);
}

export function createProjectTextFile(payload: FileExplorerEndpointPayload<'createFile'>): Promise<FileNode> {
  return window.api.fileExplorer.createFile(payload);
}

export function createProjectBinaryFile(payload: FileExplorerEndpointPayload<'createBinaryFile'>): Promise<FileNode> {
  return window.api.fileExplorer.createBinaryFile(payload);
}

export function listProjectDirectory(payload: FileExplorerEndpointPayload<'listDirectory'>): Promise<FileNode[]> {
  return window.api.fileExplorer.listDirectory(payload);
}

export function createProjectFolder(payload: FileExplorerEndpointPayload<'createFolder'>): Promise<FileNode> {
  return window.api.fileExplorer.createFolder(payload);
}

export function createProjectSymlink(payload: FileExplorerEndpointPayload<'createSymlink'>): Promise<FileNode> {
  return window.api.fileExplorer.createSymlink(payload);
}

export function deleteProjectEntry(payload: FileExplorerEndpointPayload<'delete'>): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.delete(payload);
}

export function renameProjectEntry(payload: FileExplorerEndpointPayload<'rename'>): Promise<FileNode> {
  return window.api.fileExplorer.rename(payload);
}

export function showProjectItemInFolder(payload: FileExplorerEndpointPayload<'showItemInFolder'>): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.showItemInFolder(payload);
}

export function openProjectItemInEditor(payload: FileExplorerEndpointPayload<'openInEditor'>): Promise<{ success: boolean; error?: string }> {
  return window.api.fileExplorer.openInEditor(payload);
}

export function subscribeToProjectFileChanges(
  callback: (event: ProjectFileChangeEvent) => void
): () => void {
  return window.api.fileExplorer.onFileChange(callback);
}
