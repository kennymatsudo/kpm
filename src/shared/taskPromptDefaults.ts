/**
 * Default task prompt content shared by prompt construction and persistence.
 *
 * Keeping this outside the Claude integration prevents database repositories
 * from depending on agent-specific prompt modules.
 */

export const TASK_DESCRIPTION_TEMPLATE = `\`\`\`
[Why this matters. What problem it solves. 1-2 sentences. Start directly with the content — no "Context" or "Summary" header.]

## Acceptance Criteria
- [ ] [Observable behavior 1]
- [ ] [Observable behavior 2]

## Out of Scope
[Optional. What this ticket explicitly does NOT include.]

## Dependencies
[Optional. Related tickets, blocking work, or parallel efforts. Reference plan items as \`@plan/<uuid>\` — they render as live chips locally and rewrite to native tracker links on sync.]

## Code References
[Optional. File paths and specific functions/classes from repos. Include what's relevant about each reference.]

## Verification
[Optional. Test file paths, commands, or observable system state the implementing agent can use to confirm the work is complete.]
\`\`\``;

export const TASK_SECTION_RULES = `**Section rules:**
- Use only the sections above — no extra sections (Tests, Deployment, Metrics, etc.)
- Required: Acceptance Criteria
- Optional: Out of Scope, Dependencies, Code References, Verification
- Omit optional sections if no meaningful content

**Acceptance Criteria rules:**
- 3-5 items maximum — more means the ticket should be broken down
- Behavioral, not technical — describe observable outcomes, not internal implementation
- From the user/system perspective — what can be seen, measured, or verified externally
- Good: "Debug messages containing variable dumps are not stored in Redis"
- Bad: "The is_debug_variable_dump function returns True for matching patterns"

**Code References rules:**
- Include specific function or class names, not just file paths — "src/auth/jwt.ts (verifyToken)" is more useful than "src/auth/jwt.ts"
- Note what's relevant: "src/payments/client.ts (parseResponse) — contains legacy branching to preserve"

**Verification rules:**
- Use when the ticket will be executed by an agent
- Prefer runnable commands: \`npm test -- src/auth/reset.test.ts\`, \`make lint\`
- Or observable system state: "POST /api/reset returns 200 with valid token in body"
- Omit if acceptance criteria are already self-evident from existing tests

**Document references:**
- Do not reference any KPM project files or documents (attachments/, notes/, AGENTS.md, CLAUDE.md, or any file in the KPM project folder). These are local to KPM and won't exist when tickets sync to Jira/Linear.
- Only reference: file paths in connected repos, external URLs (Figma, Confluence, etc.)`;

export const DEFAULT_TASK_PROMPT = `### Item Titles
**Verb-first imperative** — start with an action verb, be specific, under 60 characters.
- Good: "Add password reset flow to auth system"
- Bad: "Password reset" *(no verb, too vague)*

### Item Descriptions
Use this structure:

${TASK_DESCRIPTION_TEMPLATE}

${TASK_SECTION_RULES}`;
