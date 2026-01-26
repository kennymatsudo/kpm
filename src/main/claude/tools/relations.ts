/* eslint-disable @typescript-eslint/require-await */
/**
 * Relation Tools
 *
 * Tools for querying plan item dependencies and relationships
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult } from './index';
import type { PlanItem, PlanRelation } from '../../../shared/types';
import { getDatabase } from '../../db/connection';

export function createRelationTools(
  planItemRepo: IPlanItemRepository
) {
  const db = getDatabase();

  return [
    tool(
      'get_enriched_relations',
      'Get dependency relations (blocks, depends_on, relates_to) with item details included. Returns relation type plus from/to item summaries (id, title, status, external_key) in one call. **USE FOR:** "What blocks X?", "Show dependencies for X". **USE get_item_context INSTEAD** for delete/move decisions (it includes relations plus children).',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        itemId: z.string().uuid().optional().describe('Filter to relations involving this item'),
      },
      async ({ projectId, itemId }) => {
        const where: string[] = ['project_id = ?'];
        const params: unknown[] = [projectId];
        if (itemId) {
          where.push('(from_item_id = ? OR to_item_id = ?)');
          params.push(itemId, itemId);
        }

        const relations = db
          .prepare(
            `
          SELECT id, project_id, from_item_id, to_item_id, relation_type
          FROM plan_relations
          WHERE ${where.join(' AND ')}
        `
          )
          .all(...params) as PlanRelation[];

        // Collect all item IDs referenced in relations
        const itemIds = new Set<string>();
        for (const rel of relations) {
          itemIds.add(rel.from_item_id);
          itemIds.add(rel.to_item_id);
        }

        // Fetch all items in one pass using efficient batch query
        const allItems = planItemRepo.getMany(Array.from(itemIds));
        const itemMap = new Map<string, PlanItem>(allItems.map(i => [i.id, i]));

        // Enrich relations with item data
        const enrichedRelations = relations.map((rel) => {
          const fromItem = itemMap.get(rel.from_item_id);
          const toItem = itemMap.get(rel.to_item_id);

          return {
            id: rel.id,
            relation_type: rel.relation_type,
            from_item: fromItem
              ? {
                id: fromItem.id,
                title: fromItem.title,
                status: fromItem.status,
                status_category: fromItem.status_category,
                external_key: fromItem.external_key,
              }
              : {
                id: rel.from_item_id,
                title: '[deleted]',
                status: null,
                status_category: null,
                external_key: null,
              },
            to_item: toItem
              ? {
                id: toItem.id,
                title: toItem.title,
                status: toItem.status,
                status_category: toItem.status_category,
                external_key: toItem.external_key,
              }
              : {
                id: rel.to_item_id,
                title: '[deleted]',
                status: null,
                status_category: null,
                external_key: null,
              },
          };
        });

        return jsonResult({ relations: enrichedRelations, count: enrichedRelations.length });
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
