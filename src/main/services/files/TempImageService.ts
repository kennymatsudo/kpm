/**
 * Temp Image Service
 *
 * Manages ephemeral images pasted into chat inputs.
 * Images are stored in OS temp directory and cleaned up after 24 hours.
 *
 * Key behaviors:
 * - Images are NOT deleted after Claude processes them (preserves session recovery)
 * - Images are NOT deleted on app shutdown (preserves recovery across restarts)
 * - Only stale files (>24hrs) are cleaned up automatically on app startup
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomBytes } from 'crypto';

/** Directory name for temp images within OS temp directory */
const TEMP_DIR_NAME = 'kpm-images';

/** Maximum age of temp files before cleanup (24 hours in milliseconds) */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Maximum image / pdf file size (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum text-attachment size (256KB) — keeps inline blocks reasonable. */
const MAX_TEXT_ATTACHMENT_SIZE = 256 * 1024;

/** Supported image MIME types */
const SUPPORTED_FORMATS = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
] as const;

export type SupportedImageFormat = (typeof SUPPORTED_FORMATS)[number];

/** Image MIME types acceptable for picker / drag-drop attachments. */
const ATTACHMENT_IMAGE_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Text MIME types acceptable as text attachments. */
const ATTACHMENT_TEXT_MIME_TYPES = new Set<string>([
  'text/plain',
  'text/markdown',
  'application/json',
  'text/yaml',
  'application/yaml',
  'application/x-yaml',
]);

/** Map of well-known extensions to media types for attachment kind sniffing. */
const ATTACHMENT_EXT_MAP: Record<string, { kind: 'image' | 'pdf' | 'text'; mediaType: string }> = {
  '.png': { kind: 'image', mediaType: 'image/png' },
  '.jpg': { kind: 'image', mediaType: 'image/jpeg' },
  '.jpeg': { kind: 'image', mediaType: 'image/jpeg' },
  '.gif': { kind: 'image', mediaType: 'image/gif' },
  '.webp': { kind: 'image', mediaType: 'image/webp' },
  '.pdf': { kind: 'pdf', mediaType: 'application/pdf' },
  '.txt': { kind: 'text', mediaType: 'text/plain' },
  '.md': { kind: 'text', mediaType: 'text/markdown' },
  '.markdown': { kind: 'text', mediaType: 'text/markdown' },
  '.json': { kind: 'text', mediaType: 'application/json' },
  '.yaml': { kind: 'text', mediaType: 'text/yaml' },
  '.yml': { kind: 'text', mediaType: 'text/yaml' },
};

/** Result of saving a temp image (discriminated union for type safety) */
export type SaveTempImageResult =
  | { success: true; path: string; filename: string }
  | { success: false; error: string };

export type SaveTempAttachmentResult =
  | {
      success: true;
      path: string;
      filename: string;
      kind: 'image' | 'pdf' | 'text';
      mediaType: string;
    }
  | { success: false; error: string };

/** Classify a (filename, optional explicit MIME) pair into an attachment kind. */
export function classifyAttachment(
  filename: string,
  declaredMime?: string,
): { kind: 'image' | 'pdf' | 'text'; mediaType: string } | null {
  const ext = path.extname(filename).toLowerCase();
  const fromExt = ATTACHMENT_EXT_MAP[ext];

  if (declaredMime) {
    if (declaredMime === 'application/pdf') {
      return { kind: 'pdf', mediaType: 'application/pdf' };
    }
    if (ATTACHMENT_IMAGE_MIME_TYPES.has(declaredMime)) {
      return { kind: 'image', mediaType: declaredMime };
    }
    if (ATTACHMENT_TEXT_MIME_TYPES.has(declaredMime)) {
      return { kind: 'text', mediaType: declaredMime };
    }
  }

  return fromExt ?? null;
}

// =============================================================================
// Dependencies
// =============================================================================

export interface TempImageServiceDeps {
  /** Get the OS temp directory */
  getTempDir: () => string;
  /** Generate random bytes for filenames */
  generateRandomBytes: (size: number) => Buffer;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTempImageService(deps: TempImageServiceDeps) {
  /**
   * Get the temp images directory path.
   */
  function getTempImagesDir(): string {
    return path.join(deps.getTempDir(), TEMP_DIR_NAME);
  }

  /**
   * Get file extension for a given MIME type.
   */
  function getExtension(format: SupportedImageFormat): string {
    switch (format) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/gif':
        return '.gif';
      case 'image/webp':
        return '.webp';
      case 'image/bmp':
        return '.bmp';
      default:
        return '.png';
    }
  }

  /**
   * Generate a unique filename for a temp image.
   * Format: kpm-paste-{timestamp}-{random}.{ext}
   */
  function generateFilename(format: SupportedImageFormat): string {
    const timestamp = Date.now();
    const random = deps.generateRandomBytes(8).toString('hex');
    const ext = getExtension(format);
    return `kpm-paste-${timestamp}-${random}${ext}`;
  }

  /**
   * Generate a unique filename for a temp attachment, preserving the source
   * extension so file kind sniffing remains stable across the lifetime of the
   * temp file.
   */
  function generateAttachmentFilename(originalName: string): string {
    const timestamp = Date.now();
    const random = deps.generateRandomBytes(8).toString('hex');
    const ext = path.extname(originalName).toLowerCase();
    return `kpm-attach-${timestamp}-${random}${ext}`;
  }

  /**
   * Validate that a path is within the temp images directory.
   * Prevents path traversal attacks.
   */
  function isValidTempPath(filePath: string): boolean {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(filePath);
    return normalizedPath.startsWith(tempDir + path.sep);
  }

  /**
   * Check if a format is supported.
   */
  function isSupportedFormat(format: string): format is SupportedImageFormat {
    return SUPPORTED_FORMATS.includes(format as SupportedImageFormat);
  }

  return {
    /**
     * Get the temp images directory path.
     * Exported for use in validation schemas.
     */
    getTempImagesDir,

    /**
     * Check if a format is supported.
     */
    isSupportedFormat,

    /**
     * Initialize the temp image service.
     * Creates the temp directory if needed and cleans up stale files.
     */
    async init(): Promise<void> {
      const tempDir = getTempImagesDir();

      try {
        // Create temp directory with restricted permissions (owner only)
        await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
        console.log(`[TempImage] Initialized temp directory: ${tempDir}`);

        // Clean up stale files in background (don't await)
        this.cleanupStale().catch((err) => {
          console.error('[TempImage] Failed to cleanup stale files:', err);
        });
      } catch (error) {
        console.error('[TempImage] Failed to initialize temp directory:', error);
        throw error;
      }
    },

    /**
     * Save a non-image attachment (PDF or text) or image picked through the
     * file picker / OS drag-drop. The renderer hands us raw bytes plus the
     * originating filename and (optional) declared MIME; we sniff the kind,
     * validate size, and persist next to the existing paste-image cache.
     *
     * Files share the temp images directory but use a distinct `kpm-attach-`
     * prefix so the stale-file cleanup can sweep them on the same schedule
     * without confusing them with paste-images.
     */
    async saveTempAttachment(
      data: Buffer,
      originalFilename: string,
      declaredMime?: string,
    ): Promise<SaveTempAttachmentResult> {
      const classification = classifyAttachment(originalFilename, declaredMime);
      if (!classification) {
        return {
          success: false,
          error: `Unsupported attachment type for "${originalFilename}". Allowed: PNG, JPEG, GIF, WebP, PDF, plain text, markdown, JSON, YAML.`,
        };
      }

      const sizeLimit = classification.kind === 'text' ? MAX_TEXT_ATTACHMENT_SIZE : MAX_FILE_SIZE;
      if (data.byteLength > sizeLimit) {
        const sizeKB = (data.byteLength / 1024).toFixed(0);
        const limitLabel = classification.kind === 'text'
          ? `${(sizeLimit / 1024).toFixed(0)} KB`
          : `${(sizeLimit / (1024 * 1024)).toFixed(0)} MB`;
        return {
          success: false,
          error: `Attachment "${originalFilename}" is ${sizeKB} KB, exceeds the ${limitLabel} limit.`,
        };
      }

      const tempDir = getTempImagesDir();
      const filename = generateAttachmentFilename(originalFilename);
      const filePath = path.join(tempDir, filename);

      try {
        await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
        await fs.writeFile(filePath, data);

        console.log(`[TempImage] Saved attachment: ${filename} (${data.byteLength} bytes, ${classification.kind})`);

        return {
          success: true,
          path: filePath,
          filename: originalFilename,
          kind: classification.kind,
          mediaType: classification.mediaType,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[TempImage] Failed to save attachment: ${errorMessage}`);
        if (error instanceof Error && 'code' in error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === 'ENOSPC') {
            return { success: false, error: 'Not enough disk space to save the attachment.' };
          }
          if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
            return { success: false, error: 'Permission denied. Cannot write to temp directory.' };
          }
        }
        return { success: false, error: `Failed to save attachment: ${errorMessage}` };
      }
    },

    /**
     * Read a saved temp file as a base64 data URL. Used for renderer thumbnail
     * loading where the CSP blocks `file://`. The 2 MB cap is renderer-memory
     * insurance; oversized images simply skip the thumbnail and fall back to a
     * filename-only chip.
     */
    async readAttachmentAsDataUrl(
      filePath: string,
      mediaType: string,
    ): Promise<{ success: true; dataUrl: string } | { success: false; error: string }> {
      if (!isValidTempPath(filePath)) {
        return { success: false, error: 'Invalid path: not within temp attachment directory' };
      }

      const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
      try {
        const stats = await fs.lstat(filePath);
        if (stats.isSymbolicLink()) {
          return { success: false, error: 'Cannot read symlinks' };
        }
        if (stats.size > MAX_THUMBNAIL_BYTES) {
          return { success: false, error: 'File too large for inline preview' };
        }
        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString('base64');
        return { success: true, dataUrl: `data:${mediaType};base64,${base64}` };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    },

    /**
     * Save a pasted image to the temp directory.
     *
     * @param imageData - Raw image data as Buffer
     * @param format - MIME type of the image
     * @returns Result with path and filename on success, error on failure
     */
    async savePastedImage(
      imageData: Buffer,
      format: string
    ): Promise<SaveTempImageResult> {
      // Validate format
      if (!isSupportedFormat(format)) {
        return {
          success: false,
          error: `Unsupported image format: ${format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`,
        };
      }

      // Validate size
      if (imageData.byteLength > MAX_FILE_SIZE) {
        const sizeMB = (imageData.byteLength / (1024 * 1024)).toFixed(1);
        return {
          success: false,
          error: `Image too large (${sizeMB}MB). Maximum size is 10MB.`,
        };
      }

      const tempDir = getTempImagesDir();
      const filename = generateFilename(format);
      const filePath = path.join(tempDir, filename);

      try {
        // Ensure temp directory exists
        await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });

        // Write image to temp file
        await fs.writeFile(filePath, imageData);

        console.log(`[TempImage] Saved: ${filename} (${imageData.byteLength} bytes)`);

        return {
          success: true,
          path: filePath,
          filename,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[TempImage] Failed to save image: ${errorMessage}`);

        // Handle specific error types
        if (error instanceof Error && 'code' in error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === 'ENOSPC') {
            return {
              success: false,
              error: 'Not enough disk space to save the image.',
            };
          }
          if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
            return {
              success: false,
              error: 'Permission denied. Cannot write to temp directory.',
            };
          }
        }

        return {
          success: false,
          error: `Failed to save image: ${errorMessage}`,
        };
      }
    },

    /**
     * Delete a specific temp image.
     * Only deletes files within the temp images directory.
     * Refuses to delete symlinks to prevent symlink attacks.
     *
     * @param filePath - Absolute path to the temp image
     */
    async deleteImage(filePath: string): Promise<void> {
      // Security: Validate path is within our temp directory
      if (!isValidTempPath(filePath)) {
        console.warn(`[TempImage] Attempted to delete file outside temp directory: ${filePath}`);
        throw new Error('Invalid path: not within temp images directory');
      }

      try {
        // Security: Check if file is a symlink (prevents symlink attacks)
        const stats = await fs.lstat(filePath);
        if (stats.isSymbolicLink()) {
          console.warn(`[TempImage] Refused to delete symlink: ${path.basename(filePath)}`);
          throw new Error('Cannot delete symlinks');
        }

        await fs.unlink(filePath);
        console.log(`[TempImage] Deleted: ${path.basename(filePath)}`);
      } catch (error) {
        // Ignore ENOENT (file not found) - file may already be deleted
        if (error instanceof Error && 'code' in error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === 'ENOENT') {
            console.log(`[TempImage] File already deleted: ${path.basename(filePath)}`);
            return;
          }
        }
        throw error;
      }
    },

    /**
     * Clean up stale temp files (older than 24 hours).
     * Called during initialization.
     */
    async cleanupStale(): Promise<void> {
      const tempDir = getTempImagesDir();
      const now = Date.now();
      let deleted = 0;
      let errors = 0;

      try {
        // Check if temp directory exists
        try {
          await fs.access(tempDir);
        } catch {
          // Directory doesn't exist, nothing to clean up
          return;
        }

        const files = await fs.readdir(tempDir);

        for (const file of files) {
          // Only process files with our naming patterns
          if (!file.startsWith('kpm-paste-') && !file.startsWith('kpm-attach-')) {
            continue;
          }

          const filePath = path.join(tempDir, file);

          try {
            const stats = await fs.stat(filePath);
            const age = now - stats.mtimeMs;

            if (age > MAX_AGE_MS) {
              await fs.unlink(filePath);
              deleted++;
            }
          } catch (error) {
            // Log but continue processing other files
            console.error(`[TempImage] Failed to process ${file}:`, error);
            errors++;
          }
        }

        if (deleted > 0 || errors > 0) {
          console.log(`[TempImage] Stale cleanup: ${deleted} deleted, ${errors} errors`);
        }
      } catch (error) {
        console.error('[TempImage] Failed to cleanup stale files:', error);
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type TempImageService = ReturnType<typeof createTempImageService>;

// =============================================================================
// Default Singleton
// =============================================================================

export const tempImageService = createTempImageService({
  getTempDir: () => os.tmpdir(),
  generateRandomBytes: randomBytes,
});

// =============================================================================
// Backwards-Compatible Exports
// =============================================================================

/** Get the temp images directory path (for validation schemas) */
export function getTempImagesDir(): string {
  return tempImageService.getTempImagesDir();
}

/** Initialize the temp image service */
export function init(): Promise<void> {
  return tempImageService.init();
}

/** Save a pasted image to the temp directory */
export function savePastedImage(
  imageData: Buffer,
  format: string
): Promise<SaveTempImageResult> {
  return tempImageService.savePastedImage(imageData, format);
}

/** Save a non-image attachment to the temp directory */
export function saveTempAttachment(
  data: Buffer,
  originalFilename: string,
  declaredMime?: string,
): Promise<SaveTempAttachmentResult> {
  return tempImageService.saveTempAttachment(data, originalFilename, declaredMime);
}

/** Read a saved attachment as a base64 data URL. */
export function readAttachmentAsDataUrl(
  filePath: string,
  mediaType: string,
) {
  return tempImageService.readAttachmentAsDataUrl(filePath, mediaType);
}

/** Delete a specific temp image */
export function deleteImage(filePath: string): Promise<void> {
  return tempImageService.deleteImage(filePath);
}
