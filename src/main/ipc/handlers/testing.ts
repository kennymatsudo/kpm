import { getDatabase } from '../../db/connection';

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
    // Double-check we're in test mode - defense in depth
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Testing] BLOCKED: Attempted to reset database outside test mode');
      return { success: false, error: 'Database reset only allowed in test mode' };
    }

    const db = getDatabase();

    try {
      // Disable foreign keys to avoid cascade issues during truncation
      db.pragma('foreign_keys = OFF');

        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='table'
        )
        .all() as { name: string }[];

      // Truncate each table
      for (const { name } of tables) {
        db.exec(`DELETE FROM "${name}"`);
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
}
