/**
 * Plan Item Repository Implementation - Dependency Injection Version
 */

import type { PlanItem, PlanItemUpdates, PlanItemSyncUpdates } from '../../../../shared/types';
import type { IPlanItemRepository } from '../../interfaces';

/**
 */
  if (!json) return null;
  try {
  } catch {
    return null;
  }
}

/**
 * Transform raw database row to PlanItem with proper typing
 */
function rowToPlanItem(row: Record<string, unknown>): PlanItem {
  return {
    ...row,
    status: (row.status as 'backlog' | 'planned') || 'planned',
  } as PlanItem;
}

export class PlanItemRepository implements IPlanItemRepository {

  /**
   * Collect all descendant IDs for a given parent using recursive CTE.
   * Single query instead of O(depth) queries for hierarchical traversal.
   */
  private collectDescendantIds(parentId: string): string[] {
    return rows.map(r => r.id);
  }

  getByProject(projectId: string): PlanItem[] {
    return rows.map(rowToPlanItem);
  }

  get(id: string): PlanItem | undefined {
    if (!row) return undefined;
    return rowToPlanItem(row);
  }

  add(item: Omit<PlanItem, 'created_at' | 'updated_at'>): PlanItem {
      item.id,
      item.project_id,
      item.parent_id,
      item.title,
      item.description,
      item.label,
      item.item_order,
      item.code_refs ? JSON.stringify(item.code_refs) : null,
      item.status || 'planned',
      item.status_category ?? null,
      item.release_tag,
      item.position_x,
      item.position_y,
      item.association_id ?? null,
      item.external_key ?? null,
      item.external_id ?? null,
      item.external_type ?? null,
      item.external_issue_type ?? null,
      item.external_status ?? null,
      item.external_url ?? null,
      item.external_parent_key ?? null,
      item.external_epic_key ?? null,
      item.sync_source ?? 'local',
  }

  update(id: string, updates: PlanItemUpdates | PlanItemSyncUpdates): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    // Base PlanItemUpdates fields
    if (updates.parent_id !== undefined) {
      fields.push('parent_id = ?');
      values.push(updates.parent_id);
    }
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.label !== undefined) {
      fields.push('label = ?');
      values.push(updates.label);
    }
    if (updates.item_order !== undefined) {
      fields.push('item_order = ?');
      values.push(updates.item_order);
    }
    if (updates.code_refs !== undefined) {
      fields.push('code_refs = ?');
      values.push(updates.code_refs ? JSON.stringify(updates.code_refs) : null);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.status_category !== undefined) {
      fields.push('status_category = ?');
      values.push(updates.status_category);

      if (updates.status_category === 'done') {
      } else if (updates.status_category !== null) {
        // Clear completed_at if moving away from done state
        fields.push('completed_at = NULL');
      }
    }
    if (updates.release_tag !== undefined) {
      fields.push('release_tag = ?');
      values.push(updates.release_tag);
    }
    if (updates.position_x !== undefined) {
      fields.push('position_x = ?');
      values.push(updates.position_x);
    }
    if (updates.position_y !== undefined) {
      fields.push('position_y = ?');
      values.push(updates.position_y);
    }

    // Extended PlanItemSyncUpdates fields (for sync operations)
    const syncUpdates = updates as PlanItemSyncUpdates;
    if (syncUpdates.external_key !== undefined) {
      fields.push('external_key = ?');
      values.push(syncUpdates.external_key);
    }
    if (syncUpdates.external_id !== undefined) {
      fields.push('external_id = ?');
      values.push(syncUpdates.external_id);
    }
    if (syncUpdates.external_type !== undefined) {
      fields.push('external_type = ?');
      values.push(syncUpdates.external_type);
    }
    if (syncUpdates.external_status !== undefined) {
      fields.push('external_status = ?');
      values.push(syncUpdates.external_status);
    }
    if (syncUpdates.external_url !== undefined) {
      fields.push('external_url = ?');
      values.push(syncUpdates.external_url);
    }
    if (syncUpdates.association_id !== undefined) {
      fields.push('association_id = ?');
      values.push(syncUpdates.association_id);
    }
    if (syncUpdates.sync_source !== undefined) {
      fields.push('sync_source = ?');
      values.push(syncUpdates.sync_source);
    }
    if (syncUpdates.last_synced_at !== undefined) {
      fields.push('last_synced_at = ?');
      values.push(syncUpdates.last_synced_at);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE plan_items SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  delete(id: string): void {
    const transaction = this.db.transaction(() => {
      const descendantIds = this.collectDescendantIds(id);

      if (descendantIds.length > 0) {
        const placeholders = descendantIds.map(() => '?').join(',');
        const updateDescendants = this.db.prepare(
        );
        updateDescendants.run(...descendantIds);
      }

      // Delete the item
    });
    transaction();
  }

  deleteWithDescendants(id: string): void {
    const transaction = this.db.transaction(() => {
      const descendantIds = this.collectDescendantIds(id);
      const allIds = [id, ...descendantIds];

      // Delete all items (parent + all descendants)
      const placeholders = allIds.map(() => '?').join(',');
      const deleteStmt = this.db.prepare(`DELETE FROM plan_items WHERE id IN (${placeholders})`);
      deleteStmt.run(...allIds);
    });
    transaction();
  }

  getChildCount(itemId: string): number {
    return result.count;
  }

  updatePosition(itemId: string, x: number, y: number): void {
  }

  getNextOrder(projectId: string, parentId: string | null): number {
    const result = parentId
    return (result?.max_order ?? -1) + 1;
  }

  /**
   * Get children of a specific parent, optionally filtered by external issue types.
   */
  getChildrenByParent(
    projectId: string,
    parentId: string,
    externalIssueTypes?: string[]
  ): PlanItem[] {
    if (externalIssueTypes && externalIssueTypes.length > 0) {
      const placeholders = externalIssueTypes.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        SELECT * FROM plan_items
        WHERE project_id = ? AND parent_id = ? AND external_issue_type IN (${placeholders})
        ORDER BY item_order
      `);
      const rows = stmt.all(projectId, parentId, ...externalIssueTypes) as Record<string, unknown>[];
      return rows.map(rowToPlanItem);
    }

    return rows.map(rowToPlanItem);
  }

  /**
   * Get siblings of an item (same parent), returning only id and item_order.
   */
  getSiblings(
    projectId: string,
    parentId: string | null,
    excludeId?: string
  ): { id: string; item_order: number }[] {
    if (parentId && excludeId) {
    } else if (parentId) {
    } else if (excludeId) {
    }
  }
}
