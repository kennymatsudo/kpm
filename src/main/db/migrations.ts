import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

/**
 *
 * Each migration is a function that receives the database instance and applies
 * schema changes. Migrations are run in order and tracked in the schema_migrations table.
 *
 * IMPORTANT: Once a migration is deployed, it should NEVER be modified.
 * Create a new migration instead.
 */

interface Migration {
  id: number;
  name: string;
  up: (db: BetterSqliteDatabase) => void;
}

/**
 * All migrations in order. Add new migrations to the end of this array.
 * Migrations run automatically on app start.
 */

/**
 * Check if a migration has been applied.
 */
function isMigrationApplied(db: BetterSqliteDatabase, name: string): boolean {
  const row = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name);
  return !!row;
}

/**
 * Record a migration as applied.
 */
function recordMigration(db: BetterSqliteDatabase, id: number, name: string): void {
  db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(id, name);
}

/**
 * Run all pending migrations.
 * Call this after setupSchema() to apply any new migrations.
 */
export function runMigrations(db: BetterSqliteDatabase): void {
  console.log('[Migrations] Checking for pending migrations...');



    console.log(`[Migrations] Applying migration: ${migration.name}`);

    // Run migration in a transaction for safety
    const transaction = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration.id, migration.name);
    });

    transaction();
  }

}
