export function listConfluenceLinks(projectId: string) {
  return window.api.confluence.getLinks({ projectId });
}

export function linkConfluenceDocument(
  projectId: string,
  documentPath: string,
  confluenceUrl: string
) {
  return window.api.confluence.link({ projectId, documentPath, confluenceUrl });
}

export function unlinkConfluenceDocument(projectId: string, documentPath: string) {
  return window.api.confluence.unlink({ projectId, documentPath });
}

export function getConfluenceSyncPreview(projectId: string, documentPath: string) {
  return window.api.confluence.getSyncPreview({ projectId, documentPath });
}

export function pushConfluenceDocument(projectId: string, documentPath: string) {
  return window.api.confluence.push({ projectId, documentPath });
}

export function pullConfluenceDocument(projectId: string, documentPath: string) {
  return window.api.confluence.pull({ projectId, documentPath });
}
