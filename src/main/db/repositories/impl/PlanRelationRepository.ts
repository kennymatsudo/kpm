/**
 * Plan Relation Repository Implementation - Dependency Injection Version
 * Optimized with prepared statement caching.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { PlanRelation } from '../../../../shared/types';
import type { IPlanRelationRepository } from '../../interfaces';

interface PreparedStatements {
  getByProject: Statement;
  insert: Statement;
  deleteById: Statement;
  deleteByItem: Statement;
}

export class PlanRelationRepository implements IPlanRelationRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      getByProject: db.prepare('SELECT * FROM plan_relations WHERE project_id = ? ORDER BY created_at'),
      insert: db.prepare(`
        INSERT INTO plan_relations (id, project_id, from_item_id, to_item_id, relation_type)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `),
      deleteById: db.prepare('DELETE FROM plan_relations WHERE id = ?'),
      deleteByItem: db.prepare('DELETE FROM plan_relations WHERE from_item_id = ? OR to_item_id = ?'),
    };
  }

  getByProject(projectId: string): PlanRelation[] {
    return this.stmts.getByProject.all(projectId) as PlanRelation[];
  }

  getByItemIds(itemIds: string[]): PlanRelation[] {
    if (itemIds.length === 0) return [];
    // Dynamic query unavoidable due to variable-length IN clause
    const placeholders = itemIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM plan_relations
      WHERE from_item_id IN (${placeholders}) OR to_item_id IN (${placeholders})
      ORDER BY created_at
    `);
    return stmt.all(...itemIds, ...itemIds) as PlanRelation[];
  }

  add(relation: Omit<PlanRelation, 'created_at'>): PlanRelation {
    const id = relation.id || randomUUID();
    // Use RETURNING to get the inserted row in one query
    return this.stmts.insert.get(
      id,
      relation.project_id,
      relation.from_item_id,
      relation.to_item_id,
      relation.relation_type
    ) as PlanRelation;
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }

  remove(id: string): void {
    this.delete(id);
  }

  deleteByItem(itemId: string): void {
    this.stmts.deleteByItem.run(itemId, itemId);
  }
}
