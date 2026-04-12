export interface ContextFileInfo {
  path: string;
  name: string;
  isClaudeMd: boolean;
  modifiedAt: string;
}

export function listContextFiles(
  projectId: string
): Promise<{ success: boolean; files?: ContextFileInfo[]; error?: string }> {
  return window.api.contextFiles.list(projectId);
}

export function readClaudeMdFile(
  projectId: string
): Promise<{ success: boolean; content: string | null }> {
  return window.api.claudeMd.read(projectId);
}

export function writeClaudeMdFile(
  projectId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.claudeMd.write(projectId, content);
}
