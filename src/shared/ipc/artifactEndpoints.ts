/**
 * Artifact domain endpoint registry.
 *
 * One entry per `artifact:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.artifacts`. Manages markdown files in a project's
 * outputs/ folder (Custom Prompts and other generators).
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

interface ArtifactSummary {
  filename: string;
  path: string;
  createdAt: string;
  modifiedAt: string;
  size: number;
}

export const artifactEndpoints = {
  list: {
    channel: 'artifact:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ artifacts: ArtifactSummary[] }>(),
  },
  read: {
    channel: 'artifact:read',
    params: z.object({ projectId: uuid, filename: z.string().min(1, 'Filename is required') }),
    result: resultOf<{ content: string }>(),
  },
  delete: {
    channel: 'artifact:delete',
    params: z.object({ projectId: uuid, filename: z.string().min(1, 'Filename is required') }),
    result: resultOf<void>(),
  },
  import: {
    channel: 'artifact:import',
    params: z.object({ projectId: uuid, sourcePath: z.string().min(1, 'Source path is required') }),
    result: resultOf<{ filename: string }>(),
  },
  selectDialog: {
    channel: 'artifact:select-dialog',
    params: null,
    result: resultOf<{ paths: string[] }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ArtifactEndpoints = typeof artifactEndpoints;
export type ArtifactEndpointName = keyof ArtifactEndpoints;
