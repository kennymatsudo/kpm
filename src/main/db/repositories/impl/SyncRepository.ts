/**
 * Sync Repository Implementation - Dependency Injection Version
 */

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

export class SyncRepository implements ISyncRepository {

  getSnapshot(planItemId: string): SyncSnapshot | undefined {
    return row ? mapSnapshot(row) : undefined;
  }

  getSnapshotsByItemIds(planItemIds: string[]): Map<string, SyncSnapshot> {
    const result = new Map<string, SyncSnapshot>();
    if (planItemIds.length === 0) return result;

    const placeholders = planItemIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM sync_snapshots WHERE plan_item_id IN (${placeholders})`);
    const rows = stmt.all(...planItemIds) as DbSyncSnapshot[];

    for (const row of rows) {
      result.set(row.plan_item_id, mapSnapshot(row));
    }
    return result;
  }

  upsertSnapshot(snapshot: Omit<SyncSnapshot, 'id' | 'snapshot_at'>): void {
  }

  bulkUpsertSnapshots(snapshots: Omit<SyncSnapshot, 'id' | 'snapshot_at'>[]): void {
    const transaction = this.db.transaction(() => {
      for (const snapshot of snapshots) {
      }
    });
    transaction();
  }

  bulkDeleteSnapshots(planItemIds: string[]): void {
    if (planItemIds.length === 0) return;

    const placeholders = planItemIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM sync_snapshots WHERE plan_item_id IN (${placeholders})`);
    stmt.run(...planItemIds);
  }
}
