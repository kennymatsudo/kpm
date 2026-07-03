/**
 * Artifact domain endpoint registry.
 *
 * One entry per `artifact:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.artifacts`. Manages markdown files in a project's
 * outputs/ folder (Custom Prompts and other generators).
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


export const artifactEndpoints = {
  list: {
    channel: 'artifact:list',
    params: z.object({ projectId: uuid }),
  },
  read: {
    channel: 'artifact:read',
    params: z.object({ projectId: uuid, filename: z.string().min(1, 'Filename is required') }),
  },
  delete: {
    channel: 'artifact:delete',
    params: z.object({ projectId: uuid, filename: z.string().min(1, 'Filename is required') }),
  },
  import: {
    channel: 'artifact:import',
    params: z.object({ projectId: uuid, sourcePath: z.string().min(1, 'Source path is required') }),
  },
  selectDialog: {
    channel: 'artifact:select-dialog',
    params: null,
  },
} satisfies Record<string, EndpointDefinition>;

export type ArtifactEndpoints = typeof artifactEndpoints;
export type ArtifactEndpointName = keyof ArtifactEndpoints;
