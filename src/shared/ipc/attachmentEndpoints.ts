/**
 * Attachment domain endpoint registry.
 *
 * One entry per `attachment:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.attachments`. Covers both permanent project attachments
 * (`add`/`remove`/`list`/`selectDialog`) and ephemeral chat attachments
 * (`pickForChat`/`saveDropped`/`readAsDataUrl`/`openTemp`).
 *
 * `readAsDataUrl` and `openTemp` take a `filePath` scoped to KPM's OS-temp
 * attachments directory. That scoping check depends on `os.tmpdir()`
 * (main-process-only, not derivable in shared/renderer code), so this
 * registry only validates the path is absolute; `handlers/attachments.ts`
 * layers the temp-dir scoping refine on top before use, same as it did
 * pre-migration via `ChatAttachmentSchemas`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';
import type { Attachment } from '../types';

const filenameNoPathSeparators = z
  .string()
  .min(1, 'Filename is required')
  .refine((f) => !f.includes('/') && !f.includes('\\'), 'Filename cannot contain path separators')
  .refine((f) => f !== '.' && f !== '..', 'Invalid filename');

interface PickedChatAttachment {
  path: string;
  filename: string;
  kind: 'image' | 'pdf' | 'text';
  mediaType: string;
}

/**
 * Response shape for `remove`, which binds through `bindRegistryHandlers`
 * but builds its own envelope via `toIpcResponse` (main/ipc/response.ts):
 * `{success: true, data: T} | {success: false, error: string}` — distinct
 * from `createRegistryIpcHandlers`'s `{success: true, ...data}` spread used
 * elsewhere in this registry (see `RegistryResponse` in `exportEndpoints.ts`).
 */
type ToIpcResponse<T = void> = { success: true; data: T } | { success: false; error: string };

export const attachmentEndpoints = {
  add: {
    channel: 'attachment:add',
    params: z.object({ projectId: uuid, path: absolutePath, filename: filenameNoPathSeparators }),
    result: resultOf<Attachment>(),
  },
  remove: {
    channel: 'attachment:remove',
    params: z.object({ attachmentId: uuid }),
    result: resultOf<ToIpcResponse>(),
  },
  list: {
    channel: 'attachment:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<Attachment[]>(),
  },
  selectDialog: {
    channel: 'attachment:select-dialog',
    params: null,
    result: resultOf<string[]>(),
  },
  pickForChat: {
    channel: 'attachment:pick-for-chat',
    params: null,
    result: resultOf<{ picked: PickedChatAttachment[]; errors: { filename: string; error: string }[] }>(),
  },
  saveDropped: {
    channel: 'attachment:save-dropped',
    params: z.object({
      data: z.instanceof(Uint8Array, { message: 'Attachment data must be a Uint8Array' }),
      filename: z
        .string()
        .min(1, 'Filename is required')
        .max(255, 'Filename too long')
        .refine((f) => !f.includes('/') && !f.includes('\\'), 'Filename cannot contain path separators')
        .refine((f) => f !== '.' && f !== '..', 'Invalid filename'),
      mimeType: z.string().max(255).optional(),
    }),
    result: resultOf<
      | { success: true; path: string; filename: string; kind: 'image' | 'pdf' | 'text'; mediaType: string }
      | { success: false; error: string }
    >(),
  },
  readAsDataUrl: {
    channel: 'attachment:read-as-data-url',
    params: z.object({ filePath: absolutePath, mediaType: z.string().min(1).max(255) }),
    result: resultOf<{ success: true; dataUrl: string } | { success: false; error: string }>(),
  },
  openTemp: {
    channel: 'attachment:open-temp',
    params: z.object({ filePath: absolutePath }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type AttachmentEndpoints = typeof attachmentEndpoints;
export type AttachmentEndpointName = keyof AttachmentEndpoints;
