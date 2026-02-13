/**
 * Normalize path separators to forward slashes for cross-platform consistency.
 */
export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Extract the final segment from a path.
 */
export function getBaseName(path: string, fallback = ''): string {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, '');
  if (!normalized) return fallback;

  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return normalized;

  return normalized.slice(lastSlash + 1) || fallback;
}

/**
 * Extract the parent directory from a path.
 */
export function getParentPath(path: string, fallback = ''): string {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, '');
  if (!normalized) return fallback;

  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return fallback;
  if (lastSlash === 0) return '/';

  return normalized.slice(0, lastSlash);
}
