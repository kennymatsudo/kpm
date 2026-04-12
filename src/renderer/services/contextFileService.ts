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
