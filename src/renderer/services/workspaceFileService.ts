export type WorkspaceFileSource = string;

export function readWorkspaceFile(
  source: WorkspaceFileSource,
  path: string,
  projectId?: string | null
): Promise<string> {
  if (source === 'project') {
    if (!projectId) {
      throw new Error('No project selected');
    }
    return window.api.fileExplorer.readFile(projectId, path);
  }

  return window.api.repoFiles.readFile(source, path);
}

export function readProjectBinaryFile(
  projectId: string,
  path: string
): Promise<Uint8Array> {
  return window.api.fileExplorer.readBinaryFile(projectId, path);
}

export function showWorkspaceFileInFolder(
  source: WorkspaceFileSource,
  path: string,
  projectId?: string | null
): Promise<{ success: boolean; error?: string }> {
  if (source === 'project') {
    if (!projectId) {
      throw new Error('No project selected');
    }
    return window.api.fileExplorer.showItemInFolder(projectId, path);
  }

  return window.api.repoFiles.showItemInFolder(source, path);
}

export async function writeWorkspaceFile(
  source: WorkspaceFileSource,
  path: string,
  content: string,
  projectId?: string | null
): Promise<void> {
  const result = source === 'project'
    ? await writeProjectFile(projectId, path, content)
    : await window.api.repoFiles.writeFile(source, path, content);

  if (!result.success) {
    throw new Error(result.error || `Failed to write file: ${path}`);
  }
}

export function writeProjectFile(
  projectId: string | null | undefined,
  path: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  if (!projectId) {
    throw new Error('No project selected');
  }

  return window.api.fileExplorer.writeFile(projectId, path, content);
}
