/**
 * Group IPC Validation Schemas
 *
 * Zod schemas for group CRUD operations and actions.
 */

import { z } from 'zod';
import { uuid } from './shared';

// =============================================================================
// Group Schemas
// =============================================================================

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');

export const GroupSchemas = {
  // List groups for a project
  list: z.object({
    projectId: uuid,
  }),

  // Get a single group
  get: z.object({
    id: uuid,
  }),

  // Create a new group
  create: z.object({
    projectId: uuid,
    name: z.string().min(1).max(100),
    color: hexColor.optional().default('#6366f1'),
    position_x: z.number().optional().default(100),
    position_y: z.number().optional().default(100),
    height: z.number().optional().default(300),
  }),

  // Update a group
  update: z.object({
    id: uuid,
    updates: z.object({
      name: z.string().min(1).max(100).optional(),
      color: hexColor.optional(),
      position_x: z.number().optional(),
      position_y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      is_collapsed: z.boolean().optional(),
    }).refine((u) => Object.keys(u).length > 0, 'At least one field required'),
  }),

  // Delete a group
  delete: z.object({
    id: uuid,
  }),

  // Update group position
  updatePosition: z.object({
    id: uuid,
    x: z.number(),
    y: z.number(),
  }),

  // Update group size
  updateSize: z.object({
    id: uuid,
    width: z.number().min(100),
    height: z.number().min(100),
  }),

  // Assign item to group
  assignItem: z.object({
    itemId: uuid,
    groupId: uuid.nullable(),
  }),
};

// =============================================================================
// Inferred Types
// =============================================================================

export type GroupListInput = z.infer<typeof GroupSchemas.list>;
export type GroupGetInput = z.infer<typeof GroupSchemas.get>;
export type GroupCreateInput = z.infer<typeof GroupSchemas.create>;
export type GroupUpdateInput = z.infer<typeof GroupSchemas.update>;
export type GroupDeleteInput = z.infer<typeof GroupSchemas.delete>;
export type GroupUpdatePositionInput = z.infer<typeof GroupSchemas.updatePosition>;
export type GroupUpdateSizeInput = z.infer<typeof GroupSchemas.updateSize>;
export type GroupAssignItemInput = z.infer<typeof GroupSchemas.assignItem>;
