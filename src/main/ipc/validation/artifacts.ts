/**
 * Artifact, Scratchpad, and Temp Image Validation Schemas
 */

import { z } from 'zod';
import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';

// =============================================================================
// Artifact Schemas
// =============================================================================

export const ArtifactSchemas = {
  list: z.object({
    projectId: uuid,
  }),

  read: z.object({
    projectId: uuid,
    filename: z.string().min(1, 'Filename is required'),
  }),

  delete: z.object({
    projectId: uuid,
    filename: z.string().min(1, 'Filename is required'),
  }),

  import: z.object({
    projectId: uuid,
    sourcePath: z.string().min(1, 'Source path is required'),
  }),
};

// =============================================================================
// Temp Image Schemas
// =============================================================================

const tempImagePath = absolutePath.refine(
  (p) => {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(p);
    return normalizedPath.startsWith(tempDir + path.sep);
  },
);

export const TempImageSchemas = {
  save: z.object({
    imageData: z.instanceof(Uint8Array, { message: 'Image data must be a Uint8Array' }),
    format: supportedImageFormat,
  }),

  delete: z.object({
    filePath: tempImagePath,
  }),
};
