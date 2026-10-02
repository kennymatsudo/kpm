/* eslint-disable @typescript-eslint/require-await */
/**
 * Plan Item Tools
 *
 * Query tools for reading plan items, and a bulk modification tool that emits
 * PlanActions to KPM (never modifies directly).
 *
 * IMPORTANT: All modification tools MUST emit actions via onPlanActions callback.
 * Direct database modifications bypass the review UI and confuse users.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import { tool, jsonResult, toolError, toolLog, projectScoped } from './index';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import type { PlanItem, PlanAction } from '../../../shared/types';
import { getDatabase } from '../../db/connection';
import { StatusCategoryEnum, LabelEnum, type PlanActionsCallback } from './schemas';

export type { PlanActionsCallback };

type PlanItemSummary = Pick<
  PlanItem,
  'id' | 'title' | 'parent_id' | 'status_category' | 'label' | 'release_tag' | 'external_key'
>;

interface TreeNode extends PlanItemSummary {
  children?: TreeNode[];
}

/** Summary of a related item for dependency display */
interface DependencySummary {
  id: string;
  title: string;
  status_category?: PlanItem['status_category'];
  external_key?: string | null;
}

/** Dependencies grouped by relationship type */
interface ItemDependencies {
  blockedBy: DependencySummary[];
  blocks: DependencySummary[];
  relatedTo: DependencySummary[];
}

/** Extended plan item with optional parent title, children, and dependencies */
/**
 * The item fields chat can act on. The rest of a PlanItem (avatars, tracker
 * internal IDs, sync bookkeeping, ordering, timestamps) is never used to answer
 * a question and used to make up most of each record.
 */
const PLAN_ITEM_READ_FIELDS = [
  'parent_id',
  'title',
  'description',
  'intent',
  'acceptance_criteria',
  'work_brief_revision',
  'source_document_id',
  'label',
  'status_category',
  'release_tag',
  'code_refs',
  'primary_repo_id',
  'affected_repo_ids',
  'external_key',
  'external_type',
  'external_issue_type',
  'external_status',
  'external_url',
  'external_parent_key',
  'external_epic_key',
  'external_assignee_name',
  'completed_at',
] as const satisfies readonly (keyof PlanItem)[];

type PlanItemReadField = (typeof PLAN_ITEM_READ_FIELDS)[number];

/** Picks the requested fields and leaves out empty ones, so an unset field costs nothing. */
function toReadRecord(item: PlanItem, fields: readonly PlanItemReadField[]): Partial<PlanItem> & { id: string } {
  const record: Partial<PlanItem> & { id: string } = { id: item.id };
  for (const field of fields) {
    const value = item[field];
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    (record as Record<string, unknown>)[field] = value;
  }
  return record;
}

interface PlanItemWithExtras extends Partial<PlanItem> {
  id: string;
  parentTitle?: string;
  children?: PlanItemSummary[];
  descendantCount?: number;
  dependencies?: ItemDependencies;
}

/** Shared filter shape for bulk_modify_plan (field names vary per tool schema; callers map onto this). */
export interface BulkTargetFilter {
  parentId?: string;
  statusCategory?: PlanItem['status_category'];
  label?: PlanItem['label'];
  releaseTag?: string;
  hasParent?: boolean;
}

/**
 * Resolve which item ids bulk_modify_plan should act on: explicit itemIds take
 * precedence over filter criteria. Returns null when neither is provided —
 * callers surface that as a validation error.
 */
export function resolveBulkTargetIds(
  db: Database,
  projectId: string,
  itemIds: string[] | undefined,
  filter: BulkTargetFilter | undefined
): string[] | null {
  if (itemIds && itemIds.length > 0) {
    return itemIds;
  }
  if (!filter) {
    return null;
  }

  const where: string[] = ['project_id = ?'];
  const params: unknown[] = [projectId];

  if (filter.parentId) {
    where.push('parent_id = ?');
    params.push(filter.parentId);
  }
  if (filter.statusCategory) {
    where.push('status_category = ?');
    params.push(filter.statusCategory);
  }
  if (filter.label) {
    where.push('label = ?');
    params.push(filter.label);
  }
  if (filter.releaseTag) {
    where.push('release_tag = ?');
    params.push(filter.releaseTag);
  }
  if (filter.hasParent !== undefined) {
    where.push(filter.hasParent ? 'parent_id IS NOT NULL' : 'parent_id IS NULL');
  }

  const rows = db
    .prepare(`SELECT id FROM plan_items WHERE ${where.join(' AND ')}`)
    .all(...params) as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Validate the exactly-one-selector rule shared by bulk_modify_plan: exactly
 * one of itemIds or a non-empty filter must be provided. Returns an error
 * message, or null when the selector is valid.
 */
const EMPTY_SELECTOR_MESSAGE =
  'Provide either itemIds or a filter with at least one criterion (parentId, statusCategory, label, releaseTag, hasParent).';

function validateBulkSelector(
  itemIds: string[] | undefined,
  filter: BulkTargetFilter | undefined
): string | null {
  const hasItemIds = !!itemIds && itemIds.length > 0;
  const hasFilter = !!filter && Object.values(filter).some((v) => v !== undefined);

  if (hasItemIds && hasFilter) {
    return 'Provide either itemIds or filter, not both.';
  }
  if (!hasItemIds && !hasFilter) {
    return EMPTY_SELECTOR_MESSAGE;
  }
  return null;
}

export function createPlanItemTools(
  planItemRepo: IPlanItemRepository,
  planRelationRepo: IPlanRelationRepository | undefined,
  onPlanActions: PlanActionsCallback
) {
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
      return children.map((item) => {
        const nested = buildTree(item.id);
        return nested.length > 0 ? { ...item, children: nested } : item;
      });
    };

    return buildTree(null);
  }

  /**
   * Given a set of matched item summaries, fetch the full ancestor chain of
   * each (up to root) and return the merged set so buildHierarchy() produces
   * a coherent tree instead of orphaned branches.
   */
  function buildAncestorClosure(projectId: string, matchedItems: PlanItemSummary[]): PlanItemSummary[] {
    if (matchedItems.length === 0) return [];
    const matchedIds = matchedItems.map((i) => i.id);
    const placeholders = matchedIds.map(() => '?').join(',');

    return db
      .prepare(
        `
        WITH RECURSIVE lineage(id) AS (
          SELECT id FROM plan_items WHERE id IN (${placeholders})
          UNION
          SELECT p.parent_id FROM plan_items p JOIN lineage l ON p.id = l.id WHERE p.parent_id IS NOT NULL
        )
        SELECT DISTINCT pi.id, pi.title, pi.parent_id, pi.status_category, pi.label, pi.release_tag, pi.external_key
        FROM plan_items pi
        JOIN lineage l ON pi.id = l.id
        WHERE pi.project_id = ?
      `
      )
      .all(...matchedIds, projectId) as PlanItemSummary[];
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
      .all(projectId) as { parentId: string | null; count: number }[];

    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.parentId) {
        map.set(row.parentId, row.count);
      }
    }
    return map;
  }

  /**
   * Get immediate child summaries and total descendant counts for a batch of
   * item ids in two queries (instead of one recursive query per item).
   */
  function getChildSummariesAndDescendantCounts(
    projectId: string,
    itemIds: string[]
  ): { childrenMap: Map<string, PlanItemSummary[]>; descendantCountMap: Map<string, number> } {
    if (itemIds.length === 0) {
      return { childrenMap: new Map(), descendantCountMap: new Map() };
    }
    const placeholders = itemIds.map(() => '?').join(',');

    const childRows = db
      .prepare(
        `
        SELECT id, title, parent_id, status_category, label, release_tag, external_key
        FROM plan_items
        WHERE parent_id IN (${placeholders})
        ORDER BY item_order
      `
      )
      .all(...itemIds) as PlanItemSummary[];

    const childrenMap = new Map<string, PlanItemSummary[]>();
    for (const child of childRows) {
      const key = child.parent_id!;
      const siblings = childrenMap.get(key);
      if (siblings) {
        siblings.push(child);
      } else {
        childrenMap.set(key, [child]);
      }
    }

    const descendantRows = db
      .prepare(
        `
        WITH RECURSIVE descendants(root_id, id) AS (
          SELECT id, id FROM plan_items WHERE id IN (${placeholders}) AND project_id = ?
          UNION ALL
          SELECT d.root_id, p.id FROM plan_items p JOIN descendants d ON p.parent_id = d.id
        )
        SELECT root_id, COUNT(*) - 1 AS count FROM descendants GROUP BY root_id
      `
      )
      .all(...itemIds, projectId) as { root_id: string; count: number }[];

    const descendantCountMap = new Map<string, number>();
    for (const row of descendantRows) {
      descendantCountMap.set(row.root_id, row.count);
    }

    return { childrenMap, descendantCountMap };
  }

  /**
   * Get plan item summaries with optional filtering
   */
  function getPlanItemSummaries(
    projectId: string,
    filters?: {
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
      SELECT id, title, parent_id, status_category, label, release_tag, external_key
      FROM plan_items
      WHERE ${where.join(' AND ')}
      ORDER BY item_order
    `;

    return db.prepare(query).all(...params) as PlanItemSummary[];
  }

  return [
    tool(
      'query_plan_items',
      `Find plan items by status category, label, release tag, tracker key, parent, or title text, and see each one's status. The system prompt's Item Reference lists only the IDs and titles of open items, so use this for status, for closed (done or canceled) items, or to locate items by these fields. Returns summaries without descriptions; use get_plan_items for an item's full Work Brief. format "tree" nests matches under their ancestors, and with no filters it returns the whole plan as a tree.`,
      {
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
        format: z
          .enum(['flat', 'tree'])
          .optional()
          .describe('Output shape: "flat" (default) or "tree" (matches nested under their ancestors).'),
      },
      projectScoped(async ({ projectId, statusCategory, label, releaseTag, externalKey, hasExternalKey, search, parentId, format = 'flat' }) => {
        toolLog('[KPM Tools] query_plan_items called with:', { projectId, statusCategory, label, format });
        try {
          const normalizedParent = parentId === undefined ? undefined : parentId === 'null' ? null : parentId;
          const items = getPlanItemSummaries(projectId, {
            statusCategory,
            label,
            releaseTag,
            externalKey,
            hasExternalKey,
            search,
            parentId: normalizedParent,
          });

          toolLog('[KPM Tools] query_plan_items found', items.length, 'matching items');

          if (format === 'tree') {
            const closure = buildAncestorClosure(projectId, items);
            const tree = buildHierarchy(closure);
            return jsonResult({ tree, matchedCount: items.length, totalItems: closure.length });
          }

          const childCountMap = getChildCounts(projectId);
          const results = items.map((item) => ({
            id: item.id,
            title: item.title,
            parent_id: item.parent_id,
            status_category: item.status_category,
            label: item.label,
            release_tag: item.release_tag,
            external_key: item.external_key,
            childCount: childCountMap.get(item.id) || 0,
          }));

          return jsonResult({ items: results, count: results.length });
        } catch (error) {
          console.error('[KPM Tools] query_plan_items error:', error);
          return toolError(`Failed to query plan items: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'get_plan_items',
      `Fetch the full record of 1-50 plan items by ID: the Work Brief (title, description, intent, acceptance_criteria), its work_brief_revision, code_refs, and tracker fields. Empty fields are left out. Use it before revise_work_brief, which needs the current brief and revision, and whenever an answer depends on what an item says rather than its title. Pass fields to read only some of them, such as status_category and external_key across many items. include.children and include.dependencies show what deleting, moving, or finishing an item would affect.`,
      {
        itemIds: z.array(z.string().min(1)).min(1).max(50).describe('Plan item UUIDs to fetch (1-50)'),
        include: z
          .object({
            parentTitle: z.boolean().optional().describe("Include the parent item's title"),
            children: z.boolean().optional().describe('Include immediate child summaries and total descendant count'),
            dependencies: z.boolean().optional().describe('Include blockedBy/blocks/relatedTo dependency summaries'),
          })
          .optional()
          .describe('Additional data to include per item. All flags default to false.'),
        fields: z.array(z.enum(PLAN_ITEM_READ_FIELDS)).min(1).optional().describe('Only these fields per item, besides id; omit for all'),
      },
      projectScoped(async ({ projectId, itemIds, include, fields }) => {
        const allItems = planItemRepo.getMany(itemIds);
        const items = allItems.filter((i) => i.project_id === projectId);
        const itemMap = new Map(items.map((i) => [i.id, i]));
        const foundIds = items.map((i) => i.id);

        const parentTitleMap = new Map<string, string>();
        if (include?.parentTitle) {
          const parentIds = Array.from(new Set(items.map((i) => i.parent_id).filter((id): id is string => !!id)));
          if (parentIds.length > 0) {
            const placeholders = parentIds.map(() => '?').join(', ');
            const rows = db
              .prepare(`SELECT id, title FROM plan_items WHERE id IN (${placeholders})`)
              .all(...parentIds) as { id: string; title: string }[];
            for (const row of rows) {
              parentTitleMap.set(row.id, row.title);
            }
          }
        }

        let childrenMap = new Map<string, PlanItemSummary[]>();
        let descendantCountMap = new Map<string, number>();
        if (include?.children && foundIds.length > 0) {
          const result = getChildSummariesAndDescendantCounts(projectId, foundIds);
          childrenMap = result.childrenMap;
          descendantCountMap = result.descendantCountMap;
        }

        const dependencyMap = new Map<string, ItemDependencies>();
        if (include?.dependencies && planRelationRepo && itemIds.length > 0) {
          const relations = planRelationRepo.getByItemIds(itemIds);

          const relatedItemIds = new Set<string>();
          for (const rel of relations) {
            relatedItemIds.add(rel.from_item_id);
            relatedItemIds.add(rel.to_item_id);
          }
          const allRelatedItems = planItemRepo.getMany(Array.from(relatedItemIds));
          const relatedItemMap = new Map(allRelatedItems.map((i) => [i.id, i]));

          for (const id of itemIds) {
            dependencyMap.set(id, { blockedBy: [], blocks: [], relatedTo: [] });
          }

          for (const rel of relations) {
            if (itemMap.has(rel.from_item_id)) {
              const deps = dependencyMap.get(rel.from_item_id)!;
              const other = relatedItemMap.get(rel.to_item_id);
              const summary: DependencySummary = other
                ? { id: other.id, title: other.title, status_category: other.status_category, external_key: other.external_key }
                : { id: rel.to_item_id, title: '[deleted]' };

              if (rel.relation_type === 'blocks') deps.blocks.push(summary);
              else if (rel.relation_type === 'depends_on') deps.blockedBy.push(summary);
              else if (rel.relation_type === 'relates_to') deps.relatedTo.push(summary);
            }

            if (itemMap.has(rel.to_item_id)) {
              const deps = dependencyMap.get(rel.to_item_id)!;
              const other = relatedItemMap.get(rel.from_item_id);
              const summary: DependencySummary = other
                ? { id: other.id, title: other.title, status_category: other.status_category, external_key: other.external_key }
                : { id: rel.from_item_id, title: '[deleted]' };

              if (rel.relation_type === 'blocks') deps.blockedBy.push(summary);
              else if (rel.relation_type === 'depends_on') deps.blocks.push(summary);
              else if (rel.relation_type === 'relates_to') deps.relatedTo.push(summary);
            }
          }
        }

        const found: PlanItemWithExtras[] = [];
        const notFound: string[] = [];

        for (const id of itemIds) {
          const item = itemMap.get(id);
          if (item) {
            const result: PlanItemWithExtras = toReadRecord(item, fields ?? PLAN_ITEM_READ_FIELDS);
            if (include?.parentTitle && item.parent_id) {
              result.parentTitle = parentTitleMap.get(item.parent_id) ?? '[deleted]';
            }
            if (include?.children) {
              result.children = childrenMap.get(item.id) ?? [];
              result.descendantCount = descendantCountMap.get(item.id) ?? 0;
            }
            if (include?.dependencies && dependencyMap.has(id)) {
              result.dependencies = dependencyMap.get(id);
            }
            found.push(result);
          } else {
            notFound.push(id);
          }
        }

        return jsonResult({ items: found, notFound, count: found.length });
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'bulk_modify_plan',
      `Apply one change to many plan items at once: set status, label, or release tag, reparent, delete, or clear dependencies. Select the items with itemIds or with a filter, not both; a filter saves looking up IDs when the set is "every done item" or "all children of X". Use modify_plan instead for per-item changes or anything touching the Work Brief. KPM queues the change for review or applies it, per the user's setting. delete removes each item's descendants too. Moving Jira subtasks to root skips any whose parent mirrors the tracker hierarchy.`,
      {
        itemIds: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .optional()
          .describe('Specific item IDs to target (1-100). Provide this or filter, not both.'),
        filter: z
          .object({
            parentId: z.string().min(1).optional().describe('Target children of this parent'),
            statusCategory: StatusCategoryEnum.optional().describe('Target items currently in this status category'),
            label: LabelEnum.optional().describe('Target items with this label'),
            releaseTag: z.string().optional().describe('Target items with this release tag'),
            hasParent: z.boolean().optional().describe('true: only nested items; false: only root items'),
          })
          .optional()
          .describe('Filter criteria to select target items (at least one field). Provide this or itemIds, not both.'),
        action: z
          .discriminatedUnion('type', [
            z.object({ type: z.literal('set_status'), statusCategory: StatusCategoryEnum }),
            z.object({ type: z.literal('set_label'), label: LabelEnum }),
            z.object({ type: z.literal('set_release'), releaseTag: z.string().nullable().describe('null clears the tag') }),
            z.object({ type: z.literal('reparent'), newParentId: z.string().min(1).nullable().describe('null moves items to root') }),
            z.object({ type: z.literal('delete') }),
            z.object({
              type: z.literal('clear_dependencies'),
              direction: z.enum(['all', 'incoming', 'outgoing']).optional().describe('Which relations to remove; defaults to all'),
            }),
          ])
          .describe('The mutation to apply to the selected items'),
      },
      projectScoped(async ({ projectId, itemIds, filter, action }) => {
        toolLog('[KPM Tools] bulk_modify_plan called:', { projectId, itemIds, filter, action: action.type });
        try {
          const selectorError = validateBulkSelector(itemIds, filter);
          if (selectorError) {
            return toolError(selectorError);
          }

          const ids = resolveBulkTargetIds(db, projectId, itemIds, filter);
          if (ids === null) {
            return toolError(EMPTY_SELECTOR_MESSAGE);
          }
          if (ids.length === 0) {
            return jsonResult({ message: 'No items matched criteria', count: 0 });
          }

          switch (action.type) {
            case 'set_status': {
              const actions: PlanAction[] = ids.map((id) => ({
                type: 'update_item' as const,
                item_id: id,
                updates: { status_category: action.statusCategory },
              }));
              toolLog(`[KPM Tools] bulk_modify_plan emitting ${actions.length} update actions for approval`);
              onPlanActions(actions);
              return jsonResult({
                success: true,
                message: `Proposed updating ${actions.length} item(s) to ${action.statusCategory}. Submitted to KPM.`,
                actionCount: actions.length,
              });
            }

            case 'set_label': {
              const actions: PlanAction[] = ids.map((id) => ({
                type: 'set_label' as const,
                item_id: id,
                label: action.label,
              }));
              toolLog(`[KPM Tools] bulk_modify_plan emitting ${actions.length} set_label actions for approval`);
              onPlanActions(actions);
              return jsonResult({
                success: true,
                message: `Proposed setting label to '${action.label}' for ${actions.length} item(s). Submitted to KPM.`,
                actionCount: actions.length,
              });
            }

            case 'set_release': {
              const actions: PlanAction[] = ids.map((id) => ({
                type: 'set_release' as const,
                item_id: id,
                release_tag: action.releaseTag,
              }));
              toolLog(`[KPM Tools] bulk_modify_plan emitting ${actions.length} set_release actions for approval`);
              onPlanActions(actions);
              return jsonResult({
                success: true,
                message: action.releaseTag
                  ? `Proposed tagging ${actions.length} item(s) for release '${action.releaseTag}'. Submitted to KPM.`
                  : `Proposed clearing release tag from ${actions.length} item(s). Submitted to KPM.`,
                actionCount: actions.length,
              });
            }

            case 'reparent': {
              const placeholders = ids.map(() => '?').join(',');
              const rows = db
                .prepare(
                  `
                  SELECT
                    p.id,
                    p.external_parent_key,
                    p.parent_id,
                    parent.external_key AS parent_external_key
                  FROM plan_items p
                  LEFT JOIN plan_items parent ON parent.id = p.parent_id
                  WHERE p.id IN (${placeholders}) AND p.project_id = ?
                `
                )
                .all(...ids, projectId) as {
                  id: string;
                  external_parent_key: string | null;
                  parent_id: string | null;
                  parent_external_key: string | null;
                }[];

              if (rows.length === 0) {
                return toolError('No valid items found in project');
              }

              const newParentId = action.newParentId;
              const skipped: string[] = [];
              const toUpdate: { id: string; parentId: string | null }[] = [];

              if (newParentId === null) {
                for (const row of rows) {
                  if (row.external_parent_key && row.parent_external_key === row.external_parent_key) {
                    skipped.push(row.id);
                    continue;
                  }
                  toUpdate.push({ id: row.id, parentId: null });
                }
              } else {
                for (const row of rows) {
                  if (row.id === newParentId) continue;
                  toUpdate.push({ id: row.id, parentId: newParentId });
                }
              }

              if (toUpdate.length === 0) {
                return jsonResult({
                  message: 'No items could be reparented (Jira subtasks cannot be moved from their parent)',
                  count: 0,
                  skippedJiraSubtasks: skipped.length,
                });
              }

              const actions: PlanAction[] = toUpdate.map((item) => ({
                type: 'reparent' as const,
                item_id: item.id,
                new_parent_id: item.parentId,
              }));
              toolLog(`[KPM Tools] bulk_modify_plan emitting ${actions.length} reparent actions for approval`);
              onPlanActions(actions);

              return jsonResult({
                success: true,
                message: `Proposed moving ${actions.length} item(s) to ${newParentId ? 'new parent' : 'root'}. Submitted to KPM.`,
                actionCount: actions.length,
                skippedJiraSubtasks: skipped.length > 0 ? skipped.length : undefined,
              });
            }

            case 'delete': {
              const allIds = new Set(ids);
              const getDescendants = db.prepare(`
                WITH RECURSIVE descendants(id) AS (
                  SELECT id FROM plan_items WHERE parent_id = ?
                  UNION ALL
                  SELECT p.id FROM plan_items p JOIN descendants d ON p.parent_id = d.id
                )
                SELECT id FROM descendants
              `);

              for (const id of ids) {
                const descendants = getDescendants.all(id) as { id: string }[];
                for (const d of descendants) {
                  allIds.add(d.id);
                }
              }

              const actions: PlanAction[] = ids.map((id) => ({
                type: 'delete_item' as const,
                item_id: id,
                cascade: true,
              }));
              toolLog(`[KPM Tools] bulk_modify_plan emitting ${actions.length} delete actions for approval (${allIds.size} total with descendants)`);
              onPlanActions(actions);

              return jsonResult({
                success: true,
                message: `Proposed deleting ${ids.length} item(s) (${allIds.size} total including descendants). Submitted to KPM.`,
                actionCount: actions.length,
                totalAffected: allIds.size,
              });
            }

            case 'clear_dependencies': {
              const direction = action.direction ?? 'all';
              const placeholders = ids.map(() => '?').join(',');
              let query: string;

              if (direction === 'incoming') {
                query = `SELECT id FROM plan_relations WHERE project_id = ? AND to_item_id IN (${placeholders})`;
              } else if (direction === 'outgoing') {
                query = `SELECT id FROM plan_relations WHERE project_id = ? AND from_item_id IN (${placeholders})`;
              } else {
                query = `SELECT id FROM plan_relations WHERE project_id = ? AND (from_item_id IN (${placeholders}) OR to_item_id IN (${placeholders}))`;
              }

              const params = direction === 'all' ? [projectId, ...ids, ...ids] : [projectId, ...ids];
              const relations = db.prepare(query).all(...params) as { id: string }[];

              if (relations.length === 0) {
                return jsonResult({ message: 'No dependencies found to remove', count: 0 });
              }

              const actions: PlanAction[] = relations.map((rel) => ({
                type: 'remove_dependency' as const,
                relation_id: rel.id,
              }));
              toolLog(`[KPM Tools] bulk_modify_plan emitting ${actions.length} remove_dependency actions for approval`);
              onPlanActions(actions);

              return jsonResult({
                success: true,
                message: `Proposed removing ${actions.length} dependency relation(s). Submitted to KPM.`,
                actionCount: actions.length,
              });
            }
          }
        } catch (error) {
          console.error('[KPM Tools] bulk_modify_plan error:', error);
          return toolError(`Failed to bulk modify plan items: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
      { annotations: { destructiveHint: true } }
    ),
  ];
}
