/**
 * Project domain endpoint registry.
 *
 * One entry per `project:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.projects`. `folderPath` only needs an absolute-path
 * format check here — the pre-migration schema never checked existence for
 * this field (a project can point at a folder that will be created).
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';

const projectName = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(100, 'Project name must be under 100 characters')
  .trim();

const projectPhase = z.enum(['discovery', 'high_level', 'detailed', 'ready'], {
  message: 'Invalid phase. Must be: discovery, high_level, detailed, or ready',
});

export const projectEndpoints = {
  create: {
    channel: 'project:create',
    params: z.object({ name: projectName, folderPath: absolutePath.optional() }),
  },
  get: {
    channel: 'project:get',
    params: z.object({ projectId: uuid }),
  },
  list: {
    channel: 'project:list',
    params: null,
  },
  update: {
    channel: 'project:update',
    params: z.object({
      projectId: uuid,
      updates: z
        .object({ name: projectName.optional(), phase: projectPhase.optional() })
        .refine((u) => u.name !== undefined || u.phase !== undefined, 'At least one update field is required'),
    }),
  },
  delete: {
    channel: 'project:delete',
    params: z.object({ projectId: uuid }),
  },
  openFolder: {
    channel: 'project:open-folder',
    params: z.object({ projectId: uuid }),
  },
  getDefaultLocation: {
    channel: 'project:get-default-location',
    params: null,
  },
} satisfies Record<string, EndpointDefinition>;

export type ProjectEndpoints = typeof projectEndpoints;
export type ProjectEndpointName = keyof ProjectEndpoints;
