/**
 * Linear Documents IPC Handlers
 */

import {
  linearDocumentsEndpoints,
  type LinearDocumentsEndpointName,
} from '../../../shared/ipc/linearDocumentsEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import { toIpcResponse, ipcSuccess } from '../response';
import type { LinearDocumentService } from '../../services/linearDocuments';
import { bindRegistryHandlers } from '../validation/utils';

type LinearDocumentsHandlers = {
  [K in LinearDocumentsEndpointName]: (
    params: Parameters<HandlerFor<typeof linearDocumentsEndpoints, K>>[0]
  ) => ReturnType<HandlerFor<typeof linearDocumentsEndpoints, K>>;
};

function buildHandlers(service: LinearDocumentService): LinearDocumentsHandlers {
  return {
    publish: async ({ projectId, documentPath, target, title, direction, documentId }) =>
      toIpcResponse(
        await service.publishDocument(projectId, documentPath, target, title, direction, documentId)
      ),

    unlink: ({ projectId, documentPath }) =>
      toIpcResponse(service.unlinkDocument(projectId, documentPath)),

    getLinks: ({ projectId }) => ipcSuccess(service.getLinksForProject(projectId)),

    getLinkForDocument: ({ projectId, documentPath }) =>
      ipcSuccess(service.getLinkForDocument(projectId, documentPath)),

    setDirection: ({ projectId, documentPath, direction }) =>
      toIpcResponse(service.setDirection(projectId, documentPath, direction)),

    syncPreview: async ({ projectId, documentPath }) =>
      toIpcResponse(await service.generateSyncPreview(projectId, documentPath)),

    pushExecute: async ({ projectId, documentPath, syncReceipt }) =>
      toIpcResponse(await service.executePush(projectId, documentPath, syncReceipt)),

    pullExecute: async ({ projectId, documentPath, syncReceipt }) =>
      toIpcResponse(await service.executePull(projectId, documentPath, syncReceipt)),
  };
}

export function registerLinearDocumentHandlers(service: LinearDocumentService): void {
  bindRegistryHandlers(linearDocumentsEndpoints, buildHandlers(service));
}
