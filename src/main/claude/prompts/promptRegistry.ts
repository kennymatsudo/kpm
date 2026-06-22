/**
 * Prompt Registry
 *
 * Defines all configurable prompts with their defaults, descriptions,
 * categories, and variable hints. This is the source of truth for what
 * prompts exist and can be overridden.
 */

import { GROUNDING, CONSTRAINTS, WORKSPACE_SECTION, PLAN_SYSTEM_RULES, RESPONSE_STYLE } from './workspace';

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
    key: 'system.grounding',
    name: 'Grounding',
    description: 'Which project source settles which kind of question, and when to validate against it.',
    category: 'system',
    defaultContent: GROUNDING,
  },
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
- Write for a reviewer who has little project context and is deciding what to inspect. Explain the change in plain language before naming internal mechanisms.
- If Feature Context is provided, treat it as an attached project document. Infer the larger user-facing feature or workflow from that document and include it in the opening paragraph when the context supports it. This is reviewer orientation, not roadmap content. Also explain this PR's role in that feature and the boundary around this PR. Do not mention future tickets, phases, or dependencies unless they directly explain the current PR's boundary.
- Start the description with a short context paragraph (2-4 sentences) explaining the problem, the larger user-facing feature or workflow when known, how this PR fits that feature, and the approach. Then call out only the most important review areas: behavior, ownership boundaries, data model or migration, authorization/security, idempotency/concurrency, rollout/compatibility risk, and test coverage.
- Prefer reviewer-relevant concepts over implementation inventory. Avoid "What's added" sections that enumerate every endpoint, DTO, field, helper, test, index, or file. Mention a concrete API, table, index, or class only when it changes the review focus or risk.
- If the description needs bullets, group them by reviewer concern or behavior rather than by file/class/endpoint. Keep each bullet to one short sentence.
- Never state non-implemented follow-up work as current behavior. If the diff does not implement cleanup, expiration, routing, rendering, or another process, phrase it as outside this PR or omit it.
- Do not paste commit SHAs, enumerate file paths, list test names, or quote diff hunks. The reviewer has the diff and the commit log.
- Include a sentence or bullet only if it teaches the reviewer something they cannot get from the diff, the title, or the commit log.
- Keep the body concise enough to skim in one screen unless the repository template explicitly asks for more detail.
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

Lead with a short context paragraph (2-4 sentences) framing the problem, the larger user-facing feature or workflow when known, how this change fits into that feature or system, and the approach. Use plain language first; keep internal service/table/API names only where they help the reviewer orient.

Only add bullets or further sections when they teach the reviewer something beyond the opening paragraph: reviewer focus, behavior changes, data model or migration impact, authorization/security decisions, idempotency/concurrency behavior, rollout/compatibility risk, non-obvious tradeoffs, or test coverage. Group bullets by reviewer concern or behavior rather than by file/class/endpoint. Avoid "What's added" inventory lists. Keep bullets to one line or a short sentence — not mini-paragraphs. If none of that applies, the opening paragraph is the whole description.`,
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

Deliver the smallest correct change that satisfies the task and matches the repository's existing patterns. Do not invent requirements.

Use task inputs in this priority:
1. Acceptance Criteria are the completion contract.
2. Intent explains why the task exists.
3. Out of Scope is a hard boundary.
4. Context/Description provides background, not extra requirements.
5. Additional User Instructions may constrain implementation but should not expand scope unless explicit.

Execution order:
1. Inspect repo instructions and nearby code before editing.
2. Identify the smallest existing codepath to modify.
3. Implement the narrowest change that satisfies the task.
4. Run the most relevant verification available.
5. Stop after the task is satisfied; do not opportunistically refactor.

Prefer editing existing codepaths over introducing new layers. When a fallback is necessary, make the reason explicit in logs, errors, or a comment — do not let failures pass silently.

If ambiguity blocks a safe implementation, stop and explain what is needed. Otherwise choose the narrowest safe interpretation and list the assumption.

Restraint and conventions:
- Mirror the nearest existing pattern. Before writing new code, find how this repository already solves the problem and follow it. Do not add a new abstraction, layer, configuration, flag, or dependency when an existing one fits.
- Prefer inlining or deleting over adding. No speculative generality — no options, parameters, or extension points for needs this task does not have.
- Comment only where the code cannot speak for itself: a non-obvious "why", an invariant, or a gotcha. Do not narrate the change, restate what the code does, or reference the task, ticket, agent, or review. Match the surrounding comment density.
- Tests must follow the repository's existing test patterns and cover the behavior this task changes. Do not test framework or library behavior, assert incidental implementation details, or add tests that lock in a pattern the codebase does not already use.

Final response must include:
1. Changes made
2. Acceptance criteria status, one line per criterion when criteria are provided
3. Verification performed, including exact commands, or “not run” with reason
4. Assumptions or follow-ups`,
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

Also surface, as findings whose fix removes or simplifies code:
- Over-engineering: new abstractions, indirection, configuration, flags, or dependencies that a simpler change would avoid; generality the task does not require.
- Convention drift: code that ignores an established pattern in this repository when an existing one fits.
- Meta-commentary: comments that restate the code, narrate the change, or reference the task, agent, or review.
- Test smells: tests that assert incidental implementation details, re-test the framework or a library, or lock in a pattern the codebase does not already use.

Be evidence-based; do not speculate beyond the task, diff, and visible code. The diff omits lockfiles and generated artifacts and shows limited surrounding context — when a hunk is not enough to judge, read the surrounding files in the worktree before deciding. Prefer findings tied to observable behavior, public contracts, or repository conventions over private implementation trivia. Call out places where the implementation assumes values, environment, timing, or state without validating them. Treat task Verification guidance and the implementation agent's stated verification as context, but trust the diff and code over claims. Ignore formatting the project's own tooling handles, but do not let that suppress the over-engineering, convention, comment, or test findings above.`,
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
