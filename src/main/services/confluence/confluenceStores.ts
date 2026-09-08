/**
 * Confluence adapters for the document-sync ports.
 */

import type {
  IConfluenceLinkRepository,
} from '../../db/interfaces/confluence';
import { ConfluenceClient, type ConfluencePage } from '../../wiki-clients/confluence';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import type {
  DocumentLinkStore,
  RemoteDocument,
  RemoteDocumentStore,
} from '../documentSync';

/**
 * Confluence rides on the Jira credentials — same Atlassian Cloud account.
 * Null means Jira was never configured, which callers report as a missing
 * credential rather than a failure.
 */
export async function createConfluenceClient(): Promise<ConfluenceClient | null> {
  try {
    const hasCredentials = await TrackerClientService.hasJiraCredentials();
    if (!hasCredentials) return null;

    const { KeytarCredentialProvider } = await import('../../tracker-clients/common/credentials');
    const credentials = await new KeytarCredentialProvider().getCredentials('jira');
    if (!credentials) return null;

    return new ConfluenceClient(credentials);
  } catch {
    return null;
  }
}

export async function createConfluenceDocumentStore(): Promise<RemoteDocumentStore | null> {
  const client = await createConfluenceClient();
  if (!client) return null;

  return {
    read: async (pageId) => toRemoteDocument(await client.getPage(pageId)),
    write: async (pageId, content, expectedRevision) =>
      toRemoteDocument(await client.updatePage(pageId, content, expectedRevision)),
  };
}

export function createConfluenceLinkStore(
  links: IConfluenceLinkRepository,
): DocumentLinkStore {
  return {
    find: (projectId, documentPath) => {
      const link = links.getByDocumentPath(projectId, documentPath);
      if (!link) return null;
      return {
        linkId: link.id,
        remoteId: link.page_id,
        direction: 'two-way',
        localContentHash: link.local_content_hash,
        remoteContentHash: link.remote_content_hash,
      };
    },
    saveSyncState: (linkId, state) => links.updateSyncState(linkId, state),
    saveRemoteTitle: (linkId, title) => links.updatePageTitle(linkId, title),
    remove: (linkId) => links.delete(linkId),
  };
}

function toRemoteDocument(page: ConfluencePage): RemoteDocument {
  return {
    id: page.id,
    title: page.title,
    content: page.content,
    revision: page.version,
    url: page.webUrl,
  };
}
