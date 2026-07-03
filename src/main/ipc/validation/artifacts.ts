/**
 * Artifact, Scratchpad, and Temp Image Validation Schemas
 */

import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';
import { absolutePath } from './shared';
import { artifactEndpoints } from '../../../shared/ipc/artifactEndpoints';
import { tempImageEndpoints } from '../../../shared/ipc/tempImageEndpoints';
import { attachmentEndpoints } from '../../../shared/ipc/attachmentEndpoints';

// =============================================================================
// Artifact Schemas
//
// Payload schemas are owned by `shared/ipc/artifactEndpoints.ts`.
// =============================================================================

export const ArtifactSchemas = {
  list: artifactEndpoints.list.params,
  read: artifactEndpoints.read.params,
  delete: artifactEndpoints.delete.params,
  import: artifactEndpoints.import.params,
};

// =============================================================================
// Temp Image Schemas
//
// Payload schemas are owned by `shared/ipc/tempImageEndpoints.ts`. `delete`'s
// registry schema validates `filePath` is absolute but can't also scope it to
// KPM's temp images directory (`os.tmpdir()` is main-process-only, not
// derivable in shared/renderer code) — that scoping check is layered back on
// here, same as it was pre-migration.
// =============================================================================

/** Validates path is within KPM temp images directory (prevents path traversal) */
const tempImagePath = absolutePath.refine(
  (p) => {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(p);
    return normalizedPath.startsWith(tempDir + path.sep);
  },
  'Path must be within KPM temp images directory'
);

export const TempImageSchemas = {
  save: tempImageEndpoints.save.params,
  delete: tempImageEndpoints.delete.params.extend({ filePath: tempImagePath }),
};

// =============================================================================
// Chat Attachment Schemas
//
// Payload schemas are owned by `shared/ipc/attachmentEndpoints.ts`.
// `readAsDataUrl`/`openTemp` layer the same temp-dir scoping refine as
// `TempImageSchemas.delete` above, for the same reason.
// =============================================================================

export const ChatAttachmentSchemas = {
  saveDropped: attachmentEndpoints.saveDropped.params,
  readAsDataUrl: attachmentEndpoints.readAsDataUrl.params.extend({ filePath: tempImagePath }),
  openTemp: attachmentEndpoints.openTemp.params.extend({ filePath: tempImagePath }),
};
