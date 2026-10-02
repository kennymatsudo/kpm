import { formatFileSize } from '../../utils/image';

export const MAX_EXTERNAL_FILE_BYTES = 50 * 1024 * 1024;
/** Matches createFile's validation: larger text goes through a copy by path instead. */
export const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

export type ExternalFileImport =
  | { kind: 'copy'; sourcePath: string }
  | { kind: 'text' }
  | { kind: 'binary' }
  | { kind: 'skip'; reason: string };

/**
 * How to bring one dropped file into the project. Copying by path avoids
 * reading the file into the renderer, and is the only route for text over the
 * createFile limit; the path is empty when the drop has no file on disk.
 */
export function planExternalFileImport(
  file: { size: number },
  sourcePath: string | null,
  isText: boolean,
): ExternalFileImport {
  if (file.size > MAX_EXTERNAL_FILE_BYTES) {
    return {
      kind: 'skip',
      reason: `too large to import (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_EXTERNAL_FILE_BYTES)}.`,
    };
  }
  if (sourcePath && (!isText || file.size > MAX_TEXT_FILE_BYTES)) return { kind: 'copy', sourcePath };
  if (!isText) return { kind: 'binary' };
  if (file.size > MAX_TEXT_FILE_BYTES) {
    return {
      kind: 'skip',
      reason: `too large to import as text (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_TEXT_FILE_BYTES)}.`,
    };
  }
  return { kind: 'text' };
}
