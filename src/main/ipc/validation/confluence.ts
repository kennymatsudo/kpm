/**
 * Confluence Sync Validation Schemas
 *
 * Zod schemas for Confluence document sync IPC handlers.
 */

import { z } from 'zod';
import { uuid, relativePath } from './shared';

export const ConfluenceSchemas = {
  /**
   * Link a document to a Confluence page.
   */
  link: z.object({
    projectId: uuid,
    documentPath: relativePath.min(1),
    confluenceUrl: z.string().url(),
  }),

  /**
   * Unlink a document from Confluence.
   */
  unlink: z.object({
    projectId: uuid,
    documentPath: relativePath.min(1),
  }),

  /**
   * Get all Confluence links for a project.
   */
  getLinks: z.object({
    projectId: uuid,
  }),

  /**
   * Get the Confluence link for a specific document.
   */
  getLinkForDocument: z.object({
    projectId: uuid,
    documentPath: relativePath.min(1),
  }),

  /**
   * Generate a sync preview for a linked document.
   */
  syncPreview: z.object({
    projectId: uuid,
    documentPath: relativePath.min(1),
  }),

  /**
   * Push local document to Confluence.
   */
  pushExecute: z.object({
    projectId: uuid,
    documentPath: relativePath.min(1),
  }),

  /**
   * Pull content from Confluence to local document.
   */
  pullExecute: z.object({
    projectId: uuid,
    documentPath: relativePath.min(1),
  }),

  /**
   * Parse a Confluence URL for validation.
   */
  parseUrl: z.object({
    url: z.string(),
  }),
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
