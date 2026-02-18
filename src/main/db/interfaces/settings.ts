/**
 * Settings Domain Repository Interfaces
 *
 * Interfaces for app settings, task prompt templates, and custom prompts.
 */


// =============================================================================
// App Settings Repository
// =============================================================================

export interface IAppSettingsRepository {
  /** Get a setting value by key */
  get(key: string): string | undefined;
  /** Set a setting value */
  set(key: string, value: string): void;
  /** Delete a setting by key */
  delete(key: string): void;
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

// =============================================================================
// Custom Prompt Repository
// =============================================================================

/** Input type for creating a custom prompt */
export interface CustomPromptCreate {
  name: string;
  description?: string | null;
  prompt_content: string;
  icon?: CustomPromptIcon;
  keywords?: string | null;
  is_builtin?: boolean;
  sort_order?: number;
}

/** Input type for updating a custom prompt */
export interface CustomPromptUpdate {
  name?: string;
  description?: string | null;
  prompt_content?: string;
  icon?: CustomPromptIcon;
  keywords?: string | null;
  sort_order?: number;
}

export interface ICustomPromptRepository {
  /** List all custom prompts ordered by sort_order */
  list(): CustomPrompt[];
  /** Get a custom prompt by ID */
  get(id: string): CustomPrompt | undefined;
  /** Get a custom prompt by name */
  getByName(name: string): CustomPrompt | undefined;
  /** Create a new custom prompt */
  create(prompt: CustomPromptCreate): CustomPrompt;
  /** Update an existing custom prompt */
  update(id: string, updates: CustomPromptUpdate): void;
  /** Delete a custom prompt (fails for built-in prompts) */
  delete(id: string): boolean;
  /** Ensure built-in prompts exist */
  ensureBuiltinsExist(): void;
}

// =============================================================================
// Tool Permission Repository
// =============================================================================

export interface IToolPermissionRepository {
  /** List all persisted permissions for a project */
  listByProject(projectId: string): ToolPermission[];
  /** Upsert a permission (insert or replace by project_id + cache_key) */
  upsert(permission: Omit<ToolPermission, 'granted_at'>): void;
  /** Delete a permission by ID */
  delete(id: string): void;
  /** Delete all permissions for a project */
  deleteByProject(projectId: string): void;
}
