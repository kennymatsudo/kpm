import type { SyncDirection } from '../../shared/types';

export function listLinearDocumentLinks(params: { projectId: string }) {
  return window.api.linearDocuments.getLinks(params);
}

export function publishLinearDocument(params: {
  projectId: string;
  documentPath: string;
  target: { kind: 'project' | 'issue'; id: string };
  title: string;
  direction: SyncDirection;
  documentId: string;
}) {
  return window.api.linearDocuments.publish(params);
}

export function unlinkLinearDocument(params: { projectId: string; documentPath: string }) {
  return window.api.linearDocuments.unlink(params);
}

export function setLinearDocumentDirection(params: {
  projectId: string;
  documentPath: string;
  direction: SyncDirection;
}) {
  return window.api.linearDocuments.setDirection(params);
}

export function pushLinearDocument(params: {
  projectId: string;
  documentPath: string;
  syncReceipt: string;
}) {
  return window.api.linearDocuments.push(params);
}

export function getLinearDocumentSyncPreview(params: { projectId: string; documentPath: string }) {
  return window.api.linearDocuments.getSyncPreview(params);
}

export function pullLinearDocument(params: {
  projectId: string;
  documentPath: string;
  syncReceipt: string;
}) {
  return window.api.linearDocuments.pull(params);
}
