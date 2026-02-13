/**
 * Prompt Registry
 *
 * Defines all configurable prompts with their defaults, descriptions,
 * categories, and variable hints. This is the source of truth for what
 * prompts exist and can be overridden.
 */


// =============================================================================
// Types
// =============================================================================


export interface PromptVariable {
  name: string;
  description: string;
}

export interface PromptDefinition {
  key: string;
  name: string;
  description: string;
  category: PromptCategory;
  defaultContent: string;
  variables?: PromptVariable[];
}

// =============================================================================
// System Prompt Defaults
// =============================================================================

const SYSTEM_PROMPTS: PromptDefinition[] = [
  {
    key: 'system.constraints',
    name: 'Constraints',
    category: 'system',
    defaultContent: CONSTRAINTS,
  },
  {
    key: 'system.workspace',
    name: 'Workspace',
    category: 'system',
    defaultContent: WORKSPACE_SECTION,
  },
  {
    key: 'system.plan_rules',
    name: 'Plan Rules',
    category: 'system',
    defaultContent: PLAN_SYSTEM_RULES,
  },
  {
    key: 'system.response_style',
    name: 'Response Style',
    category: 'system',
    defaultContent: RESPONSE_STYLE,
  },
];

// =============================================================================
// Generation Prompt Defaults
// =============================================================================

const GENERATION_PROMPTS: PromptDefinition[] = [
  {
    category: 'generation',

  },
  {
    category: 'generation',
  },
5. Idle dev sessions that need cleanup or resuming
];

  {
  },
];

// =============================================================================
// Registry
// =============================================================================

/** All configurable prompts */
export const PROMPT_REGISTRY: PromptDefinition[] = [
  ...SYSTEM_PROMPTS,
  ...GENERATION_PROMPTS,
];

/** O(1) lookup by key */
export const PROMPT_REGISTRY_MAP: ReadonlyMap<string, PromptDefinition> = new Map(
  PROMPT_REGISTRY.map((p) => [p.key, p])
);

/** Union type of all prompt keys */
export type PromptKey = typeof PROMPT_REGISTRY[number]['key'];
