export function listConfluenceLinks(params: { projectId: string }) {
  return window.api.confluence.getLinks(params);
}

export function linkConfluenceDocument(params: {
  projectId: string;
  documentPath: string;
  confluenceUrl: string;
}) {
  return window.api.confluence.link(params);
}

export function unlinkConfluenceDocument(params: { projectId: string; documentPath: string }) {
  return window.api.confluence.unlink(params);
}

export function getConfluenceSyncPreview(params: { projectId: string; documentPath: string }) {
  return window.api.confluence.getSyncPreview(params);
}

export function pushConfluenceDocument(params: {
  projectId: string;
  documentPath: string;
  syncReceipt: string;
}) {
  return window.api.confluence.push(params);
}

export function pullConfluenceDocument(params: {
  projectId: string;
  documentPath: string;
  syncReceipt: string;
}) {
  return window.api.confluence.pull(params);
}
