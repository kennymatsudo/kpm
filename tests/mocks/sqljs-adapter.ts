/**
 * sql.js Adapter - Better-SQLite3 Compatible API
 *
 * This adapter wraps sql.js (WASM-based SQLite) with an API that's compatible
 * with better-sqlite3. This allows tests to run without native module compilation,
 * eliminating the need to rebuild when switching between Node.js and Electron.
 *
 * The adapter is registered as a mock for 'better-sqlite3' in test setup,
 * so all imports of better-sqlite3 automatically use this instead.
 */

import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';

// Singleton for initialized sql.js
let SQL: SqlJsStatic | null = null;

/**
 * Initialize sql.js - must be called before creating databases
 */
export async function initializeSqlJs(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
}

/**
 * Check if sql.js has been initialized
 */
export function isInitialized(): boolean {
  return SQL !== null;
}

/**
 * Statement wrapper that matches better-sqlite3's Statement interface
 */
class Statement {
  private db: SqlJsDatabase;
  private sql: string;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  /**
   * Execute the statement and return all matching rows
   */
  all(...params: unknown[]): unknown[] {
    const stmt = this.db.prepare(this.sql);
    try {
      const boundParams = this.normalizeParams(params);
      if (boundParams.length > 0) {
        stmt.bind(boundParams);
      }
      const results: unknown[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  /**
   * Execute the statement and return the first matching row
   */
  get(...params: unknown[]): unknown {
    const stmt = this.db.prepare(this.sql);
    try {
      const boundParams = this.normalizeParams(params);
      if (boundParams.length > 0) {
        stmt.bind(boundParams);
      }
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  /**
   * Execute the statement without returning results
   * Returns an object with changes and lastInsertRowid
   */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(this.sql);
    try {
      const boundParams = this.normalizeParams(params);
      if (boundParams.length > 0) {
        stmt.bind(boundParams);
      }
      stmt.step();
    } finally {
      stmt.free();
    }

    // Get changes and last insert rowid
    const changesStmt = this.db.prepare('SELECT changes() as changes, last_insert_rowid() as lastId');
    try {
      changesStmt.step();
      const result = changesStmt.getAsObject() as { changes: number; lastId: number };
      return {
        changes: result.changes,
        lastInsertRowid: result.lastId,
      };
    } finally {
      changesStmt.free();
    }
  }

  /**
   * Normalize parameters for sql.js binding
   */
  private normalizeParams(params: unknown[]): (string | number | null | Uint8Array)[] {
    // Flatten if first param is an array
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

    return flat.map((p) => {
      if (p === undefined) return null;
      if (p === null) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (typeof p === 'bigint') return Number(p);
      if (typeof p === 'string' || typeof p === 'number') return p;
      if (p instanceof Uint8Array) return p;
      // Convert objects to JSON string
      if (typeof p === 'object') return JSON.stringify(p);
      return String(p);
    });
  }
}

/**
 * Database class that matches better-sqlite3's Database interface
 */
export class Database {
  private db: SqlJsDatabase;
  private _open = true;

  constructor(_filename?: string, _options?: object) {
    if (!SQL) {
      throw new Error(
        'sql.js not initialized. Call initializeSqlJs() in test setup before creating databases.'
      );
    }
    this.db = new SQL.Database();
  }

  /**
   * Execute a PRAGMA statement
   */
  pragma(pragma: string): unknown {
    // Parse the pragma to handle different formats
    const [name, value] = pragma.split('=').map((s) => s.trim());

    if (value !== undefined) {
      // Setting pragma
      try {
        this.db.run(`PRAGMA ${name} = ${value}`);
      } catch {
        // Some pragmas may not be supported in sql.js, ignore
      }
      return undefined;
    } else {
      // Getting pragma
      const stmt = this.db.prepare(`PRAGMA ${name}`);
      try {
        if (stmt.step()) {
          const obj = stmt.getAsObject();
          // Return the value directly if single column
          const keys = Object.keys(obj);
          if (keys.length === 1) {
            return obj[keys[0]];
          }
          return obj;
        }
        return undefined;
      } finally {
        stmt.free();
      }
    }
  }

  /**
   * Execute raw SQL (multiple statements allowed)
   */
  exec(sql: string): void {
    this.db.run(sql);
  }

  /**
   * Prepare a statement for execution
   */
  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  /**
   * Create a transaction wrapper
   * Returns a function that executes the provided function within a transaction
   */
  transaction<T, Args extends unknown[]>(fn: (...args: Args) => T): (...args: Args) => T {
    const self = this;
    return function (...args: Args): T {
      self.db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        self.db.run('COMMIT');
        return result;
      } catch (error) {
        self.db.run('ROLLBACK');
        throw error;
      }
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this._open) {
      this.db.close();
      this._open = false;
    }
  }

  /**
   * Check if database is open
   */
  get open(): boolean {
    return this._open;
  }

  /**
   * Get the underlying sql.js database (for advanced use)
   */
  get rawDb(): SqlJsDatabase {
    return this.db;
  }
}

/**
 * Default export to match better-sqlite3's module structure
 */
export default Database;
