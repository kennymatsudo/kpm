/**
 * Shared relative-path safety check for IPC endpoint registries.
 *
 * Registry files (`src/shared/ipc/*Endpoints.ts`) are bundled into the
 * renderer, so they cannot import Node's `path` module even though the
 * check only ever runs in the main process. `normalizePosixPath` mirrors
 * `path.posix.normalize` without importing Node's `path` module.
 */

import { z } from 'zod';

const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

export function normalizePosixPath(input: string): string {
  const isAbsolute = input.startsWith('/');
  const hasTrailingSlash = input.length > 1 && input.endsWith('/');
  const segments = input.split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      } else if (!isAbsolute) {
        resolved.push('..');
      }
      continue;
    }
    resolved.push(segment);
  }
  let joined = resolved.join('/');
  if (hasTrailingSlash && resolved.length > 0) {
    joined += '/';
  }
  if (isAbsolute) {
    return `/${joined}`;
  }
  if (joined) {
    return joined;
  }
  return hasTrailingSlash ? './' : '.';
}

export function isSafeRelativePath(input: string): boolean {
  if (input.includes('\0')) {
    return false;
  }

  // Empty path is allowed for APIs that treat it as "project root".
  if (input === '') {
    return true;
  }

  const normalizedInput = input.replace(/\\/g, '/');

  // Reject absolute paths (POSIX and Windows forms).
  if (normalizedInput.startsWith('/') || WINDOWS_DRIVE_PREFIX.test(normalizedInput)) {
    return false;
  }

  // Enforce canonical relative paths (rejects ../, ./, repeated slashes, trailing slash).
  const normalized = normalizePosixPath(normalizedInput);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return false;
  }

  return normalized === normalizedInput;
}

export const relativePath = z
  .string()
  .max(1000)
  .refine(isSafeRelativePath, 'Path must be a normalized relative path within the project');
