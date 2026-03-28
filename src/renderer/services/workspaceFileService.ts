
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

  projectId: string,
  path: string
): Promise<Uint8Array> {
  return window.api.fileExplorer.readBinaryFile(projectId, path);
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

  projectId: string | null | undefined,
  path: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  if (!projectId) {
    throw new Error('No project selected');
  }

  return window.api.fileExplorer.writeFile(projectId, path, content);
}
