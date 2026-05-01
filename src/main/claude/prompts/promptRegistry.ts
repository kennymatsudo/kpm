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

export type PromptCategory = 'system' | 'generation' | 'agents';

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
    description: 'Defines what Claude can and cannot do in this workspace.',
    category: 'system',
    defaultContent: CONSTRAINTS,
  },
  {
    key: 'system.workspace',
    name: 'Workspace',
    description: 'How Claude understands and references workspace content.',
    category: 'system',
    defaultContent: WORKSPACE_SECTION,
  },
  {
    key: 'system.plan_rules',
    name: 'Plan Rules',
    description: 'How plan items are structured and decomposed.',
    category: 'system',
    defaultContent: PLAN_SYSTEM_RULES,
  },
  {
    key: 'system.response_style',
    name: 'Response Style',
    description: 'Tone and formatting rules for Claude\'s responses.',
    category: 'system',
    defaultContent: RESPONSE_STYLE,
  },
];

// =============================================================================
// Generation Prompt Defaults
// =============================================================================

const GENERATION_PROMPTS: PromptDefinition[] = [
  {
    key: 'generation.pr_system_prompt',
    name: 'PR Generation System Prompt',
    description: 'Controls how Claude generates PR titles and descriptions. The {{description_guidance}} variable is replaced with body formatting instructions from the repo\'s PR template, or from the PR Description Instructions prompt when no template exists.',
    category: 'generation',
    defaultContent: `You generate pull request titles and descriptions from a code change and its context.

Title rules:
- Under 72 characters, imperative mood ("Add user authentication", "Fix race condition in cache").
- If a tracker key is provided (e.g. JIRA-123), prefix it: "JIRA-123: Add user authentication".

Description guidance:

{{description_guidance}}

Universal rules:
- Do not paste commit SHAs, enumerate file paths, list test names, or quote diff hunks. The reviewer has the diff and the commit log.
- Include a sentence or bullet only if it teaches the reviewer something they cannot get from the diff, the title, or the commit log.
- Do not fabricate rationale. When the provided context is thin, the description is thin — invented tradeoffs or made-up risk analysis are worse than brevity.

Respond in this exact format (no other text):
TITLE: <the PR title>
BODY:
<the PR description in markdown>`,
    variables: [
      { name: 'description_guidance', description: 'Body formatting instructions — pulled from the repo\'s PR template when one exists, otherwise from the PR Description Instructions prompt.' },
    ],
  },
  {
    key: 'generation.pr_description_instructions',
    name: 'PR Description Instructions',
    description: 'Fallback body formatting instructions used when the repo has no PR template.',
    category: 'generation',
    defaultContent: `Write for a reviewer who is skimming. A description that is too long does not get read. Aim for something that fits on one screen.


  },
  {
    key: 'generation.commit_message_instructions',
    name: 'Commit Message Instructions',
    description: 'How Claude writes commit messages when work moves to review.',
    category: 'generation',
    defaultContent: `Subject: ≤50 chars, imperative mood, capitalized, no trailing period. Respect acronyms (\`Fix API\`, not \`Fix api\`). Focus on what changed and why it matters.

Body: include unless the subject is fully self-explanatory. Blank line after subject, wrap at 72 chars. Explain what and why (the diff shows how). Use bullets for multiple distinct changes.

Never include: conventional-commit prefixes (\`feat:\`, \`fix:\`, etc.), co-authored-by attribution, emoji, file/line counts, or incidental refactor/test mentions unless that IS the focus.

Return ONLY the commit message — no preamble, no code fences.`,
  },
  {
    key: 'generation.briefing_instructions',
    name: 'Briefing Instructions',
    description: 'Controls how the "What should I do next?" briefing is written.',
    category: 'generation',
    defaultContent: `Produce a concise, prioritized briefing that helps a developer decide what to focus on next.

Priority ordering rules:
1. User commitments from chat ("I'll do X") are highest priority
2. Blocked items that the user can unblock
3. Stale in-progress work (hasn't been touched in 7+ days)
4. Items ready to start (all dependencies met)
5. Idle dev sessions that need cleanup or resuming

Never use emojis, colored circles, or status indicators. Use plain markdown only.
Keep it under 500 words. Be specific — reference actual item titles, not generic advice.`,
  },
];

// =============================================================================
// Board Agent Prompt Defaults
// =============================================================================

const AGENT_PROMPTS: PromptDefinition[] = [
  {
    key: 'agents.implementation_system',
    name: 'Implementation Agent System Prompt',
    description: 'How the implementation agent approaches work on a plan item.',
    category: 'agents',
    defaultContent: `You are implementing a scoped task in an existing codebase.


Prefer editing existing codepaths over introducing new layers. When a fallback is necessary, make the reason explicit in logs, errors, or a comment — do not let failures pass silently.

  },
  {
    key: 'agents.review_system',
    name: 'Opposing Review System Prompt',
    description: 'How the review agent evaluates a completed implementation. Includes review criteria and priority order; the output JSON shape is appended automatically by autoReview.ts.',
    category: 'agents',
    defaultContent: `You are the opposing review agent. Review the implementation diff and surface only meaningful issues — do not praise, narrate, or rewrite.

Prioritize findings in this order:
1. correctness and regressions
2. security and data loss
3. hidden assumptions or invalid defaults
4. silent failures or ambiguous fallbacks
5. API or behavior contract mismatches
6. missing or weak tests
7. unnecessary complexity that does not provide clear value

  },
];

// =============================================================================
// Registry
// =============================================================================

/** All configurable prompts */
export const PROMPT_REGISTRY: PromptDefinition[] = [
  ...SYSTEM_PROMPTS,
  ...GENERATION_PROMPTS,
  ...AGENT_PROMPTS,
];

/** O(1) lookup by key */
export const PROMPT_REGISTRY_MAP: ReadonlyMap<string, PromptDefinition> = new Map(
  PROMPT_REGISTRY.map((p) => [p.key, p])
);

/** Union type of all prompt keys */
export type PromptKey = typeof PROMPT_REGISTRY[number]['key'];
