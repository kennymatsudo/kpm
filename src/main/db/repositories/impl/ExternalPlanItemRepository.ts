/**
 * External Plan Item Repository Implementation - Dependency Injection Version
 * Optimized with prepared statement caching and batch operations.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { PlanItem } from '../../../../shared/types';
import { isSubtaskIssueType } from '../../../../shared/types';
import type {
  ExternalIssueFields,
  IExternalPlanItemRepository,
  ImportedIssueFields,
  IPlanItemRepository,
} from '../../interfaces';

/**
 * Safely parse JSON code_refs. Returns null on parse failure.
 */
function parseCodeRefs(codeRefsJson: string | null): string[] | null {
  if (!codeRefsJson) return null;
  try {
    return JSON.parse(codeRefsJson);
  } catch {
    return null;
  }
}

function rowToPlanItem(row: Record<string, unknown>): PlanItem {
  return {
    ...row,
    code_refs: parseCodeRefs(row.code_refs as string | null),
    status: (row.status as 'backlog' | 'planned') || 'planned',
    work_brief_revision: (row.work_brief_revision as number | null) ?? 1,
    sync_source: (row.sync_source as string) || 'local',
  } as PlanItem;
}

/** One issue plus the two values the repository decides per row. */
type ExternalItemInsert = ExternalIssueFields & { id: string; item_order: number };

type ExternalItemColumn = { column: string; unlinksTo?: string } & (
  | { bind: (item: ExternalItemInsert) => unknown }
  /** Written by SQL rather than a bind, so the value never round-trips through JS. */
  | { insertSql: string }
);

/**
 * Every column an externally-sourced plan item is created with, in bind order,
 * and what `unlinkFromExternal` resets it to.
 *
 * Declared once because a single insert existed here twice with two
 * independently maintained positional bind lists, and a third hand-written
 * list undid a subset of it. Deliberately separate from `PLAN_ITEM_FIELDS`
 * (`shared/planItemFields.ts`): tracker-sync columns are a different ownership
 * domain and are meant to fail independently of the plan item's own fields.
 */
const EXTERNAL_ITEM_COLUMNS: readonly ExternalItemColumn[] = [
  { column: 'id', bind: (item) => item.id },
  { column: 'project_id', bind: (item) => item.project_id },
  // Imported flat; `linkSubtasksToParentIssues` rebuilds the hierarchy after.
  { column: 'parent_id', bind: () => null },
  { column: 'title', bind: (item) => item.title },
  { column: 'description', bind: (item) => item.description },
  { column: 'label', bind: (item) => item.label ?? null },
  { column: 'item_order', bind: (item) => item.item_order },
  // Synced items go straight to the canvas (the backlog UI was removed).
  { column: 'status', bind: () => 'planned' },
  { column: 'status_category', bind: (item) => item.status_category },
  { column: 'external_key', bind: (item) => item.external_key, unlinksTo: 'NULL' },
  { column: 'external_id', bind: (item) => item.external_id ?? null, unlinksTo: 'NULL' },
  { column: 'external_type', bind: (item) => item.external_type, unlinksTo: 'NULL' },
  { column: 'external_issue_type', bind: (item) => item.external_issue_type, unlinksTo: 'NULL' },
  { column: 'external_status', bind: (item) => item.external_status, unlinksTo: 'NULL' },
  { column: 'external_url', bind: (item) => item.external_url ?? null, unlinksTo: 'NULL' },
  { column: 'external_parent_key', bind: (item) => item.external_parent_key, unlinksTo: 'NULL' },
  { column: 'external_epic_key', bind: (item) => item.external_epic_key, unlinksTo: 'NULL' },
  { column: 'external_assignee_id', bind: (item) => item.external_assignee_id ?? null, unlinksTo: 'NULL' },
  { column: 'external_assignee_name', bind: (item) => item.external_assignee_name ?? null, unlinksTo: 'NULL' },
  { column: 'external_assignee_avatar_url', bind: (item) => item.external_assignee_avatar_url ?? null, unlinksTo: 'NULL' },
  { column: 'external_creator_id', bind: (item) => item.external_creator_id ?? null, unlinksTo: 'NULL' },
  { column: 'external_creator_name', bind: (item) => item.external_creator_name ?? null, unlinksTo: 'NULL' },
  { column: 'external_creator_avatar_url', bind: (item) => item.external_creator_avatar_url ?? null, unlinksTo: 'NULL' },
  { column: 'sync_source', bind: (item) => item.external_type, unlinksTo: `'local'` },
  { column: 'last_synced_at', insertSql: 'CURRENT_TIMESTAMP', unlinksTo: 'NULL' },
  { column: 'association_id', bind: (item) => item.association_id, unlinksTo: 'NULL' },
];

const INSERT_EXTERNAL_ITEM_SQL = `
  INSERT INTO plan_items (${EXTERNAL_ITEM_COLUMNS.map((c) => c.column).join(', ')})
  VALUES (${EXTERNAL_ITEM_COLUMNS.map((c) => ('insertSql' in c ? c.insertSql : '?')).join(', ')})
`;

const UNLINK_EXTERNAL_ITEM_SQL = `
  UPDATE plan_items SET ${[
    ...EXTERNAL_ITEM_COLUMNS.filter((c) => c.unlinksTo).map((c) => `${c.column} = ${c.unlinksTo}`),
    'updated_at = CURRENT_TIMESTAMP',
  ].join(', ')}
  WHERE id = ?
`;

function bindExternalItem(item: ExternalItemInsert): unknown[] {
  return EXTERNAL_ITEM_COLUMNS.flatMap((c) => ('bind' in c ? [c.bind(item)] : []));
}

interface PreparedStatements {
  getLinkedItems: Statement;
  createFromExternal: Statement;
  insertExternalItem: Statement;
  unlinkFromExternal: Statement;
  updateParentWithStatus: Statement;
}

export class ExternalPlanItemRepository implements IExternalPlanItemRepository {
  private stmts: PreparedStatements;

  constructor(
    private db: Database,
    private planItemRepository: IPlanItemRepository
  ) {
    this.stmts = {
      getLinkedItems: db.prepare(`
        SELECT * FROM plan_items
        WHERE project_id = ? AND external_type = ? AND external_key IS NOT NULL
        ORDER BY item_order
      `),
      createFromExternal: db.prepare(`${INSERT_EXTERNAL_ITEM_SQL} RETURNING *`),
      insertExternalItem: db.prepare(INSERT_EXTERNAL_ITEM_SQL),
      unlinkFromExternal: db.prepare(UNLINK_EXTERNAL_ITEM_SQL),
      updateParentWithStatus: db.prepare(`
        UPDATE plan_items SET parent_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
    };
  }

  getLinkedItems(projectId: string, externalType: string): PlanItem[] {
    const rows = this.stmts.getLinkedItems.all(projectId, externalType) as Record<string, unknown>[];
    return rows.map(rowToPlanItem);
  }

  createFromExternal(input: ExternalIssueFields): PlanItem {
    const row = this.stmts.createFromExternal.get(...bindExternalItem({
      ...input,
      id: randomUUID(),
      item_order: this.planItemRepository.getNextOrder(input.project_id, null),
    })) as Record<string, unknown>;

    return rowToPlanItem(row);
  }

  unlinkFromExternal(id: string): void {
    this.stmts.unlinkFromExternal.run(id);
  }

  importExternalIssues(items: ImportedIssueFields[]): PlanItem[] {
    if (items.length === 0) return [];

    const createdIds: string[] = [];

    const transaction = this.db.transaction(() => {
      // Group by project to calculate item_order correctly
      const byProject = new Map<string, typeof items>();
      for (const item of items) {
        const group = byProject.get(item.project_id) ?? [];
        group.push(item);
        byProject.set(item.project_id, group);
      }

      // Get all existing external keys per project to avoid duplicates
      const existingKeys = new Map<string, Set<string>>();
      for (const projectId of byProject.keys()) {
        const existing = this.getLinkedItems(projectId, items[0].external_type);
        const keySet = new Set(existing.map(item => item.external_key!));
        existingKeys.set(projectId, keySet);
      }

      for (const [projectId, projectItems] of byProject) {
        let itemOrder = this.planItemRepository.getNextOrder(projectId, null);
        const existingForProject = existingKeys.get(projectId) ?? new Set();

        for (const item of projectItems) {
          // Skip if already exists
          if (existingForProject.has(item.external_key)) {
            continue;
          }

          const id = randomUUID();
          this.stmts.insertExternalItem.run(
            ...bindExternalItem({ ...item, id, item_order: itemOrder++ })
          );
          createdIds.push(id);
          existingForProject.add(item.external_key); // Track newly created to avoid dupes within batch
        }
      }
    });

    transaction();

    // Return all created items. getMany batches into a single IN-clause query
    // instead of one SELECT per id (N+1 on large imports). SQLite's IN clause
    // doesn't guarantee row order, so re-order to match createdIds (insertion
    // order) to preserve the previous per-id-fetch contract.
    const byId = new Map(this.planItemRepository.getMany(createdIds).map(item => [item.id, item]));
    return createdIds.map(id => byId.get(id)!);
  }

  updateFromExternal(
    planItemId: string,
    updates: Partial<Pick<PlanItem, 'title' | 'description' | 'label' | 'release_tag' | 'external_status' | 'status_category' | 'external_assignee_id' | 'external_assignee_name' | 'external_assignee_avatar_url' | 'external_creator_id' | 'external_creator_name' | 'external_creator_avatar_url'>>
  ): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    const workBriefComparisons: string[] = [];
    const workBriefComparisonValues: unknown[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
      workBriefComparisons.push('title IS NOT ?');
      workBriefComparisonValues.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
      workBriefComparisons.push('description IS NOT ?');
      workBriefComparisonValues.push(updates.description);
    }
    if (updates.label !== undefined) {
      fields.push('label = ?');
      values.push(updates.label);
    }
    if (updates.release_tag !== undefined) {
      fields.push('release_tag = ?');
      values.push(updates.release_tag);
    }
    if (updates.external_status !== undefined) {
      fields.push('external_status = ?');
      values.push(updates.external_status);
    }
    if (updates.status_category !== undefined) {
      fields.push('status_category = ?');
      values.push(updates.status_category);
    }
    if (updates.external_assignee_id !== undefined) {
      fields.push('external_assignee_id = ?');
      values.push(updates.external_assignee_id);
    }
    if (updates.external_assignee_name !== undefined) {
      fields.push('external_assignee_name = ?');
      values.push(updates.external_assignee_name);
    }
    if (updates.external_assignee_avatar_url !== undefined) {
      fields.push('external_assignee_avatar_url = ?');
      values.push(updates.external_assignee_avatar_url);
    }
    if (updates.external_creator_id !== undefined) {
      fields.push('external_creator_id = ?');
      values.push(updates.external_creator_id);
    }
    if (updates.external_creator_name !== undefined) {
      fields.push('external_creator_name = ?');
      values.push(updates.external_creator_name);
    }
    if (updates.external_creator_avatar_url !== undefined) {
      fields.push('external_creator_avatar_url = ?');
      values.push(updates.external_creator_avatar_url);
    }

    if (fields.length === 0) return;

    if (workBriefComparisons.length > 0) {
      fields.push(`work_brief_revision = work_brief_revision + CASE WHEN (${workBriefComparisons.join(' OR ')}) THEN 1 ELSE 0 END`);
      values.push(...workBriefComparisonValues);
    }
    fields.push('last_synced_at = CURRENT_TIMESTAMP');
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(planItemId);

    const stmt = this.db.prepare(`
      UPDATE plan_items SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  linkSubtasksToParentIssues(projectId: string, externalType: string): void {
    const items = this.getLinkedItems(projectId, externalType);

    // Build maps for lookup
    const byExternalKey = new Map<string, string>();  // external_key -> id
    const itemById = new Map<string, PlanItem>();     // id -> item
    for (const item of items) {
      if (item.external_key) {
        byExternalKey.set(item.external_key, item.id);
      }
      itemById.set(item.id, item);
    }

    // Link sub-tasks to their parents using cached statement
    const transaction = this.db.transaction(() => {
      for (const item of items) {
        // Only link actual subtasks, not Stories under Epics
        if (item.external_parent_key && !item.parent_id && isSubtaskIssueType(item.external_issue_type)) {
          const parentId = byExternalKey.get(item.external_parent_key);
          if (parentId) {
            const parent = itemById.get(parentId);
            // Subtask inherits parent's status (if parent is planned, subtask should be too)
            const status = parent?.status ?? 'backlog';
            this.stmts.updateParentWithStatus.run(parentId, status, item.id);
          }
        }
      }
    });

    transaction();
  }
}
