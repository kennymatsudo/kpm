/**
 * Settings Domain Repository Interfaces
 *
 */


// =============================================================================
// App Settings Repository
// =============================================================================

export interface IAppSettingsRepository {
  /** Get a setting value by key */
  get(key: string): string | undefined;
  /** Set a setting value */
  set(key: string, value: string): void;
  /** Get all settings */
  getAll(): Record<string, string>;
}

// =============================================================================
// Task Prompt Template Repository
// =============================================================================

export interface ITaskPromptTemplateRepository {
  /** List templates for a scope (global if projectId is null, project-specific otherwise) */
  list(projectId: string | null): TaskPromptTemplate[];
  /** List all templates visible to a project (global + project-specific) */
  listForProject(projectId: string): TaskPromptTemplate[];
  /** Get a template by ID */
  get(id: string): TaskPromptTemplate | undefined;
  /** Get the effective template for a project (project default -> global default -> fallback) */
  getEffective(projectId: string): TaskPromptTemplate;
  /** Get the built-in default prompt content */
  getBuiltinDefault(): string;
  /** Create a new template */
  create(template: Omit<TaskPromptTemplate, 'id' | 'is_default' | 'created_at' | 'updated_at'>): TaskPromptTemplate;
  /** Update an existing template */
  update(id: string, updates: Partial<Pick<TaskPromptTemplate, 'name' | 'prompt_content'>>): void;
  /** Delete a template */
  delete(id: string): void;
  /** Set a template as the default for its scope */
  setDefault(id: string): void;
  /** Check if a template name exists in a scope */
  existsInScope(projectId: string | null, name: string): boolean;
  /** Ensure a default global template exists */
  ensureDefaultExists(): void;
}
