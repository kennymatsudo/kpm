/* eslint-disable @typescript-eslint/require-await */
/**
 * Group Tools
 *
 * Query tools for reading visual group containers (Figma-style frames),
 *
 * Groups are purely visual - they organize plan items without affecting hierarchy.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import type { IGroupRepository, IPlanItemRepository } from '../../db/interfaces';
import type { PlanAction } from '../../../shared/types';
import { getDatabase } from '../../db/connection';


const DEFAULT_GROUP_HEIGHT = 300;

interface GroupSummary {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  itemCount: number;
}

export function createGroupTools(
  groupRepo: IGroupRepository,
  planItemRepo: IPlanItemRepository,
  onPlanActions: PlanActionsCallback
) {
  const db = getDatabase();

  /**
   * Get items assigned to a specific group
   */
  function getGroupItems(groupId: string): { id: string; title: string; status_category: string }[] {
    return db
      .prepare(
        `
        SELECT id, title, status_category
        FROM plan_items
        WHERE group_id = ?
        ORDER BY item_order
      `
      )
      .all(groupId) as { id: string; title: string; status_category: string }[];
  }

  return [
    // ─────────────────────────────────────────────────────────────────────────
    // Query Tools (Read-Only)
    // ─────────────────────────────────────────────────────────────────────────

    tool(
      'list_groups',
      'List all visual group containers in a project. Returns group summaries with item counts. Groups are Figma-style frames for visually organizing plan items on the canvas.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
      },
      async ({ projectId }) => {
        try {

          const summaries: GroupSummary[] = groups.map((group) => ({
            id: group.id,
            name: group.name,
            position_x: group.position_x,
            position_y: group.position_y,
            width: group.width,
            height: group.height,
          }));

          return jsonResult({ groups: summaries, count: summaries.length });
        } catch (error) {
          return toolError(`Failed to list groups: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'get_group',
      'Get details of a single group including its assigned items.',
      {
        groupId: z.string().uuid().describe('The group UUID'),
      },
      async ({ groupId }) => {
        try {
          const group = groupRepo.getById(groupId);
          if (!group) {
            return toolError(`Group not found: ${groupId}`);
          }

          const items = getGroupItems(groupId);

          return jsonResult({
            group,
            items,
            itemCount: items.length,
          });
        } catch (error) {
          return toolError(`Failed to get group: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'get_ungrouped_items',
      'Get plan items that are not assigned to any group. Useful for finding items to organize into groups.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        limit: z.number().int().min(1).max(100).optional().describe('Max items to return (default 50)'),
      },
      async ({ projectId, limit = 50 }) => {
        try {
          const items = db
            .prepare(
              `
              SELECT id, title, status_category, label, parent_id
              FROM plan_items
              WHERE project_id = ? AND group_id IS NULL AND status = 'planned'
              ORDER BY item_order
              LIMIT ?
            `
            )
            .all(projectId, limit) as {
              id: string;
              title: string;
              status_category: string;
              label: string;
              parent_id: string | null;
            }[];

          return jsonResult({ items, count: items.length });
        } catch (error) {
          return toolError(`Failed to get ungrouped items: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    // ─────────────────────────────────────────────────────────────────────────
    // Modification Tools (Emit Actions for Approval)
    // ─────────────────────────────────────────────────────────────────────────

    tool(
      'create_group',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        name: z.string().min(1).max(100).describe('Group name'),
        position_x: z.number().optional().describe('X position on canvas (defaults to 100)'),
        position_y: z.number().optional().describe('Y position on canvas (defaults to 100)'),
        height: z.number().optional().describe('Group height (defaults to 300)'),
      },
        try {
          const action: PlanAction = {
            type: 'create_group',
            project_id: projectId,
            name,
            position_x: position_x ?? 100,
            position_y: position_y ?? 100,
            width: width ?? DEFAULT_GROUP_WIDTH,
            height: height ?? DEFAULT_GROUP_HEIGHT,
          };

          onPlanActions([action]);

          return jsonResult({
            success: true,
          });
        } catch (error) {
          return toolError(`Failed to create group: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ),

    tool(
      'update_group',
      {
        groupId: z.string().uuid().describe('The group UUID'),
        updates: z.object({
          name: z.string().min(1).max(100).optional().describe('New group name'),
          width: z.number().optional().describe('New width'),
          height: z.number().optional().describe('New height'),
        }).describe('Properties to update'),
      },
      async ({ groupId, updates }) => {
        try {
          const group = groupRepo.getById(groupId);
          if (!group) {
            return toolError(`Group not found: ${groupId}`);
          }

          const action: PlanAction = {
            type: 'update_group',
            group_id: groupId,
            updates,
          };

          onPlanActions([action]);

          return jsonResult({
            success: true,
          });
        } catch (error) {
          return toolError(`Failed to update group: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ),

    tool(
      'delete_group',
      {
        groupId: z.string().uuid().describe('The group UUID'),
      },
      async ({ groupId }) => {
        try {
          const group = groupRepo.getById(groupId);
          if (!group) {
            return toolError(`Group not found: ${groupId}`);
          }

          const items = getGroupItems(groupId);

          const action: PlanAction = {
            type: 'delete_group',
            group_id: groupId,
          };

          onPlanActions([action]);

          return jsonResult({
            success: true,
          });
        } catch (error) {
          return toolError(`Failed to delete group: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { destructiveHint: true } }
    ),

    tool(
      'assign_items_to_group',
      {
        itemIds: z.array(z.string().uuid()).min(1).max(100).describe('Plan item UUIDs to assign'),
        groupId: z.string().uuid().nullable().describe('Group UUID to assign to, or null to unassign'),
      },
      async ({ itemIds, groupId }) => {
        try {
          // Validate group exists if assigning
          if (groupId) {
            const group = groupRepo.getById(groupId);
            if (!group) {
              return toolError(`Group not found: ${groupId}`);
            }
          }


          if (validItems.length === 0) {
            return toolError('No valid items found');
          }

          // Create assign actions for each item
          const actions: PlanAction[] = validItems.map((itemId) => ({
            type: 'assign_to_group',
            item_id: itemId,
            group_id: groupId,
          }));

          onPlanActions(actions);

          const actionDesc = groupId ? 'assigning to group' : 'unassigning from group';
          return jsonResult({
            success: true,
            actionCount: actions.length,
            skippedCount: itemIds.length - validItems.length,
          });
        } catch (error) {
          return toolError(`Failed to assign items: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ),

    tool(
      'bulk_create_groups',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        groups: z.array(z.object({
          name: z.string().min(1).max(100).describe('Group name'),
          position_x: z.number().optional().describe('X position'),
          position_y: z.number().optional().describe('Y position'),
        })).min(1).max(20).describe('Groups to create'),
      },
      async ({ projectId, groups }) => {
        try {
          // Calculate positions if not provided (arrange in a grid)
          const actions: PlanAction[] = groups.map((group, index) => {
            const row = Math.floor(index / 3);
            const col = index % 3;

            return {
              type: 'create_group',
              project_id: projectId,
              name: group.name,
              position_x: group.position_x ?? (100 + col * 450),
              position_y: group.position_y ?? (100 + row * 350),
              width: DEFAULT_GROUP_WIDTH,
              height: DEFAULT_GROUP_HEIGHT,
          });

          onPlanActions(actions);

          return jsonResult({
            success: true,
            actionCount: actions.length,
          });
        } catch (error) {
          return toolError(`Failed to bulk create groups: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ),

    tool(
      'bulk_delete_groups',
      {
        groupIds: z.array(z.string().uuid()).min(1).max(50).describe('Group UUIDs to delete'),
      },
      async ({ groupIds }) => {
        try {

          if (validGroups.length === 0) {
            return toolError('No valid groups found');
          }

          const actions: PlanAction[] = validGroups.map((groupId) => ({
            type: 'delete_group',
            group_id: groupId,
          }));

          onPlanActions(actions);

          return jsonResult({
            success: true,
            actionCount: actions.length,
            skippedCount: groupIds.length - validGroups.length,
          });
        } catch (error) {
          return toolError(`Failed to bulk delete groups: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { destructiveHint: true } }
    ),

    tool(
      'clear_all_group_assignments',
      {
        projectId: z.string().uuid().describe('The project UUID'),
      },
      async ({ projectId }) => {
        try {
          // Find all items with group assignments
          const assignedItems = db
            .prepare(
              `
              SELECT id FROM plan_items
              WHERE project_id = ? AND group_id IS NOT NULL
            `
            )
            .all(projectId) as { id: string }[];

          if (assignedItems.length === 0) {
            return jsonResult({ message: 'No items are assigned to groups', count: 0 });
          }

          const actions: PlanAction[] = assignedItems.map((item) => ({
            type: 'assign_to_group',
            item_id: item.id,
            group_id: null,
          }));

          onPlanActions(actions);

          return jsonResult({
            success: true,
            actionCount: actions.length,
          });
        } catch (error) {
          return toolError(`Failed to clear group assignments: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { destructiveHint: true } }
    ),
  ];
}
