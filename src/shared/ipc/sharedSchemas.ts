/**
 * Zod primitives shared across `src/shared/ipc/*Endpoints.ts` registries.
 *
 * Bundled into the renderer alongside every registry file, so — like
 * `relativePath.ts` — nothing here may import Node builtins.
 */

import { z } from 'zod';

export const uuid = z.string().uuid('Invalid ID format (expected UUID)');

export const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

export const absolutePath = z
  .string()
  .min(1, 'Path cannot be empty')
  .refine((p) => p.startsWith('/') || WINDOWS_DRIVE_PREFIX.test(p), 'Path must be absolute (not relative)');
