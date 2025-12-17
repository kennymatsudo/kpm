/**
 * Sync Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and ON CONFLICT upsert.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { SyncSnapshot } from '../../../../shared/types';
import type { ISyncRepository } from '../../interfaces';

interface DbSyncSnapshot {
  id: string;
  plan_item_id: string;
  snapshot_title: string | null;
  snapshot_description: string | null;
  snapshot_label: string | null;
  snapshot_release_tag: string | null;
  external_updated_at: string | null;
  snapshot_at: string;
}

function mapSnapshot(row: DbSyncSnapshot): SyncSnapshot {
  return {
    id: row.id,
    plan_item_id: row.plan_item_id,
    snapshot_title: row.snapshot_title,
    snapshot_description: row.snapshot_description,
    snapshot_label: row.snapshot_label,
    snapshot_release_tag: row.snapshot_release_tag,
    external_updated_at: row.external_updated_at,
    snapshot_at: row.snapshot_at,
  };
}

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getSnapshot: Statement;
  upsert: Statement;
}

export class SyncRepository implements ISyncRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      getSnapshot: db.prepare('SELECT * FROM sync_snapshots WHERE plan_item_id = ?'),
      // Use ON CONFLICT for upsert - single query instead of check + insert/update
      upsert: db.prepare(`
        INSERT INTO sync_snapshots (id, plan_item_id, snapshot_title, snapshot_description, snapshot_label, snapshot_release_tag, external_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(plan_item_id) DO UPDATE SET
          snapshot_title = excluded.snapshot_title,
          snapshot_description = excluded.snapshot_description,
          snapshot_label = excluded.snapshot_label,
          snapshot_release_tag = excluded.snapshot_release_tag,
          external_updated_at = excluded.external_updated_at,
          snapshot_at = CURRENT_TIMESTAMP
      `),
    };
  }

  getSnapshot(planItemId: string): SyncSnapshot | undefined {
    const row = this.stmts.getSnapshot.get(planItemId) as DbSyncSnapshot | undefined;
    return row ? mapSnapshot(row) : undefined;
  }

  getSnapshotsByItemIds(planItemIds: string[]): Map<string, SyncSnapshot> {
    const result = new Map<string, SyncSnapshot>();
    if (planItemIds.length === 0) return result;

    // Dynamic query unavoidable due to variable-length IN clause
    const placeholders = planItemIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM sync_snapshots WHERE plan_item_id IN (${placeholders})`);
    const rows = stmt.all(...planItemIds) as DbSyncSnapshot[];

    for (const row of rows) {
      result.set(row.plan_item_id, mapSnapshot(row));
    }
    return result;
  }

  upsertSnapshot(snapshot: Omit<SyncSnapshot, 'id' | 'snapshot_at'>): void {
    // Use ON CONFLICT for upsert - single query instead of check + insert/update
    this.stmts.upsert.run(
      snapshot.plan_item_id,
      snapshot.snapshot_title,
      snapshot.snapshot_description,
      snapshot.snapshot_label,
      snapshot.snapshot_release_tag,
      snapshot.external_updated_at
    );
  }

  bulkUpsertSnapshots(snapshots: Omit<SyncSnapshot, 'id' | 'snapshot_at'>[]): void {
    const transaction = this.db.transaction(() => {
      for (const snapshot of snapshots) {
        // Reuse the cached upsert statement
        this.stmts.upsert.run(
          snapshot.plan_item_id,
          snapshot.snapshot_title,
          snapshot.snapshot_description,
          snapshot.snapshot_label,
          snapshot.snapshot_release_tag,
          snapshot.external_updated_at
        );
      }
    });
    transaction();
  }

  bulkDeleteSnapshots(planItemIds: string[]): void {
    if (planItemIds.length === 0) return;

    // Dynamic query unavoidable due to variable-length IN clause
    const placeholders = planItemIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM sync_snapshots WHERE plan_item_id IN (${placeholders})`);
    stmt.run(...planItemIds);
  }
}
