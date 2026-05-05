export function generateProjectBriefing(projectId: string) {
  return window.api.briefing.generate(projectId);
}

export function getProjectBriefing(projectId: string) {
  return window.api.briefing.get(projectId);
}

export function onProjectBriefingChunk(
  handler: (event: { projectId: string; delta: string }) => void,
) {
  return window.api.briefing.onChunk(handler);
}
