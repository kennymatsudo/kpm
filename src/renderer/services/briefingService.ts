export function generateProjectBriefing(projectId: string) {
  return window.api.briefing.generate(projectId);
}

export function getProjectBriefing(projectId: string) {
  return window.api.briefing.get(projectId);
}
