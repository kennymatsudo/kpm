/**
 * Group Repository Implementation
 *
 * Manages visual group containers (Figma-style frames) for organizing plan items.
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Group } from '../../../../shared/types';
import type { IGroupRepository, GroupUpdates } from '../../interfaces';

/**
 * SQLite returns booleans as 0/1. Convert to proper boolean.
 */
function rowToGroup(row: Record<string, unknown>): Group {
  return {
    ...row,
    is_collapsed: Boolean(row.is_collapsed),
  } as Group;
}

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Read operations
  getByProjectId: Statement;
  getById: Statement;

  // Write operations
  insert: Statement;
  delete: Statement;
  updatePosition: Statement;
  updateSize: Statement;
}

export class GroupRepository implements IGroupRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      // Read operations
      getByProjectId: db.prepare('SELECT * FROM groups WHERE project_id = ? ORDER BY created_at'),
      getById: db.prepare('SELECT * FROM groups WHERE id = ?'),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO groups (id, project_id, name, color, position_x, position_y, width, height, is_collapsed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM groups WHERE id = ?'),
      updatePosition: db.prepare(`
        UPDATE groups SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateSize: db.prepare(`
        UPDATE groups SET width = ?, height = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
    };
  }

  getByProjectId(projectId: string): Group[] {
    const rows = this.stmts.getByProjectId.all(projectId) as Record<string, unknown>[];
    return rows.map(rowToGroup);
  }

  getById(id: string): Group | undefined {
    const row = this.stmts.getById.get(id) as Record<string, unknown> | undefined;
    return row ? rowToGroup(row) : undefined;
  }

  create(group: Omit<Group, 'id' | 'created_at' | 'updated_at'>, id?: string): Group {
    const groupId = id ?? randomUUID();
    const row = this.stmts.insert.get(
      groupId,
      group.project_id,
      group.name,
      group.color,
      group.position_x,
      group.position_y,
      group.width,
      group.height,
      group.is_collapsed ? 1 : 0
    ) as Record<string, unknown>;
    return rowToGroup(row);
  }

  update(id: string, updates: GroupUpdates): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.position_x !== undefined) {
      fields.push('position_x = ?');
      values.push(updates.position_x);
    }
    if (updates.position_y !== undefined) {
      fields.push('position_y = ?');
      values.push(updates.position_y);
    }
    if (updates.width !== undefined) {
      fields.push('width = ?');
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      fields.push('height = ?');
      values.push(updates.height);
    }
    if (updates.is_collapsed !== undefined) {
      fields.push('is_collapsed = ?');
      values.push(updates.is_collapsed ? 1 : 0);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  updatePosition(id: string, x: number, y: number): void {
    this.stmts.updatePosition.run(x, y, id);
  }

  updateSize(id: string, width: number, height: number): void {
    this.stmts.updateSize.run(width, height, id);
  }
}
