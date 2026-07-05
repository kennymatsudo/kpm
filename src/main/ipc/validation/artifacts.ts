/**
 * Temp Image and Chat Attachment path refines.
 *
 * `tempImageEndpoints.delete` and `attachmentEndpoints.readAsDataUrl`/
 * `openTemp` validate `filePath` is absolute but can't also scope it to KPM's
 * temp images directory (`os.tmpdir()` is main-process-only, not derivable in
 * shared/renderer code) — that scoping check is layered back on here and
 * parsed through instead of the registry's own `params` in
 * `handlers/tempImages.ts` and `handlers/attachments.ts`.
 */

import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';
import { absolutePath } from './shared';
import { tempImageEndpoints } from '../../../shared/ipc/tempImageEndpoints';
import { attachmentEndpoints } from '../../../shared/ipc/attachmentEndpoints';

/** Validates path is within KPM temp images directory (prevents path traversal) */
const tempImagePath = absolutePath.refine(
  (p) => {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(p);
    return normalizedPath.startsWith(tempDir + path.sep);
  },
  'Path must be within KPM temp images directory'
);

export const TempImageDeleteSchema = tempImageEndpoints.delete.params.extend({ filePath: tempImagePath });

export const ChatAttachmentReadAsDataUrlSchema = attachmentEndpoints.readAsDataUrl.params.extend({
  filePath: tempImagePath,
});
export const ChatAttachmentOpenTempSchema = attachmentEndpoints.openTemp.params.extend({ filePath: tempImagePath });
