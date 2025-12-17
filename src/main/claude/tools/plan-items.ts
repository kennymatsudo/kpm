/**
 * Plan Item Tools
 *
 */

import { z } from 'zod';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import { getDatabase } from '../../db/connection';

// Status and label enums matching shared types
const LabelEnum = z.enum(['project', 'feature', 'task']);

type PlanItemSummary = Pick<
  PlanItem,
  'id' | 'title' | 'parent_id' | 'status' | 'status_category' | 'label' | 'release_tag' | 'external_key'
>;

interface TreeNode extends PlanItemSummary {
  children: TreeNode[];
}

  const db = getDatabase();

  /**
   * Build hierarchical tree from flat items
   */
  function buildHierarchy(items: PlanItemSummary[]): TreeNode[] {
    // O(n) preprocessing: build parent -> children map
    const childrenMap = new Map<string | null, PlanItemSummary[]>();
    for (const item of items) {
      const siblings = childrenMap.get(item.parent_id);
      if (siblings) {
        siblings.push(item);
      } else {
        childrenMap.set(item.parent_id, [item]);
      }
    }

    // O(n) tree building
    const buildTree = (parentId: string | null): TreeNode[] => {
      const children = childrenMap.get(parentId) || [];
      return children.map((item) => ({
        ...item,
        children: buildTree(item.id),
      }));
    };

    return buildTree(null);
  }

  /**
   * Get child counts for all items
   */
  function getChildCounts(projectId: string): Map<string, number> {
    const rows = db
      .prepare(
        `
      SELECT parent_id as parentId, COUNT(*) as count
      FROM plan_items
      WHERE project_id = ?
      GROUP BY parent_id
    `
      )

    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.parentId) {
        map.set(row.parentId, row.count);
      }
    }
    return map;
  }

  /**
   * Get plan item summaries with optional filtering
   */
  function getPlanItemSummaries(
    projectId: string,
    filters?: {
      status?: 'backlog' | 'planned';
      statusCategory?: PlanItem['status_category'];
      label?: PlanItem['label'];
      releaseTag?: string;
      externalKey?: string;
      hasExternalKey?: boolean;
      search?: string;
      parentId?: string | null;
    }
  ): PlanItemSummary[] {
    const where: string[] = ['project_id = ?'];
    const params: unknown[] = [projectId];

    if (filters?.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.statusCategory) {
      where.push('status_category = ?');
      params.push(filters.statusCategory);
    }
    if (filters?.label) {
      where.push('label = ?');
      params.push(filters.label);
    }
    if (filters?.releaseTag) {
      where.push('release_tag = ?');
      params.push(filters.releaseTag);
    }
    if (filters?.externalKey) {
      where.push('external_key = ?');
      params.push(filters.externalKey);
    }
    if (filters?.hasExternalKey !== undefined) {
      where.push(filters.hasExternalKey ? 'external_key IS NOT NULL' : 'external_key IS NULL');
    }
    if (filters?.search) {
      where.push('LOWER(title) LIKE ?');
      params.push(`%${filters.search.toLowerCase()}%`);
    }
    if (filters?.parentId !== undefined) {
      if (filters.parentId === null) {
        where.push('parent_id IS NULL');
      } else {
        where.push('parent_id = ?');
        params.push(filters.parentId);
      }
    }

    const query = `
      SELECT id, title, parent_id, status, status_category, label, release_tag, external_key
      FROM plan_items
      WHERE ${where.join(' AND ')}
      ORDER BY item_order
    `;

    return db.prepare(query).all(...params) as PlanItemSummary[];
  }

  return [
    tool(
      'Get the full plan as a nested tree structure. Returns summary data (id, title, status, status_category, label, release_tag, external_key) with children nested. **BEST FOR:** Understanding plan structure, seeing parent-child relationships, displaying the whole plan. **USE filter_plan_items INSTEAD when:** You just need to find specific items without needing the tree structure.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        status: StatusEnum.optional().describe('Filter by status'),
      },
      async ({ projectId, status }) => {
        try {
          const items = getPlanItemSummaries(projectId, { status });
          const tree = buildHierarchy(items);
          return jsonResult({ tree, totalItems: items.length });
        } catch (error) {
        }
    ),

    tool(
      'Query and filter plan items. Returns summary data with child counts. **BEST FOR:** Finding items by external key (e.g., "PROJ-7012"), filtering by status/label/category, searching by title. Omit status param to get all items (canvas + backlog) in one call.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        status: StatusEnum.optional().describe(
          'Filter by status. Omit to get ALL items (planned + backlog) in one call.'
        ),
        statusCategory: StatusCategoryEnum.optional().describe('Filter by status category'),
        label: LabelEnum.optional().describe('Filter by label'),
        releaseTag: z.string().optional().describe('Filter by release tag'),
        externalKey: z
          .string()
          .optional()
          .describe('Filter by external tracker key (e.g., "PROJ-7012" for Jira). Returns exact match.'),
        hasExternalKey: z
          .boolean()
          .optional()
          .describe('If true, only items linked to external tracker; if false, only unlinked items'),
        search: z.string().optional().describe('Case-insensitive substring match on title'),
        parentId: z.string().optional().describe('Filter by parent ID. Use "null" for root items only.'),
      },
      async ({ projectId, status, statusCategory, label, releaseTag, externalKey, hasExternalKey, search, parentId }) => {
        try {
          const normalizedParent = parentId === undefined ? undefined : parentId === 'null' ? null : parentId;
          const items = getPlanItemSummaries(projectId, {
            status,
            statusCategory,
            label,
            releaseTag,
            externalKey,
            hasExternalKey,
            search,
            parentId: normalizedParent,
          });

          const childCountMap = getChildCounts(projectId);

          const results = items.map((item) => ({
            id: item.id,
            title: item.title,
            parent_id: item.parent_id,
            status: item.status,
            status_category: item.status_category,
            label: item.label,
            release_tag: item.release_tag,
            external_key: item.external_key,
            childCount: childCountMap.get(item.id) || 0,
          }));

          return jsonResult({ items: results, count: results.length });
        } catch (error) {
        }
    ),

    tool(
      { itemId: z.string().uuid().describe('The plan item UUID') },
      async ({ itemId }) => {
        const item = planItemRepo.get(itemId);
        if (!item) {
          return toolError(`Plan item not found: ${itemId}`);
        }
        return jsonResult({ item });
    ),

    tool(
      'Get full details for multiple items in one call. **REPLACES:** multiple get_plan_item calls. Accepts up to 50 item IDs. Can optionally include dependencies (blockers) and parent titles.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        itemIds: z.array(z.string().uuid()).max(50).describe('Array of plan item UUIDs (max 50)'),
        includeParentTitle: z.boolean().optional().describe('Include parent title for each item'),
        includeDependencies: z.boolean().optional().describe('Include dependency info (blockedBy/blocks/relatedTo) for each item'),
      },
      async ({ projectId, itemIds, includeParentTitle, includeDependencies }) => {
        // Efficient single query fetch
        const allItems = planItemRepo.getMany(itemIds);
        const items = allItems.filter(i => i.project_id === projectId);

        const itemMap = new Map(items.map((i) => [i.id, i]));

        // Get parent titles if requested
        const parentTitleMap = new Map<string, string>();
        if (includeParentTitle) {
          const parentIds = Array.from(new Set(items.map((i) => i.parent_id).filter((id): id is string => !!id)));
          if (parentIds.length > 0) {
            const placeholders = parentIds.map(() => '?').join(', ');
            const rows = db
              .prepare(`SELECT id, title FROM plan_items WHERE id IN (${placeholders})`)
            for (const row of rows) {
              parentTitleMap.set(row.id, row.title);
            }
          }
        }

        // Get dependencies if requested
        if (includeDependencies && planRelationRepo && itemIds.length > 0) {
          // Efficiently fetch all relations involving ANY of the items
          const relations = planRelationRepo.getByItemIds(itemIds);

          // Must fetch names of related items (some might be outside our initial batch list)
          const relatedItemIds = new Set<string>();
          for (const rel of relations) {
            relatedItemIds.add(rel.from_item_id);
            relatedItemIds.add(rel.to_item_id);
          }
          const allRelatedItems = planItemRepo.getMany(Array.from(relatedItemIds));
          const relatedItemMap = new Map(allRelatedItems.map(i => [i.id, i]));

          // Initialize map for all requested items
          for (const id of itemIds) {
            dependencyMap.set(id, { blockedBy: [], blocks: [], relatedTo: [] });
          }

          // Populate dependencies
          for (const rel of relations) {
            // We only care about relations connected to our specific batch items
            // Note: A relation might connect two items both in our batch, so proceed carefully

            // Process 'from' side (if 'from' is in our batch)
            if (itemMap.has(rel.from_item_id)) {
              const deps = dependencyMap.get(rel.from_item_id)!;
              const other = relatedItemMap.get(rel.to_item_id);
              const summary = other ? { id: other.id, title: other.title, status: other.status } : { id: rel.to_item_id, title: '[deleted]' };

              if (rel.relation_type === 'blocks') deps.blocks.push(summary);
              else if (rel.relation_type === 'depends_on') deps.blockedBy.push(summary);
              else if (rel.relation_type === 'relates_to') deps.relatedTo.push(summary);
            }

            // Process 'to' side (if 'to' is in our batch)
            if (itemMap.has(rel.to_item_id)) {
              const deps = dependencyMap.get(rel.to_item_id)!;
              const other = relatedItemMap.get(rel.from_item_id);
              const summary = other ? { id: other.id, title: other.title, status: other.status } : { id: rel.from_item_id, title: '[deleted]' };

              if (rel.relation_type === 'blocks') deps.blockedBy.push(summary); // If X blocks me (to), I am blocked by X
              else if (rel.relation_type === 'depends_on') deps.blocks.push(summary); // If X depends on me (to), I block X
              else if (rel.relation_type === 'relates_to') deps.relatedTo.push(summary);
            }
          }
        }

        const notFound: string[] = [];

        for (const id of itemIds) {
          const item = itemMap.get(id);
          if (item) {
            if (includeParentTitle && item.parent_id) {
              result.parentTitle = parentTitleMap.get(item.parent_id) ?? '[deleted]';
            }
            if (includeDependencies && dependencyMap.has(id)) {
              result.dependencies = dependencyMap.get(id);
            }
            found.push(result);
          } else {
            notFound.push(id);
          }
        }

        return jsonResult({ items: found, notFound, count: found.length });
    ),

    tool(
      {
        projectId: z.string().uuid().describe('The project UUID'),
        itemId: z.string().uuid().describe('The plan item UUID'),
      },
      async ({ projectId, itemId }) => {
        const item = planItemRepo.get(itemId);
          return toolError(`Plan item not found: ${itemId}`);
        }

        // Get parent summary
        const parentSummary = item.parent_id
          ? (db
            .prepare(
              `
            SELECT id, title, status, status_category, label, external_key
            FROM plan_items
            WHERE id = ?
          `
            )
            .get(item.parent_id) as PlanItemSummary | undefined)
          : null;

        // Get children
        const children = db
          .prepare(
            `
          SELECT id, title, status, status_category, label, external_key
          FROM plan_items
          WHERE parent_id = ?
          ORDER BY item_order
        `
          )
          .all(itemId) as PlanItemSummary[];

        // Count all descendants (recursive)
        const descendantRow = db
          .prepare(
            `
          WITH RECURSIVE descendants(id) AS (
            SELECT id FROM plan_items WHERE parent_id = ? AND project_id = ?
            UNION ALL
            SELECT p.id FROM plan_items p JOIN descendants d ON p.parent_id = d.id
            WHERE p.project_id = ?
          )
          SELECT COUNT(*) as count FROM descendants
        `
          )
          .get(itemId, projectId, projectId) as { count: number } | undefined;
        const descendantCount = descendantRow?.count ?? 0;

        // Get relations
        const itemRelations = db
          .prepare(
            `
          SELECT id, from_item_id, to_item_id, relation_type
          FROM plan_relations
          WHERE project_id = ? AND (from_item_id = ? OR to_item_id = ?)
        `
          )
            id: string;
            from_item_id: string;
            to_item_id: string;
            relation_type: string;

        // Collect related item IDs and fetch them
        const relatedIds = new Set<string>();
        for (const rel of itemRelations) {
          relatedIds.add(rel.from_item_id);
          relatedIds.add(rel.to_item_id);
        }
        relatedIds.delete(itemId);

        const relatedItems = new Map<string, PlanItem>();
          }
        }

        // Categorize dependencies

        for (const rel of itemRelations) {
          const otherId = rel.from_item_id === itemId ? rel.to_item_id : rel.from_item_id;
          const otherItem = relatedItems.get(otherId);
          const summary = otherItem
            ? { id: otherItem.id, title: otherItem.title, status: otherItem.status, external_key: otherItem.external_key }
            : { id: otherId, title: '[deleted]', status: null, external_key: null };

          if (rel.relation_type === 'blocks') {
            if (rel.from_item_id === itemId) {
              blocks.push(summary);
            } else {
              blockedBy.push(summary);
            }
          } else if (rel.relation_type === 'depends_on') {
            if (rel.from_item_id === itemId) {
              blockedBy.push(summary);
            } else {
              blocks.push(summary);
            }
          } else if (rel.relation_type === 'relates_to') {
            relatedTo.push(summary);
          }
        }

        return jsonResult({
          item,
          parent: parentSummary
            ? {
              id: parentSummary.id,
              title: parentSummary.title,
              status: parentSummary.status,
              status_category: parentSummary.status_category,
              label: parentSummary.label,
              external_key: parentSummary.external_key,
            }
            : null,
          children,
          childCount: children.length,
          descendantCount,
          dependencies: {
            blockedBy,
            blocks,
            relatedTo,
          },
        });
    ),
  ];
}
