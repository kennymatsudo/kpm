/**
 * Context file domain endpoint registry.
 *
 * Covers two `IPC_CHANNELS` namespaces served by one handler file
 * (`handlers/files.ts`): `contextFile.*` (the project's AGENTS.md / CLAUDE.md)
 * and `context.*` (arbitrary .md files in the project root). Method names
 * are dotted with a `contextFile.` / `context.` prefix so `toNestedChannels`
 * rebuilds both `IPC_CHANNELS.contextFile` and `IPC_CHANNELS.context` from this
 * one registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

/** Mirrors `ContextFile` from `main/services/files/FileWatchService.ts`. */
interface ContextFile {
  path: string;
  name: string;
  isProjectContextFile: boolean;
  modifiedAt: string;
}


const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

/** Mirrors `path.posix.normalize` without importing Node's `path` module (this file is bundled into the renderer). */
function normalizePosixPath(input: string): string {
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
  return isAbsolute ? `/${joined}` : joined || '.';
}

function isSafeRelativePath(input: string): boolean {
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

const relativePath = z
  .string()
  .max(1000)
  .refine(isSafeRelativePath, 'Path must be a normalized relative path within the project');

export const contextEndpoints = {
  'contextFile.read': {
    channel: 'context-file:read',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ content: string | null; filename?: string }>(),
  },
  'contextFile.write': {
    channel: 'context-file:write',
    params: z.object({ projectId: uuid, content: z.string().max(1000000, 'Content too large (max 1MB)') }),
    result: resultOf<void>(),
  },
  'context.list': {
    channel: 'context:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ files: ContextFile[] }>(),
  },
  'context.read': {
    channel: 'context:read',
    params: z.object({ projectId: uuid, path: relativePath.min(1).max(255) }),
    result: resultOf<{ content: string | null }>(),
  },
  'context.write': {
    channel: 'context:write',
    params: z.object({
      projectId: uuid,
      path: relativePath.min(1).max(255),
      content: z.string().max(1000000, 'Content too large (max 1MB)'),
    }),
    result: resultOf<void>(),
  },
  'context.delete': {
    channel: 'context:delete',
    params: z.object({ projectId: uuid, path: relativePath.min(1).max(255) }),
    result: resultOf<void>(),
  },
  'context.import': {
    channel: 'context:import',
    params: z.object({ projectId: uuid, sourcePath: z.string().min(1) }),
    result: resultOf<{ filename: string }>(),
  },
  'context.selectDialog': {
    channel: 'context:select-dialog',
    params: null,
    result: resultOf<{ paths: string[] }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ContextEndpoints = typeof contextEndpoints;
export type ContextEndpointName = keyof ContextEndpoints;
