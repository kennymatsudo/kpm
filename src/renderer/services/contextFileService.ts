  projectId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.claudeMd.write(projectId, content);
}
