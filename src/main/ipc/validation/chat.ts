/**
 * Chat send payload refine.
 *
 * `chatEndpoints.send`'s registry schema validates attachment paths are
 * absolute but can't also scope them to KPM's OS-temp images directory
 * (main-process-only — see `chatEndpoints.ts`), so that scoping refine is
 * layered back on here and parsed through instead of `chatEndpoints.send.params`
 * in `handlers/chat.ts`.
 */

import { z } from 'zod';
import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';
import { chatAttachmentSchema, chatEndpoints } from '../../../shared/ipc/chatEndpoints';
import { absolutePath } from './shared';

/** Validates path is within KPM temp images directory (prevents path traversal) */
const tempImagePath = absolutePath.refine(
  (p) => {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(p);
    return normalizedPath.startsWith(tempDir + path.sep);
  },
  'Path must be within KPM temp images directory'
);

// An attachment-only send is allowed: the attachments are the message.
export const ChatSendSchema = chatEndpoints.send.params
  .extend({ attachments: z.array(chatAttachmentSchema(tempImagePath)).optional() })
  .refine(
    (params) => params.message.trim().length > 0 || (params.attachments?.length ?? 0) > 0,
    { message: 'Message cannot be empty', path: ['message'] },
  );
