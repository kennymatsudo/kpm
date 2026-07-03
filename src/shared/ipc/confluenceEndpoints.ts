/**
 * Confluence domain endpoint registry.
 *
 * One entry per `confluence:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.confluence`. Handles bidirectional sync between KPM
 * documents and Confluence pages.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';

const documentPath = relativePath.min(1);

export const confluenceEndpoints = {
  link: {
    channel: 'confluence:link',
    params: z.object({ projectId: uuid, documentPath, confluenceUrl: z.string().url() }),
  },
  unlink: { channel: 'confluence:unlink', params: z.object({ projectId: uuid, documentPath }) },
  getLinks: { channel: 'confluence:links:get', params: z.object({ projectId: uuid }) },
  getLinkForDocument: {
    channel: 'confluence:link:get-for-document',
    params: z.object({ projectId: uuid, documentPath }),
  },
  syncPreview: { channel: 'confluence:sync:preview', params: z.object({ projectId: uuid, documentPath }) },
  pushExecute: { channel: 'confluence:push:execute', params: z.object({ projectId: uuid, documentPath }) },
  pullExecute: { channel: 'confluence:pull:execute', params: z.object({ projectId: uuid, documentPath }) },
  parseUrl: { channel: 'confluence:parse-url', params: z.object({ url: z.string() }) },
} satisfies Record<string, EndpointDefinition>;

export type ConfluenceEndpoints = typeof confluenceEndpoints;
export type ConfluenceEndpointName = keyof ConfluenceEndpoints;
