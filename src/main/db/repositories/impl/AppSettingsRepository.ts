 *
 * Optimized with prepared statement caching.
import type { Database, Statement } from 'better-sqlite3';
/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  get: Statement;
  set: Statement;
  getAll: Statement;
}

  private stmts: PreparedStatements;

    this.stmts = {
      get: db.prepare('SELECT value FROM app_settings WHERE key = ?'),
      // Use ON CONFLICT for upsert
      set: db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `),
      getAll: db.prepare('SELECT key, value FROM app_settings'),
    };
  }
    const row = this.stmts.get.get(key) as { value: string } | undefined;
    this.stmts.set.run(key, value);
    const rows = this.stmts.getAll.all() as { key: string; value: string }[];
