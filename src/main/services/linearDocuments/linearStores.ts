import type { ILinearDocumentLinkRepository } from '../../db/interfaces/linearDocuments';
import type {
  CreateLinearDocumentInput,
  LinearDocument,
} from '../../tracker-clients/linear/client';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import type { DocumentLinkStore, RemoteDocument, RemoteDocumentStore } from '../documentSync';

export interface LinearDocumentApi {
  getDocument(documentId: string): Promise<LinearDocument>;
  createDocument(input: CreateLinearDocumentInput): Promise<LinearDocument>;
  updateDocument(documentId: string, content: string): Promise<LinearDocument>;
}

export async function resolveLinearDocumentApi(): Promise<LinearDocumentApi | null> {
  try {
    return await TrackerClientService.getLinearClient();
  } catch {
    return null;
  }
}

export function createLinearDocumentStore(api: LinearDocumentApi): RemoteDocumentStore {
  return {
    read: async (documentId) => {
      const document = await api.getDocument(documentId);
      if (document.trashed) {
        throw new Error(
          'This document is in the Linear trash. Restore it in Linear, or unlink it here.'
        );
      }
      return toRemoteDocument(document);
    },
    write: async (documentId, content, _expectedRevision) =>
      toRemoteDocument(await api.updateDocument(documentId, content)),
  };
}

export function createLinearLinkStore(
  links: ILinearDocumentLinkRepository,
): DocumentLinkStore {
  return {
    find: (projectId, documentPath) => {
      const link = links.getByDocumentPath(projectId, documentPath);
      if (!link) return null;
      return {
        linkId: link.id,
        remoteId: link.linear_document_id,
        direction: link.direction,
        localContentHash: link.local_content_hash,
        remoteContentHash: link.remote_content_hash,
      };
    },
    saveSyncState: (linkId, state) => links.updateSyncState(linkId, state),
    saveRemoteTitle: (linkId, title) => links.updateTitle(linkId, title),
    remove: (linkId) => links.delete(linkId),
  };
}

/** Linear has no version counter, so the remote's own modification time in
 *  epoch milliseconds stands in as the revision marker. */
export function toRemoteDocument(document: LinearDocument): RemoteDocument {
  return {
    id: document.id,
    title: document.title,
    content: document.content ?? '',
    revision: Date.parse(document.updatedAt),
    url: document.url,
  };
}
