/**
 * App Settings Repository Implementation - Dependency Injection Version
 *
 * Stores global app-wide settings as key-value pairs.
 *
 * Optimized with prepared statement caching.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { IAppSettingsRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  get: Statement;
  set: Statement;
  delete: Statement;
  getAll: Statement;
}

export class AppSettingsRepository implements IAppSettingsRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      get: db.prepare('SELECT value FROM app_settings WHERE key = ?'),
      // Use ON CONFLICT for upsert
      set: db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `),
      delete: db.prepare('DELETE FROM app_settings WHERE key = ?'),
      getAll: db.prepare('SELECT key, value FROM app_settings'),
    };
  }

  get(key: string): string | undefined {
    const row = this.stmts.get.get(key) as { value: string } | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.stmts.set.run(key, value);
  }

  delete(key: string): void {
    this.stmts.delete.run(key);
  }

  getAll(): Record<string, string> {
    const rows = this.stmts.getAll.all() as { key: string; value: string }[];
    return rows.reduce(
      (acc, row) => {
        acc[row.key] = row.value;
        return acc;
      },
      {} as Record<string, string>
    );
  }
}
