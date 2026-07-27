/**
 * Action Run Repository Implementation
 *
 * Append-only history of action executions, retained for triage and debugging.
 * Pruned to a bounded window per action.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ActionRun, ActionRunOutcome } from '../../../../shared/actions';
import type { ActionRunCreate, IActionRunRepository } from '../../interfaces';

interface PreparedStatements {
  insert: Statement;
  listByAction: Statement;
  pruneOld: Statement;
}

export class ActionRunRepository implements IActionRunRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO action_runs (id, action_id, outcome, summary, detail, error, artifact_path, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      listByAction: db.prepare(
        'SELECT * FROM action_runs WHERE action_id = ? ORDER BY started_at DESC LIMIT ?'
      ),
      pruneOld: db.prepare(`
        DELETE FROM action_runs
        WHERE action_id = ?
          AND id NOT IN (
            SELECT id FROM action_runs WHERE action_id = ? ORDER BY started_at DESC LIMIT ?
          )
      `),
    };
  }

  private rowToRun(row: Record<string, unknown>): ActionRun {
    return {
      id: row.id as string,
      actionId: row.action_id as string,
      outcome: row.outcome as ActionRunOutcome,
      summary: (row.summary as string | null) ?? null,
      detail: (row.detail as string | null) ?? null,
      error: (row.error as string | null) ?? null,
      artifactPath: (row.artifact_path as string | null) ?? null,
      startedAt: row.started_at as string,
      finishedAt: (row.finished_at as string | null) ?? null,
    };
  }

  create(run: ActionRunCreate): ActionRun {
    const id = randomUUID();
    const startedAt = run.startedAt ?? new Date().toISOString();
    const row = this.stmts.insert.get(
      id,
      run.actionId,
      run.outcome,
      run.summary ?? null,
      run.detail ?? null,
      run.error ?? null,
      run.artifactPath ?? null,
      startedAt,
      run.finishedAt ?? null
    ) as Record<string, unknown>;
    return this.rowToRun(row);
  }

  listByAction(actionId: string, limit = 20): ActionRun[] {
    const rows = this.stmts.listByAction.all(actionId, limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToRun(row));
  }

  pruneOld(actionId: string, keep: number): void {
    this.stmts.pruneOld.run(actionId, actionId, keep);
  }
}
