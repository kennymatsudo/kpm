/**
 * Settings Domain Repository Interfaces
 *
 * Interfaces for app settings, task prompt templates, themes, and the
 * project write grant.
 */

import type {
  TaskPromptTemplate,
  CustomTheme,
} from '../../../shared/types';

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
// Custom Theme Repository
// =============================================================================

export type CustomThemeSaveInput = Omit<CustomTheme, 'id' | 'created_at' | 'updated_at'>;

export interface ICustomThemeRepository {
  /** List all custom themes ordered by most recently updated */
  list(): CustomTheme[];
  /** Get a custom theme by ID */
  get(id: string): CustomTheme | undefined;
  /** Upsert a theme by source key and return the persisted row */
  upsert(theme: CustomThemeSaveInput): CustomTheme;
  /** Delete a custom theme by ID */
  delete(id: string): void;
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
// Project Write Grant Repository
// =============================================================================

export interface IProjectWriteGrantRepository {
  /** Every project the user has granted direct writes in. */
  listGrantedProjectIds(): string[];
  /** Grant direct writes in a project. Idempotent. */
  grant(projectId: string): void;
  /** Withdraw the grant. Idempotent. */
  revoke(projectId: string): void;
}
