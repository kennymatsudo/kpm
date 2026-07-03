/**
 * Confluence Sync Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/confluenceEndpoints.ts` (one entry
 * per IPC endpoint, shared with the preload bridge and the handler binding).
 */

import type { z } from 'zod';
import { confluenceEndpoints } from '../../../shared/ipc/confluenceEndpoints';

export const ConfluenceSchemas = {
  link: confluenceEndpoints.link.params,
  unlink: confluenceEndpoints.unlink.params,
  getLinks: confluenceEndpoints.getLinks.params,
  getLinkForDocument: confluenceEndpoints.getLinkForDocument.params,
  syncPreview: confluenceEndpoints.syncPreview.params,
  pushExecute: confluenceEndpoints.pushExecute.params,
  pullExecute: confluenceEndpoints.pullExecute.params,
  parseUrl: confluenceEndpoints.parseUrl.params,
};

// Type exports
export type ConfluenceLinkInput = z.infer<typeof ConfluenceSchemas.link>;
export type ConfluenceUnlinkInput = z.infer<typeof ConfluenceSchemas.unlink>;
export type ConfluenceGetLinksInput = z.infer<typeof ConfluenceSchemas.getLinks>;
export type ConfluenceGetLinkForDocumentInput = z.infer<typeof ConfluenceSchemas.getLinkForDocument>;
export type ConfluenceSyncPreviewInput = z.infer<typeof ConfluenceSchemas.syncPreview>;
export type ConfluencePushExecuteInput = z.infer<typeof ConfluenceSchemas.pushExecute>;
export type ConfluencePullExecuteInput = z.infer<typeof ConfluenceSchemas.pullExecute>;
export type ConfluenceParseUrlInput = z.infer<typeof ConfluenceSchemas.parseUrl>;
