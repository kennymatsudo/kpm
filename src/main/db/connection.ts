import BetterSqlite3 from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations';
import { getConfig } from '../config';

let database: DatabaseType;
let userDataPath: string;

// Simple logger for database operations
export const dbLog = {
  error: (operation: string, error: unknown) => {
    console.error(`[DB Error] ${operation}:`, error instanceof Error ? error.message : String(error));
  },
  warn: (operation: string, message: string) => {
    console.warn(`[DB Warn] ${operation}: ${message}`);
  },
};

/**
 * Wraps a database operation with error handling.
 * Returns undefined on error for read operations, throws for write operations.
 */
export function withErrorHandling<T>(
  operation: string,
  fn: () => T,
  options: { throwOnError: true }
): T;
export function withErrorHandling<T>(
  operation: string,
  fn: () => T,
  options: { throwOnError?: false; defaultValue: T }
): T;
export function withErrorHandling<T>(
  operation: string,
  fn: () => T,
  options?: { throwOnError?: false; defaultValue?: undefined }
): T | undefined;
export function withErrorHandling<T>(
  operation: string,
  fn: () => T,
  options: { throwOnError?: boolean; defaultValue?: T } = {}
): T | undefined {
  const { throwOnError = false, defaultValue } = options;
  try {
    return fn();
  } catch (error) {
    dbLog.error(operation, error);
    if (throwOnError) {
      throw error;
    }
    return defaultValue;
  }
}

/**
 * Get the database instance. Must be called after initDatabase.
 */
export function getDatabase(): DatabaseType {
  if (!database) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return database;
}

/**
 * Get the user data path. Must be called after initDatabase.
 */
export function getUserDataPath(): string {
  if (!userDataPath) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return userDataPath;
}

/**
 * Apply database pragmas from config.
 */
function applyDatabasePragmas(db: DatabaseType): void {
  const config = getConfig().database;

  // Enable WAL mode for better concurrent read/write performance
  if (config.walMode) {
    db.pragma('journal_mode = WAL');
  }

  // Set synchronous mode
  db.pragma(`synchronous = ${config.synchronous}`);

  // Enable foreign key constraints (required for ON DELETE CASCADE to work)
  if (config.foreignKeys) {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Initialize database with an explicit path.
 * Used by MCP server which runs outside Electron.
 */
export function initDatabaseWithPath(dbPath: string): void {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Store the userData path (parent of database file)
  userDataPath = dir;

  database = new BetterSqlite3(dbPath);
  applyDatabasePragmas(database);
  runMigrations(database);
}

/**
 * Initialize database using Electron's app path.
 * Used by the main Electron process.
 */
export function initDatabase(): void {
  const config = getConfig().database;

  // Dynamic import to avoid requiring electron in MCP server context
  const { app } = require('electron');
  userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, config.filename);
  database = new BetterSqlite3(dbPath);
  applyDatabasePragmas(database);
  runMigrations(database);
}
