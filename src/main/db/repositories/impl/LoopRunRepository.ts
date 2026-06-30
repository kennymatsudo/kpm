/**
 * Loop Run Repository Implementation
 *
 * Append-only history of scheduled-loop executions, retained for triage and
 * debugging. Pruned to a bounded window per loop.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { LoopRun, LoopRunOutcome } from '../../../../shared/types';
import type { ILoopRunRepository, LoopRunCreate } from '../../interfaces';

interface PreparedStatements {
  insert: Statement;
  listByLoop: Statement;
  pruneOld: Statement;
}

export class LoopRunRepository implements ILoopRunRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      insert: db.prepare(`
        RETURNING *
      `),
      listByLoop: db.prepare(
        'SELECT * FROM loop_runs WHERE loop_id = ? ORDER BY started_at DESC LIMIT ?'
      ),
      pruneOld: db.prepare(`
        DELETE FROM loop_runs
        WHERE loop_id = ?
          AND id NOT IN (
            SELECT id FROM loop_runs WHERE loop_id = ? ORDER BY started_at DESC LIMIT ?
          )
      `),
    };
  }

  private rowToRun(row: Record<string, unknown>): LoopRun {
    return {
      id: row.id as string,
      loop_id: row.loop_id as string,
      outcome: row.outcome as LoopRunOutcome,
      summary: (row.summary as string | null) ?? null,
      error: (row.error as string | null) ?? null,
      artifact_path: (row.artifact_path as string | null) ?? null,
      started_at: row.started_at as string,
      finished_at: (row.finished_at as string | null) ?? null,
    };
  }

  create(run: LoopRunCreate): LoopRun {
    const id = randomUUID();
    const startedAt = run.started_at ?? new Date().toISOString();
    const row = this.stmts.insert.get(
      id,
      run.loop_id,
      run.outcome,
      run.summary ?? null,
      run.error ?? null,
      run.artifact_path ?? null,
      startedAt,
      run.finished_at ?? null
    ) as Record<string, unknown>;
    return this.rowToRun(row);
  }

  listByLoop(loopId: string, limit = 20): LoopRun[] {
    const rows = this.stmts.listByLoop.all(loopId, limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRun(r));
  }

  pruneOld(loopId: string, keep: number): void {
    this.stmts.pruneOld.run(loopId, loopId, keep);
  }
}
