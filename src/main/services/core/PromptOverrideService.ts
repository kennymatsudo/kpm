/**
 * Prompt Override Service
 *
 * Resolves prompt content: user override > registry default.
 * Overrides are stored in app_settings with key prefix "prompt_override:".
 */

import type { IAppSettingsRepository } from '../../db/interfaces';
import { PROMPT_REGISTRY, PROMPT_REGISTRY_MAP, type PromptCategory, type PromptDefinition } from '../../claude/prompts/promptRegistry';
import { success, failure, type ServiceResult } from '../result';

// =============================================================================
// Types
// =============================================================================

const KEY_PREFIX = 'prompt_override:';

export interface PromptOverrideInfo {
  key: string;
  name: string;
  description: string;
  category: PromptCategory;
  hasOverride: boolean;
  variables?: { name: string; description: string }[];
}

export interface PromptOverrideServiceDeps {
  appSettings: IAppSettingsRepository;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPromptOverrideService(deps: PromptOverrideServiceDeps) {
  const { appSettings } = deps;

  return {
    /**
     * Get the effective content for a prompt key.
     * Returns user override if one exists, otherwise the registry default.
     */
    getContent(key: string): ServiceResult<string> {
      const def = PROMPT_REGISTRY_MAP.get(key);
      if (!def) {
        return failure(`Unknown prompt key: ${key}`);
      }

      const override = appSettings.get(`${KEY_PREFIX}${key}`);
      return success(override ?? def.defaultContent);
    },

    /**
     * Get the registry default for a prompt key.
     */
    getDefault(key: string): ServiceResult<string> {
      const def = PROMPT_REGISTRY_MAP.get(key);
      if (!def) {
        return failure(`Unknown prompt key: ${key}`);
      }
      return success(def.defaultContent);
    },

    /**
     * Check if a user override exists for a prompt key.
     */
    hasOverride(key: string): boolean {
      return appSettings.get(`${KEY_PREFIX}${key}`) !== undefined;
    },

    /**
     * Set a user override for a prompt key.
     */
    setOverride(key: string, content: string): ServiceResult<void> {
      const def = PROMPT_REGISTRY_MAP.get(key);
      if (!def) {
        return failure(`Unknown prompt key: ${key}`);
      }
      appSettings.set(`${KEY_PREFIX}${key}`, content);
      return success(undefined);
    },

    /**
     * Remove a user override, reverting to the registry default.
     */
    resetToDefault(key: string): void {
      appSettings.delete(`${KEY_PREFIX}${key}`);
    },

    /**
     * List all prompt definitions with override status.
     */
    listAll(): PromptOverrideInfo[] {
      return PROMPT_REGISTRY.map((def) => ({
        key: def.key,
        name: def.name,
        description: def.description,
        category: def.category,
        hasOverride: appSettings.get(`${KEY_PREFIX}${def.key}`) !== undefined,
        variables: def.variables,
      }));
    },

    /**
     * List prompt definitions filtered by category.
     */
    listByCategory(category: PromptCategory): PromptOverrideInfo[] {
      return this.listAll().filter((p) => p.category === category);
    },

    /**
     * Get the full definition for a prompt key (includes content + override status).
     */
    getDefinition(key: string): (PromptDefinition & { hasOverride: boolean; currentContent: string }) | undefined {
      const def = PROMPT_REGISTRY_MAP.get(key);
      if (!def) return undefined;

      const override = appSettings.get(`${KEY_PREFIX}${key}`);
      return {
        ...def,
        hasOverride: override !== undefined,
        currentContent: override ?? def.defaultContent,
      };
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type PromptOverrideService = ReturnType<typeof createPromptOverrideService>;
