/**
 * Group domain endpoint registry.
 *
 * One entry per `group:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.groups`. Groups are visual containers (Figma-style frames)
 * for organizing plan items.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');

export const groupEndpoints = {
  list: { channel: 'group:list', params: z.object({ projectId: uuid }) },
  get: { channel: 'group:get', params: z.object({ id: uuid }) },
  create: {
    channel: 'group:create',
    params: z.object({
      projectId: uuid,
      name: z.string().min(1).max(100),
      color: hexColor.optional().default('#6366f1'),
      position_x: z.number().optional().default(100),
      position_y: z.number().optional().default(100),
      width: z.number().optional().default(552),
      height: z.number().optional().default(300),
    }),
  },
  update: {
    channel: 'group:update',
    params: z.object({
      id: uuid,
      updates: z
        .object({
          name: z.string().min(1).max(100).optional(),
          color: hexColor.optional(),
          position_x: z.number().optional(),
          position_y: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          is_collapsed: z.boolean().optional(),
        })
        .refine((u) => Object.keys(u).length > 0, 'At least one field required'),
    }),
  },
  delete: { channel: 'group:delete', params: z.object({ id: uuid }) },
  updatePosition: {
    channel: 'group:update-position',
    params: z.object({ id: uuid, x: z.number(), y: z.number() }),
  },
  updateSize: {
    channel: 'group:update-size',
    params: z.object({ id: uuid, width: z.number().min(100), height: z.number().min(100) }),
  },
  assignItem: {
    channel: 'group:assign-item',
    params: z.object({ itemId: uuid, groupId: uuid.nullable() }),
  },
} satisfies Record<string, EndpointDefinition>;

export type GroupEndpoints = typeof groupEndpoints;
export type GroupEndpointName = keyof GroupEndpoints;
