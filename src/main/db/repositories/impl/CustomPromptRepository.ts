/**
 * Custom Prompt Repository Implementation
 *
 * Handles CRUD operations for custom prompts used in Command+K palette.
 * All prompts are global (no project-specific scope).
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { CustomPrompt, CustomPromptIcon, CustomPromptTargetType, CustomPromptRunMode } from '../../../../shared/types';
import type { ICustomPromptRepository, CustomPromptCreate, CustomPromptUpdate } from '../../interfaces';

// =============================================================================
// Prepared Statements Cache
// =============================================================================

interface PreparedStatements {
  // Read operations
  list: Statement;
  getById: Statement;
  getByName: Statement;
  existsByName: Statement;

  // Write operations
  insert: Statement;
  delete: Statement;
}

// =============================================================================
// Repository Implementation
// =============================================================================

export class CustomPromptRepository implements ICustomPromptRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      // Read operations
      list: db.prepare(`
        SELECT * FROM custom_prompts
        ORDER BY sort_order ASC, name ASC
      `),
      getById: db.prepare('SELECT * FROM custom_prompts WHERE id = ?'),
      getByName: db.prepare('SELECT * FROM custom_prompts WHERE name = ?'),
      existsByName: db.prepare('SELECT EXISTS (SELECT 1 FROM custom_prompts WHERE name = ? LIMIT 1) as exists_flag'),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO custom_prompts (id, name, description, prompt_content, icon, keywords, is_builtin, sort_order, target_type, run_mode, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM custom_prompts WHERE id = ? AND is_builtin = 0'),
    };
  }

  private rowToCustomPrompt(row: Record<string, unknown>): CustomPrompt {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      prompt_content: row.prompt_content as string,
      icon: (row.icon as CustomPromptIcon) || 'document',
      keywords: row.keywords as string | null,
      is_builtin: row.is_builtin === 1,
      sort_order: row.sort_order as number,
      target_type: (row.target_type as CustomPromptTargetType) || 'none',
      run_mode: (row.run_mode as CustomPromptRunMode) || 'artifact',
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  list(): CustomPrompt[] {
    const rows = this.stmts.list.all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToCustomPrompt(row));
  }

  get(id: string): CustomPrompt | undefined {
    const row = this.stmts.getById.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToCustomPrompt(row) : undefined;
  }

  getByName(name: string): CustomPrompt | undefined {
    const row = this.stmts.getByName.get(name) as Record<string, unknown> | undefined;
    return row ? this.rowToCustomPrompt(row) : undefined;
  }

  create(prompt: CustomPromptCreate): CustomPrompt {
    const id = randomUUID();
    const now = new Date().toISOString();

    const row = this.stmts.insert.get(
      id,
      prompt.name,
      prompt.description ?? null,
      prompt.prompt_content,
      prompt.icon ?? 'document',
      prompt.keywords ?? null,
      prompt.is_builtin ? 1 : 0,
      prompt.sort_order ?? 0,
      prompt.target_type ?? 'none',
      prompt.run_mode ?? 'artifact',
      now,
      now
    ) as Record<string, unknown>;

    return this.rowToCustomPrompt(row);
  }

  update(id: string, updates: CustomPromptUpdate): void {
    const fields = Object.keys(updates).filter((k) => updates[k as keyof CustomPromptUpdate] !== undefined);
    if (fields.length === 0) return;

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => {
      const value = updates[field as keyof CustomPromptUpdate];
      return value;
    });

    // Dynamic update (uncommon path, ok to prepare each time)
    const stmt = this.db.prepare(`
      UPDATE custom_prompts
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(...values, id);
  }

  delete(id: string): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  ensureBuiltinsExist(): void {
    // Clean up legacy built-in prompts (Weekly Update, Test Plan) that were
    // removed. Rows with is_builtin=1 cannot be deleted through the UI, so
    // existing installs would otherwise carry them forever.
    this.db
      .prepare(
        `DELETE FROM custom_prompts WHERE is_builtin = 1 AND name IN ('Weekly Update', 'Test Plan')`
      )
      .run();

    // No built-in prompts are currently shipped. Kept as a hook for future
    // built-in seeding so startup callers don't need to change.
  }
}
