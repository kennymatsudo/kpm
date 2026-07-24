/**
 * External Plan Item Repository Implementation - Dependency Injection Version
 * Optimized with prepared statement caching and batch operations.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { PlanItem } from '../../../../shared/types';
import { isSubtaskIssueType } from '../../../../shared/types';
import type { IExternalPlanItemRepository, IPlanItemRepository } from '../../interfaces';

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

interface PreparedStatements {
  getLinkedItems: Statement;
  createFromExternal: Statement;
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
      createFromExternal: db.prepare(`
        INSERT INTO plan_items (
          id, project_id, parent_id, title, description, label, item_order,
          status, status_category, external_key, external_id, external_type, external_issue_type, external_status,
          external_url, external_parent_key, external_epic_key,
          external_assignee_id, external_assignee_name, external_assignee_avatar_url,
          external_creator_id, external_creator_name, external_creator_avatar_url,
          sync_source, last_synced_at, association_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        RETURNING *
      `),
      unlinkFromExternal: db.prepare(`
        UPDATE plan_items SET
          external_key = NULL,
          external_id = NULL,
          external_type = NULL,
          external_issue_type = NULL,
          external_status = NULL,
          external_url = NULL,
          external_parent_key = NULL,
          external_epic_key = NULL,
          external_assignee_id = NULL,
          external_assignee_name = NULL,
          external_assignee_avatar_url = NULL,
          external_creator_id = NULL,
          external_creator_name = NULL,
          external_creator_avatar_url = NULL,
          sync_source = 'local',
          last_synced_at = NULL,
          association_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updateParentWithStatus: db.prepare(`
        UPDATE plan_items SET parent_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
    };
  }

  getLinkedItems(projectId: string, externalType: string): PlanItem[] {
    const rows = this.stmts.getLinkedItems.all(projectId, externalType) as Record<string, unknown>[];
    return rows.map(rowToPlanItem);
  }

  createFromExternal(input: {
    project_id: string;
    association_id: string;
    title: string;
    description: string | null;
    label: string | null;
    external_key: string;
    external_id?: string;
    external_type: string;
    external_issue_type: string;
    external_status: string;
    status_category: string;
    external_url?: string;
    external_parent_key: string | null;
    external_epic_key: string | null;
    external_assignee_id?: string | null;
    external_assignee_name?: string | null;
    external_assignee_avatar_url?: string | null;
    external_creator_id?: string | null;
    external_creator_name?: string | null;
    external_creator_avatar_url?: string | null;
  }): PlanItem {
    const id = randomUUID();
    const itemOrder = this.planItemRepository.getNextOrder(input.project_id, null);

    // Use RETURNING to get the inserted row in one query
    const row = this.stmts.createFromExternal.get(
      id,
      input.project_id,
      null, // parent_id
      input.title,
      input.description,
      input.label,
      itemOrder,
      'planned', // Synced items go directly to canvas (backlog UI removed)
      input.status_category,
      input.external_key,
      input.external_id ?? null,
      input.external_type,
      input.external_issue_type,
      input.external_status,
      input.external_url ?? null,
      input.external_parent_key,
      input.external_epic_key,
      input.external_assignee_id ?? null,
      input.external_assignee_name ?? null,
      input.external_assignee_avatar_url ?? null,
      input.external_creator_id ?? null,
      input.external_creator_name ?? null,
      input.external_creator_avatar_url ?? null,
      input.external_type, // sync_source
      input.association_id
    ) as Record<string, unknown>;

    return rowToPlanItem(row);
  }

  unlinkFromExternal(id: string): void {
    this.stmts.unlinkFromExternal.run(id);
  }

  importExternalIssues(items: {
    project_id: string;
    external_key: string;
    external_id: string;
    external_type: string;
    external_status: string;
    status_category: string;
    external_url: string;
    external_parent_key: string | null;
    external_epic_key: string | null;
    external_issue_type: string;
    external_assignee_id?: string | null;
    external_assignee_name?: string | null;
    external_assignee_avatar_url?: string | null;
    external_creator_id?: string | null;
    external_creator_name?: string | null;
    external_creator_avatar_url?: string | null;
    title: string;
    description: string | null;
    label: string | null;
    association_id: string;
  }[]): PlanItem[] {
    if (items.length === 0) return [];

    const createdIds: string[] = [];

    const insertStmt = this.db.prepare(`
      INSERT INTO plan_items (
        id, project_id, parent_id, title, description, label, item_order,
        status, status_category, external_key, external_id, external_type, external_issue_type, external_status,
        external_url, external_parent_key, external_epic_key,
        external_assignee_id, external_assignee_name, external_assignee_avatar_url,
        external_creator_id, external_creator_name, external_creator_avatar_url,
        sync_source, last_synced_at, association_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `);

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
          insertStmt.run(
            id,
            item.project_id,
            null, // parent_id - items are imported flat to backlog
            item.title,
            item.description,
            item.label,
            itemOrder++,
            'planned', // Synced items go directly to canvas (backlog UI removed)
            item.status_category,
            item.external_key,
            item.external_id ?? null,
            item.external_type,
            item.external_issue_type,
            item.external_status,
            item.external_url ?? null,
            item.external_parent_key,
            item.external_epic_key,
            item.external_assignee_id ?? null,
            item.external_assignee_name ?? null,
            item.external_assignee_avatar_url ?? null,
            item.external_creator_id ?? null,
            item.external_creator_name ?? null,
            item.external_creator_avatar_url ?? null,
            item.external_type, // sync_source = tracker type
            item.association_id
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
