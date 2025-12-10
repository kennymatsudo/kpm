/**
 * In-memory database mock for testing repositories and services
 *
 * Uses better-sqlite3 with :memory: database for fast, isolated tests.
 * Each test can get a fresh database instance.
 */

import BetterSqlite from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

// =============================================================================
// Test Database Factory
// =============================================================================

/**
 * Create a fresh in-memory database for testing
 */
export function createTestDatabase(): DatabaseType {
  const db = new BetterSqlite(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Database context manager for tests
 * Automatically closes database after test completes
 */
export class TestDatabaseContext {
  private db: DatabaseType;

  constructor() {
    this.db = createTestDatabase();
  }

  get database(): DatabaseType {
    return this.db;
  }

  /**
   * Execute SQL and return results
   */
  query<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    return params ? (stmt.all(...params) as T[]) : (stmt.all() as T[]);
  }

  /**
   * Execute SQL without returning results
   */
  exec(sql: string, params?: unknown[]): void {
    const stmt = this.db.prepare(sql);
    if (params) {
      stmt.run(...params);
    } else {
      stmt.run();
    }
  }

  /**
   * Run operations in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// =============================================================================
// Seed Data Helpers
// =============================================================================

export interface SeedProjectOptions {
  id?: string;
  name?: string;
  phase?: 'discovery' | 'high_level' | 'detailed' | 'ready';
}

export interface SeedPlanItemOptions {
  id?: string;
  project_id: string;
  parent_id?: string | null;
  title?: string;
  description?: string | null;
  label?: 'project' | 'feature' | 'task' | null;
  status?: 'backlog' | 'planned';
  external_key?: string | null;
  external_type?: 'jira' | 'linear' | null;
}

/**
 * Seed a project into the test database
 */
export function seedProject(db: DatabaseType, options: SeedProjectOptions = {}): string {
  const id = options.id || `test-project-${Date.now()}`;
  const name = options.name || 'Test Project';
  const phase = options.phase || 'discovery';

  db.prepare(`
    INSERT INTO projects (id, name, folder_path, phase)
    VALUES (?, ?, ?, ?)
  `).run(id, name, `/tmp/projects/${id}`, phase);

  return id;
}

/**
 * Seed a plan item into the test database
 */
export function seedPlanItem(db: DatabaseType, options: SeedPlanItemOptions): string {
  const id = options.id || `test-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const title = options.title || 'Test Item';

  db.prepare(`
    INSERT INTO plan_items (
      id, project_id, parent_id, title, description, label, status,
      external_key, external_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    options.project_id,
    options.parent_id ?? null,
    title,
    options.description ?? null,
    options.label ?? null,
    options.status || 'backlog',
    options.external_key ?? null,
    options.external_type ?? null
  );

  return id;
}

/**
 * Seed a tracker connection into the test database
 */
export function seedTrackerConnection(
  db: DatabaseType,
  options: { id?: string; tracker_type?: string; site_url?: string } = {}
): string {
  const id = options.id || `test-conn-${Date.now()}`;
  const tracker_type = options.tracker_type || 'jira';
  const site_url = options.site_url || 'test.atlassian.net';

  db.prepare(`
    INSERT INTO tracker_connections (id, tracker_type, site_url)
    VALUES (?, ?, ?)
  `).run(id, tracker_type, site_url);

  return id;
}
