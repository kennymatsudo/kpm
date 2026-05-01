/**
 * Task Prompt Template Repository Implementation
 *
 * Handles CRUD operations for task prompt templates used to guide Claude when creating plan items.
 * Templates can be global (project_id = null) or project-specific.
 *
 * Optimized with prepared statement caching, RETURNING clause, and single-query getEffective().
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { TaskPromptTemplate } from '../../../../shared/types';
import { DEFAULT_TASK_PROMPT } from '../../../../shared/taskPromptDefaults';
import type { ITaskPromptTemplateRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Read operations
  getById: Statement;
  listGlobal: Statement;
  listByProject: Statement;
  listForProject: Statement;
  getEffective: Statement;
  existsGlobal: Statement;
  getGlobalId: Statement;

  // Write operations
  insert: Statement;
  delete: Statement;
  clearDefaultByProject: Statement;
  clearDefaultGlobal: Statement;
  setDefault: Statement;
  existsInScope: Statement;
}

export class TaskPromptTemplateRepository implements ITaskPromptTemplateRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      // Read operations
      getById: db.prepare('SELECT * FROM task_prompt_templates WHERE id = ?'),
      listGlobal: db.prepare(`
        SELECT * FROM task_prompt_templates
        WHERE project_id IS NULL
        ORDER BY is_default DESC, name ASC
      `),
      listByProject: db.prepare(`
        SELECT * FROM task_prompt_templates
        WHERE project_id = ?
        ORDER BY is_default DESC, name ASC
      `),
      listForProject: db.prepare(`
        SELECT * FROM task_prompt_templates
        WHERE project_id IS NULL OR project_id = ?
        ORDER BY project_id IS NULL DESC, is_default DESC, name ASC
      `),
      // Single query for getEffective() - prioritized by project-specific default > project name > global default > global name
      getEffective: db.prepare(`
        SELECT * FROM task_prompt_templates
        WHERE (project_id = ? AND is_default = 1)
           OR (project_id = ? AND name = 'default')
           OR (project_id IS NULL AND is_default = 1)
           OR (project_id IS NULL AND name = 'default')
        ORDER BY
          CASE
            WHEN project_id IS NOT NULL AND is_default = 1 THEN 1
            WHEN project_id IS NOT NULL AND name = 'default' THEN 2
            WHEN project_id IS NULL AND is_default = 1 THEN 3
            ELSE 4
          END
        LIMIT 1
      `),
      existsGlobal: db.prepare('SELECT EXISTS (SELECT 1 FROM task_prompt_templates WHERE project_id IS NULL LIMIT 1) as exists_flag'),
      getGlobalId: db.prepare('SELECT id FROM task_prompt_templates WHERE project_id IS NULL LIMIT 1'),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO task_prompt_templates (id, project_id, name, prompt_content, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM task_prompt_templates WHERE id = ?'),
      clearDefaultByProject: db.prepare('UPDATE task_prompt_templates SET is_default = 0 WHERE project_id = ?'),
      clearDefaultGlobal: db.prepare('UPDATE task_prompt_templates SET is_default = 0 WHERE project_id IS NULL'),
      setDefault: db.prepare('UPDATE task_prompt_templates SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      existsInScope: db.prepare(`
        SELECT EXISTS (
          SELECT 1 FROM task_prompt_templates
          WHERE (project_id = ? OR (project_id IS NULL AND ? IS NULL)) AND name = ?
          LIMIT 1
        ) as exists_flag
      `),
    };
  }

  list(projectId: string | null): TaskPromptTemplate[] {
    if (projectId === null) {
      return this.stmts.listGlobal.all() as TaskPromptTemplate[];
    }
    return this.stmts.listByProject.all(projectId) as TaskPromptTemplate[];
  }

  listForProject(projectId: string): TaskPromptTemplate[] {
    return this.stmts.listForProject.all(projectId) as TaskPromptTemplate[];
  }

  get(id: string): TaskPromptTemplate | undefined {
    return this.stmts.getById.get(id) as TaskPromptTemplate | undefined;
  }

  getEffective(projectId: string): TaskPromptTemplate {
    // Single query with priority ordering (replaces 4 sequential queries)
    const template = this.stmts.getEffective.get(projectId, projectId) as TaskPromptTemplate | undefined;

    if (template) {
      return template;
    }

    // Fallback template (only if nothing found)
    return {
      id: 'fallback',
      project_id: null,
      name: 'Fallback',
      prompt_content: DEFAULT_TASK_PROMPT,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get the built-in default prompt content.
   * Used for "Reset to Default" functionality.
   */
  getBuiltinDefault(): string {
    return DEFAULT_TASK_PROMPT;
  }

  create(template: Omit<TaskPromptTemplate, 'id' | 'is_default' | 'created_at' | 'updated_at'>): TaskPromptTemplate {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(
      id,
      template.project_id,
      template.name,
      template.prompt_content,
      now,
      now
    ) as TaskPromptTemplate;
  }

  update(id: string, updates: Partial<Pick<TaskPromptTemplate, 'name' | 'prompt_content'>>): void {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => (updates as Record<string, unknown>)[field]);

    // Dynamic update (uncommon path, ok to prepare each time)
    const stmt = this.db.prepare(`
      UPDATE task_prompt_templates
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(...values, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  setDefault(id: string): void {
    const template = this.get(id);
    if (!template) {
      throw new Error('Template not found');
    }

    // Clear default flag for all templates in the same scope
    if (template.project_id) {
      this.stmts.clearDefaultByProject.run(template.project_id);
    } else {
      this.stmts.clearDefaultGlobal.run();
    }

    // Set this template as default
    this.stmts.setDefault.run(id);
  }

  existsInScope(projectId: string | null, name: string): boolean {
    // Use EXISTS for short-circuit
    const result = this.stmts.existsInScope.get(projectId, projectId, name) as { exists_flag: number };
    return result.exists_flag === 1;
  }

  ensureDefaultExists(): void {
    // Use EXISTS for short-circuit check
    const existsResult = this.stmts.existsGlobal.get() as { exists_flag: number };

    if (existsResult.exists_flag === 0) {
      // Create default global template
      const created = this.create({
        project_id: null,
        name: 'Default',
        prompt_content: DEFAULT_TASK_PROMPT,
      });

      // Mark it as default
      this.setDefault(created.id);
    }
  }
}
