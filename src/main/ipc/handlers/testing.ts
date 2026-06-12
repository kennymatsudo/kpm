import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../../db/connection';
import { IPC_CHANNELS } from '../channels';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

/**
 * Sentinel file the e2e harness creates in its isolated data directory.
 * The reset handler refuses to touch a database that doesn't have this
 * marker sitting next to it.
 */
const E2E_SENTINEL = '.kpm-e2e';

/** Path of the database file this connection actually has open. */
function getOpenDbPath(db: BetterSqliteDatabase): string | null {
  const row = db.prepare('PRAGMA database_list').get() as { file?: string } | undefined;
  return row?.file || null;
}

/**
 * Register test-only IPC handlers.
 * These handlers are only registered when NODE_ENV=test.
 */
export function registerTestingHandlers(): void {
  // Only register in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

  console.log('[Testing] Registering test-only IPC handlers');

  /**
   * Reset database - truncates all tables while preserving schema.
   * Uses PRAGMA foreign_keys = OFF/ON to handle cascades properly.
   *
   * SAFETY: This handler is only registered when NODE_ENV=test,
   * and has an additional runtime check to prevent accidental data loss.
   */
  ipcMain.handle(IPC_CHANNELS.testing.resetDatabase, () => {
    // Double-check we're in test mode - defense in depth
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Testing] BLOCKED: Attempted to reset database outside test mode');
      return { success: false, error: 'Database reset only allowed in test mode' };
    }

    const db = getDatabase();

    // NODE_ENV alone proved insufficient once: a userData resolution bug
    // pointed a test-mode app at the real database and this handler wiped
    // it. Verify the target itself — never reset a database in the
    // production data directory, and only reset one the e2e harness has
    // explicitly marked as disposable with a sentinel file.
    const dbFile = getOpenDbPath(db);
    // Keep in sync with the userData pin in src/main/main.ts
    const productionDir = path.join(app.getPath('appData'), 'KPM - Planning Workbench');
    if (!dbFile || path.dirname(dbFile) === productionDir) {
      console.error('[Testing] BLOCKED: Refusing to reset the production database:', dbFile);
      return { success: false, error: 'Refusing to reset: connected to the production database' };
    }
    if (!fs.existsSync(path.join(path.dirname(dbFile), E2E_SENTINEL))) {
      console.error(`[Testing] BLOCKED: No ${E2E_SENTINEL} sentinel next to database:`, dbFile);
      return { success: false, error: `Refusing to reset: missing ${E2E_SENTINEL} sentinel next to the database` };
    }

    try {
      // Disable foreign keys to avoid cascade issues during truncation
      db.pragma('foreign_keys = OFF');

      // schema_migrations must survive the reset: truncating it makes the
      // next boot re-apply every migration against the current schema, which
      // crashes at the first non-idempotent ALTER and bricks the database.
      // Virtual tables (FTS5) and their shadow tables don't support
      // DELETE FROM; they're cleared separately below.
      const virtualTables = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='table'
           AND sql LIKE 'CREATE VIRTUAL%'`
        )
        .all() as { name: string }[];
      const shadowPrefixes = virtualTables.map(({ name }) => `${name}_`);

      const tables = (
        db
          .prepare(
            `SELECT name FROM sqlite_master
             WHERE type='table'
             AND name NOT LIKE 'sqlite_%'
             AND name != 'schema_migrations'`
          )
          .all() as { name: string }[]
      ).filter(
        ({ name }) =>
          !virtualTables.some((v) => v.name === name) &&
          !shadowPrefixes.some((prefix) => name.startsWith(prefix))
      );

      // Truncate each table
      for (const { name } of tables) {
        db.exec(`DELETE FROM "${name}"`);
      }

      // Clear FTS5 indexes with the special delete-all command (DELETE FROM
      // is not supported on contentless FTS5 tables)
      for (const { name } of virtualTables) {
        try {
          db.exec(`INSERT INTO "${name}"("${name}") VALUES('delete-all')`);
        } catch {
          // Not an FTS5 table — nothing to clear
        }
      }

      // Reset auto-increment counters (sqlite_sequence may not exist on fresh DB)
      try {
        db.exec(`DELETE FROM sqlite_sequence`);
      } catch {
        // sqlite_sequence doesn't exist yet - that's fine for fresh databases
      }

      // Re-enable foreign keys
      db.pragma('foreign_keys = ON');

      console.log(`[Testing] Database reset: truncated ${tables.length} tables`);

      return { success: true, tablesReset: tables.length };
    } catch (error) {
      // Ensure foreign keys are re-enabled even on error
      db.pragma('foreign_keys = ON');

      const message = error instanceof Error ? error.message : String(error);
      console.error('[Testing] Database reset failed:', message);
      return { success: false, error: message };
    }
  });

  /**
   * Report which database file the app actually opened. The e2e harness
   * asserts this is its isolated temp directory before running any test.
   */
  ipcMain.handle(IPC_CHANNELS.testing.getDbPath, () => {
    return { dbPath: getOpenDbPath(getDatabase()) };
  });
}
