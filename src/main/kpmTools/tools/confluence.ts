/**
 * Confluence Tools
 *
 * Read-only tool for looking up a document's Confluence URL on demand.
 * Avoids stuffing all links into the system prompt.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, projectScoped } from './index';
import type { IConfluenceLinkRepository } from '../../db/interfaces';

export function createConfluenceTools(confluenceLinkRepo: IConfluenceLinkRepository) {
  return [
    tool(
      'get_confluence_url',
      'Look up the Confluence page a project document is published to. Use when the user wants a shareable link to a document or asks whether it is on Confluence. Errors when the document has never been published.',
      {
        documentPath: z.string().min(1).describe('Relative path of the document (e.g. "design-spec.md")'),
      },
      projectScoped(({ projectId, documentPath }) => {
        const link = confluenceLinkRepo.getByDocumentPath(projectId, documentPath);

        if (!link) {
          return Promise.resolve(toolError(`No Confluence link found for document: ${documentPath}`));
        }

        const titleSlug = (link.page_title ?? '').replace(/ /g, '+');
        const url = `https://${link.site_url}/wiki/spaces/${link.space_key}/pages/${link.page_id}/${titleSlug}`;

        return Promise.resolve(jsonResult({
          documentPath: link.document_path,
          confluenceUrl: url,
          pageTitle: link.page_title,
          lastSyncedAt: link.last_synced_at,
        }));
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
