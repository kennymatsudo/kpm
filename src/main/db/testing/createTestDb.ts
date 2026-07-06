import BetterSqlite3, { type Database } from 'better-sqlite3';
import { runMigrations } from '../migrations';

export function createTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  runMigrations(db);
  return db;
}

export function sqliteHasFts5(): boolean {
  const db = new BetterSqlite3(':memory:');
  try {
    const row = db.prepare(
      "SELECT sqlite_compileoption_used('ENABLE_FTS5') as enabled"
    ).get() as { enabled: number };
    return row.enabled === 1;
  } catch {
    return false;
  } finally {
    db.close();
  }
}
