/**
 *
 */

export const TASK_DESCRIPTION_TEMPLATE = `\`\`\`
[Why this matters. What problem it solves. 1-2 sentences. Start directly with the content — no "Context" or "Summary" header.]

## Acceptance Criteria
- [ ] [Observable behavior 1]
- [ ] [Observable behavior 2]

## Out of Scope
[Optional. What this ticket explicitly does NOT include.]

## Dependencies

## Code References
\`\`\``;

export const TASK_SECTION_RULES = `**Section rules:**
- Use only the sections above — no extra sections (Tests, Deployment, Metrics, etc.)
- Required: Acceptance Criteria
- Omit optional sections if no meaningful content

**Acceptance Criteria rules:**
- 3-5 items maximum — more means the ticket should be broken down
- Behavioral, not technical — describe observable outcomes, not internal implementation
- From the user/system perspective — what can be seen, measured, or verified externally
- Good: "Debug messages containing variable dumps are not stored in Redis"
- Bad: "The is_debug_variable_dump function returns True for matching patterns"

**Document references:**
- Only reference: file paths in connected repos, external URLs (Figma, Confluence, etc.)`;
