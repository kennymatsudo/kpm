/* eslint-disable @typescript-eslint/require-await */
/**
 * Relation Tools
 *
 * Tools for querying plan item dependencies and relationships
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, projectScoped } from './index';
import type { IPlanItemRepository } from '../../db/interfaces';
import type { PlanItem, PlanRelation } from '../../../shared/types';
import { getDatabase } from '../../db/connection';

export function createRelationTools(
  planItemRepo: IPlanItemRepository
) {
  const db = getDatabase();

  return [
    tool(
      'get_enriched_relations',
      `List dependency relations as "from_item relation_type to_item" (blocks, depends_on, relates_to), with each item's title and status. Use it for "what blocks X", for the project's whole dependency graph (omit itemId), or to get the relation_id that modify_plan's remove_dependency needs. For one item's dependencies alongside its full record, get_plan_items with include.dependencies is enough.`,
      {
        itemId: z.string().min(1).optional().describe('Only relations involving this item; omit for every relation in the project'),
      },
      projectScoped(async ({ projectId, itemId }) => {
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

        const summarize = (id: string) => {
          const item = itemMap.get(id);
          return item
            ? { id, title: item.title, status_category: item.status_category, external_key: item.external_key ?? undefined }
            : { id, title: '[deleted]' };
        };

        const enrichedRelations = relations.map((rel) => ({
          relation_id: rel.id,
          from_item: summarize(rel.from_item_id),
          relation_type: rel.relation_type,
          to_item: summarize(rel.to_item_id),
        }));

        return jsonResult({ relations: enrichedRelations, count: enrichedRelations.length });
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
