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
// =============================================================================

  /** List templates for a scope (global if projectId is null, project-specific otherwise) */
  /** List all templates visible to a project (global + project-specific) */
  /** Get a template by ID */
  /** Get the effective template for a project (project default -> global default -> fallback) */
  /** Create a new template */
  /** Update an existing template */
  /** Delete a template */
  delete(id: string): void;
  /** Set a template as the default for its scope */
  setDefault(id: string): void;
  /** Check if a template name exists in a scope */
  existsInScope(projectId: string | null, name: string): boolean;
  /** Ensure a default global template exists */
  ensureDefaultExists(): void;
}
