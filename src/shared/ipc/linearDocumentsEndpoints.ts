/**
 * Linear documents domain endpoint registry.
 *
 * One entry per `linear-documents:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.linearDocuments`. Publishing and two-way sync
 * between KPM documents and Linear Documents.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';
import type { DocumentSyncPreview, LinearDocumentLink } from '../types';

const documentPath = relativePath.min(1);
const direction = z.enum(['two-way', 'push-only']);

/**
 * Response shape built by `toIpcResponse` (`main/ipc/response.ts`):
 * `{success: true, data: T} | {success: false, error: string}`.
 */
type ToIpcResponse<T = void> = { success: true; data: T } | { success: false; error: string };

export const linearDocumentsEndpoints = {
  publish: {
    channel: 'linear-documents:publish',
    params: z.object({
      projectId: uuid,
      documentPath,
      target: z.object({ kind: z.enum(['project', 'issue']), id: z.string().min(1) }),
      title: z.string().min(1),
      direction,
      documentId: uuid,
    }),
    result: resultOf<ToIpcResponse<LinearDocumentLink>>(),
  },
  unlink: {
    channel: 'linear-documents:unlink',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<ToIpcResponse>(),
  },
  getLinks: {
    channel: 'linear-documents:links:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ success: true; data: LinearDocumentLink[] }>(),
  },
  getLinkForDocument: {
    channel: 'linear-documents:link:get-for-document',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<{ success: true; data: LinearDocumentLink | null }>(),
  },
  setDirection: {
    channel: 'linear-documents:direction:set',
    params: z.object({ projectId: uuid, documentPath, direction }),
    result: resultOf<ToIpcResponse>(),
  },
  syncPreview: {
    channel: 'linear-documents:sync:preview',
    params: z.object({ projectId: uuid, documentPath }),
    result: resultOf<ToIpcResponse<DocumentSyncPreview>>(),
  },
  pushExecute: {
    channel: 'linear-documents:push:execute',
    params: z.object({ projectId: uuid, documentPath, syncReceipt: z.string().uuid() }),
    result: resultOf<ToIpcResponse<{ documentUrl: string }>>(),
  },
  pullExecute: {
    channel: 'linear-documents:pull:execute',
    params: z.object({ projectId: uuid, documentPath, syncReceipt: z.string().uuid() }),
    result: resultOf<ToIpcResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type LinearDocumentsEndpoints = typeof linearDocumentsEndpoints;
export type LinearDocumentsEndpointName = keyof LinearDocumentsEndpoints;
