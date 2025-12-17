export async function loadDevSessions(projectId: string): Promise<{
  const devResult = await window.api.devSessions.getByProjectWithPlanItems(projectId);
  session: DevSessionWithPlanItem
  return window.api.devSessions.delete(session.id, false);
  session: DevSessionWithPlanItem,
  return window.api.devSessions.updateName(session.id, name);
  return window.api.devSessions.onStatusChanged(callback);
