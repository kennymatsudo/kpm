/**
 * Relation Tools
 *
 * Tools for querying plan item dependencies and relationships
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


        // Enrich relations with item data
        const enrichedRelations = relations.map((rel) => {
          const fromItem = itemMap.get(rel.from_item_id);
          const toItem = itemMap.get(rel.to_item_id);

          return {
            id: rel.id,
            relation_type: rel.relation_type,
            from_item: fromItem
              ? {
              : {
            to_item: toItem
              ? {
              : {
          };
        });

        return jsonResult({ relations: enrichedRelations, count: enrichedRelations.length });
    ),
  ];
}
