/**
 * Confluence domain endpoint registry.
 *
 * One entry per `confluence:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.confluence`. Handles bidirectional sync between KPM
 * documents and Confluence pages.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';
import type { ConfluencePageLink, ConfluenceSyncPreview } from '../types';

const documentPath = relativePath.min(1);

/**
 * Response shape built by `toIpcResponse` (`main/ipc/response.ts`):
 * `{success: true, data: T} | {success: false, error: string}`.
 */
type ToIpcResponse<T = void> = { success: true; data: T } | { success: false; error: string };

export const confluenceEndpoints = {
  link: {
    channel: 'confluence:link',
    params: z.object({ projectId: uuid, documentPath, confluenceUrl: z.string().url() }),
    result: resultOf<ToIpcResponse<ConfluencePageLink>>(),
  },
  unlink: {
    channel: 'confluence:unlink',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<ToIpcResponse>(),
  },
  getLinks: {
    channel: 'confluence:links:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ success: true; data: ConfluencePageLink[] }>(),
  },
  getLinkForDocument: {
    channel: 'confluence:link:get-for-document',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<{ success: true; data: ConfluencePageLink | null }>(),
  },
  syncPreview: {
    channel: 'confluence:sync:preview',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<ToIpcResponse<ConfluenceSyncPreview>>(),
  },
  pushExecute: {
    channel: 'confluence:push:execute',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<ToIpcResponse<{ pageUrl: string }>>(),
  },
  pullExecute: {
    channel: 'confluence:pull:execute',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<ToIpcResponse>(),
  },
  parseUrl: {
    channel: 'confluence:parse-url',
    params: z.object({ url: z.string() }),
    result: resultOf<{ success: true; data: { siteUrl: string; spaceKey: string; pageId: string } } | { success: false; error: string }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ConfluenceEndpoints = typeof confluenceEndpoints;
export type ConfluenceEndpointName = keyof ConfluenceEndpoints;
