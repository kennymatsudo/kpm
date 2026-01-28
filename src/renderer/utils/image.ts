/**
 * Image file utilities for detection, MIME types, and data URL conversion.
 */

/** Supported image file extensions */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg'
]);

/** MIME type mapping for image extensions */
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

/**
 * Check if a filename is an image file based on extension.
 */
export function isImageFile(filename: string): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Get the MIME type for an image filename.
 */
export function getImageMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return IMAGE_MIME_TYPES[ext ?? ''] ?? 'application/octet-stream';
}

/**
 * Convert a Uint8Array to a base64 data URL.
 * Uses chunked processing for better performance with large files.
 */
export function uint8ArrayToDataUrl(data: Uint8Array, mimeType: string): string {
  // Process in chunks to avoid call stack issues with large arrays
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];

  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode(...chunk));
  }

  const base64 = btoa(chunks.join(''));
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Format a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
