/**
 * Scheduled Loop Repository Implementation
 *
 * CRUD for scheduled loops. Project-scoped. Mirrors the prepared-statement +
 * RETURNING conventions used across the repository layer.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ScheduledLoop, LoopOutputMode, LoopRunOutcome } from '../../../../shared/types';
import type {
  IScheduledLoopRepository,
  ScheduledLoopCreate,
  ScheduledLoopUpdate,
} from '../../interfaces';

interface PreparedStatements {
  listByProject: Statement;
  getById: Statement;
  getAllEnabled: Statement;
  insert: Statement;
  delete: Statement;
  recordRunOutcome: Statement;
}

const UPDATABLE_FIELDS = ['name', 'prompt', 'output_mode', 'interval_minutes', 'enabled'] as const;

export class ScheduledLoopRepository implements IScheduledLoopRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      listByProject: db.prepare(
        'SELECT * FROM scheduled_loops WHERE project_id = ? ORDER BY created_at DESC'
      ),
      getById: db.prepare('SELECT * FROM scheduled_loops WHERE id = ?'),
      getAllEnabled: db.prepare('SELECT * FROM scheduled_loops WHERE enabled = 1'),
      insert: db.prepare(`
        INSERT INTO scheduled_loops
          (id, project_id, name, prompt, output_mode, interval_minutes, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM scheduled_loops WHERE id = ?'),
      recordRunOutcome: db.prepare(`
        UPDATE scheduled_loops
        SET last_run_at = ?, last_outcome = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
    };
  }

  private rowToLoop(row: Record<string, unknown>): ScheduledLoop {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      name: row.name as string,
      prompt: row.prompt as string,
      output_mode: row.output_mode as LoopOutputMode,
      interval_minutes: row.interval_minutes as number,
      enabled: Boolean(row.enabled),
      last_run_at: (row.last_run_at as string | null) ?? null,
      last_outcome: (row.last_outcome as LoopRunOutcome | null) ?? null,
      last_error: (row.last_error as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  listByProject(projectId: string): ScheduledLoop[] {
    const rows = this.stmts.listByProject.all(projectId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToLoop(r));
  }

  get(id: string): ScheduledLoop | undefined {
    const row = this.stmts.getById.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToLoop(row) : undefined;
  }

  getAllEnabled(): ScheduledLoop[] {
    const rows = this.stmts.getAllEnabled.all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToLoop(r));
  }

  create(loop: ScheduledLoopCreate): ScheduledLoop {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row = this.stmts.insert.get(
      id,
      loop.project_id,
      loop.name,
      loop.prompt,
      loop.output_mode,
      loop.interval_minutes,
      loop.enabled === false ? 0 : 1,
      now,
      now
    ) as Record<string, unknown>;
    return this.rowToLoop(row);
  }

  update(id: string, updates: ScheduledLoopUpdate): ScheduledLoop | undefined {
    const fields = UPDATABLE_FIELDS.filter((f) => updates[f] !== undefined);
    if (fields.length === 0) return this.get(id);

    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values: unknown[] = fields.map((f) => {
      const value = updates[f];
      if (f === 'enabled') return value ? 1 : 0;
      return value;
    });

    // Dynamic update (uncommon path, ok to prepare each time).
    const stmt = this.db.prepare(`
      UPDATE scheduled_loops
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);
    const row = stmt.get(...values, id) as Record<string, unknown> | undefined;
    return row ? this.rowToLoop(row) : undefined;
  }

  delete(id: string): boolean {
    return this.stmts.delete.run(id).changes > 0;
  }

  recordRunOutcome(id: string, outcome: LoopRunOutcome, error: string | null, ranAt: string): void {
    this.stmts.recordRunOutcome.run(ranAt, outcome, error, id);
  }
}
