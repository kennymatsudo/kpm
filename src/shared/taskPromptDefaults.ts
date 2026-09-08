/**
 * Default task prompt content shared by prompt construction and persistence.
 *
 * Keeping this outside the Claude integration prevents database repositories
 * from depending on agent-specific prompt modules.
 */

export const TASK_DESCRIPTION_TEMPLATE = `\`\`\`
[Two to four sentences of plain prose. What is wrong or missing today, who it affects, and what changes for them. Start directly with the content — no headings, no "Context" or "Summary" label.]

[Optional closing sentence: what this deliberately does not cover.]
\`\`\``;

export const TASK_WRITING_RULES = `**Altitude:**
- Describe the problem and the outcome. Never the implementation.
- No file paths, function or class names, database columns, or library and framework names.
- No headings. \`## Acceptance Criteria\`, \`## Verification\`, and \`## Code References\` do not belong in a description.
- If a sentence would only make sense to someone who has read the diff, cut it.

**Voice:**
- Plain English, present tense, concrete. The word a smart colleague would use.
- Do not write: leverage, robust, seamless, streamline, comprehensive, holistic, best-in-class, ensure that, in order to, it is important to note.
- No meta-commentary about the item itself — "This ticket will…", "As discussed…", "Note that…", "The goal of this task is to…". State the thing directly.
- No closing sentence that restates what the description already said.

**Acceptance criteria** — the \`acceptance_criteria\` field, never a section in the description:
- 3-5 items maximum. More means the item should be broken down.
- Behavioral, not technical — observable outcomes, not internal implementation.
- Good: "Debug messages containing variable dumps are not stored in Redis"
- Bad: "The is_debug_variable_dump function returns True for matching patterns"
- What the implementing agent needs but a stakeholder does not — file paths, functions to preserve, test commands like \`npm test -- src/auth/reset.test.ts\` — belongs in \`intent\` or \`acceptance_criteria\`. Both stay local to KPM.

**References:**
- Do not reference KPM project files or documents (attachments/, notes/, AGENTS.md, CLAUDE.md, or any file in the KPM project folder). They do not exist once an item syncs to Jira or Linear.
- External URLs (Figma, Confluence) are fine in a description when a reader outside KPM can open them.
- Reference other plan items as \`@plan/<uuid>\`; KPM rewrites them to native tracker links on export.`;

export const DEFAULT_TASK_PROMPT = `### Item Titles
**Verb-first imperative** — start with an action verb, be specific, under 60 characters.
- Good: "Add password reset flow to auth system"
- Bad: "Password reset" *(no verb, too vague)*

### Item Descriptions
\`description\` is the only field that syncs to Jira and Linear. Write it for a product manager or a developer who has never opened the codebase.

${TASK_DESCRIPTION_TEMPLATE}

${TASK_WRITING_RULES}`;
