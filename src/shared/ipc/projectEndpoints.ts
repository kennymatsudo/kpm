/**
 * Project domain endpoint registry.
 *
 * One entry per `project:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.projects`. `folderPath` only gets a format check here —
 * existence is deliberately not required, because a project can point at a
 * folder that will be created.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';
import type { FolderInspection, Project } from '../types';

/**
 * A folder the user typed or picked. Absolute, or `~`-relative — main expands
 * the `~` (`expandTilde`), so rejecting it here would fail a path users
 * reasonably type by hand.
 */
const projectFolderPath = z.union([
  absolutePath,
  z.string().refine((p) => p === '~' || p.startsWith('~/'), 'Path must be absolute or start with ~/'),
]);

const projectName = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(100, 'Project name must be under 100 characters')
  .trim();

const projectPhase = z.enum(['discovery', 'high_level', 'detailed', 'ready'], {
  message: 'Invalid phase. Must be: discovery, high_level, detailed, or ready',
});

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/projects.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const projectEndpoints = {
  create: {
    channel: 'project:create',
    params: z.object({ name: projectName, folderPath: projectFolderPath.optional() }),
    result: resultOf<RegistryResponse<{ project: Project }>>(),
  },
  get: {
    channel: 'project:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ project: Project | undefined }>>(),
  },
  list: {
    channel: 'project:list',
    params: null,
    result: resultOf<RegistryResponse<{ projects: Project[] }>>(),
  },
  update: {
    channel: 'project:update',
    params: z.object({
      projectId: uuid,
      updates: z
        .object({ name: projectName.optional(), phase: projectPhase.optional() })
        .refine((u) => u.name !== undefined || u.phase !== undefined, 'At least one update field is required'),
    }),
    result: resultOf<RegistryResponse<{ project: Project | undefined }>>(),
  },
  delete: {
    channel: 'project:delete',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  openFolder: {
    channel: 'project:open-folder',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  getDefaultLocation: {
    channel: 'project:get-default-location',
    params: null,
    result: resultOf<RegistryResponse<{ defaultLocation: string }>>(),
  },
  inspectFolder: {
    channel: 'project:inspect-folder',
    params: z.object({ folderPath: projectFolderPath }),
    result: resultOf<RegistryResponse<{ inspection: FolderInspection }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ProjectEndpoints = typeof projectEndpoints;
export type ProjectEndpointName = keyof ProjectEndpoints;
