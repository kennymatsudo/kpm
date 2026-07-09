/* eslint-disable @typescript-eslint/require-await */
/**
 * Group Tools
 *
 * Read-only query tools for visual group containers (Figma-style frames).
 * Group mutations go through the modify_plan tool (create_group, update_group,
 * delete_group, assign_to_group actions) rather than dedicated tools here.
 *
 * Groups are purely visual - they organize plan items without affecting hierarchy.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import type { IGroupRepository } from '../../db/interfaces';
import { getDatabase } from '../../db/connection';

interface GroupSummary {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  itemCount: number;
}

export function createGroupTools(groupRepo: IGroupRepository) {
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
        console.log('[KPM Tools] list_groups called for project:', projectId);
        try {
          const groups = groupRepo.getByProjectIdWithCounts(projectId);

          const summaries: GroupSummary[] = groups.map((group) => ({
            id: group.id,
            name: group.name,
            position_x: group.position_x,
            position_y: group.position_y,
            width: group.width,
            height: group.height,
            itemCount: group.itemCount,
          }));

          return jsonResult({ groups: summaries, count: summaries.length });
        } catch (error) {
          console.error('[KPM Tools] list_groups error:', error);
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
        console.log('[KPM Tools] get_group called for:', groupId);
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
          console.error('[KPM Tools] get_group error:', error);
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
        console.log('[KPM Tools] get_ungrouped_items called for project:', projectId);
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
          console.error('[KPM Tools] get_ungrouped_items error:', error);
          return toolError(`Failed to get ungrouped items: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
