/**
 * Artifact, Scratchpad, and Temp Image Validation Schemas
 */

import { z } from 'zod';
import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';
import { uuid, absolutePath, supportedImageFormat } from './shared';

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
  save: z.object({
    imageData: z.instanceof(Uint8Array, { message: 'Image data must be a Uint8Array' }),
    format: supportedImageFormat,
  }),

  delete: z.object({
    filePath: tempImagePath,
  }),
};

// =============================================================================
// Chat Attachment Schemas
// =============================================================================

export const ChatAttachmentSchemas = {
  saveDropped: z.object({
    data: z.instanceof(Uint8Array, { message: 'Attachment data must be a Uint8Array' }),
    filename: z
      .string()
      .min(1, 'Filename is required')
      .max(255, 'Filename too long')
      .refine((f) => !f.includes('/') && !f.includes('\\'), 'Filename cannot contain path separators')
      .refine((f) => f !== '.' && f !== '..', 'Invalid filename'),
    mimeType: z.string().max(255).optional(),
  }),

  readAsDataUrl: z.object({
    filePath: tempImagePath,
    mediaType: z.string().min(1).max(255),
  }),

  openTemp: z.object({
    filePath: tempImagePath,
  }),
};
