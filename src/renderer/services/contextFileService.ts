export interface ContextFileInfo {
  path: string;
  name: string;
  isProjectContextFile: boolean;
  modifiedAt: string;
}

export function listContextFiles(
  projectId: string
): Promise<{ success: boolean; files?: ContextFileInfo[]; error?: string }> {
  return window.api.contextFiles.list(projectId);
}

export function readContextFile(
  projectId: string
): Promise<{ success: boolean; content: string | null }> {
  return window.api.contextFile.read(projectId);
}

export function writeContextFile(
  projectId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.contextFile.write(projectId, content);
}
