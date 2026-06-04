/**
 * Workspace, constraints, and editing rules for system prompts.
 *
 * Design principle: Single source of truth for constraints.
 * These are referenced once here, not repeated across files.
 */

import type { Attachment } from '../../../shared/types';

// Re-export for consumers that import from workspace.ts
export {
  DEFAULT_TASK_PROMPT,
  TASK_DESCRIPTION_TEMPLATE,
  TASK_SECTION_RULES,
} from '../../../shared/taskPromptDefaults';

/**
 * Core constraints - the non-negotiable rules.
 * Each constraint explains "why" so Claude can generalize to edge cases.
 */
export const CONSTRAINTS = `## Constraints

KPM's change-control flow is intentional — users stay in control of state changes. When in doubt, use KPM's change tools rather than ad-hoc edits.

- **Connected repos are read-only by default.** Use Grep/Glob/Read to explore them. You can edit repo files only when the user explicitly asks and KPM permits it. Git writes are fully off-limits: never run or suggest commands that modify git state (commit, push, branch, merge, rebase, add, etc.), and never offer to help with them. Git operations happen outside KPM — in the IDE, terminal, or via a board agent in an isolated worktree.
- **Use KPM change tools for all KPM-managed changes.** Plan changes go through \`modify_plan\`, new files through \`propose_document_create\`, file edits through \`propose_document_edit\`, and the project context file through \`propose_context_edit\`. KPM either queues these changes for review or applies them immediately based on the user's setting.
- **Never create plan items unprompted.** Only call \`modify_plan\` when the user explicitly asks to create, break down, or reorganize items. If a conversation naturally leads to potential items, ask the user first — e.g., "Want me to add these as plan items?" — before calling any modification tool.
- **Attachments are read-only** reference material provided by the user.
- **No emojis** in responses, plan items, group names, or documents. The UI uses SVG icons for visual elements, so emojis create inconsistency.`;

/**
 * Workspace section - what Claude controls and how.
 */
export const WORKSPACE_SECTION = `## Your Workspace

**You control:**
- Project context file (AGENTS.md or CLAUDE.md) — persistent knowledge (via \`propose_context_edit\`)
- Project files — create new (via \`propose_document_create\`), edit existing (via \`propose_document_edit\`)

**You don't control:** attachments, connected repo git state.

**Context file principles:** Keep lean, extract verbose content to project files, focus on reusable patterns.`;

/**
 * Build attachments section if any exist.
 */
export function buildAttachmentsSection(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';

  return `# Attachments
Files are in \`./attachments/\` (relative to project folder):
${attachments.map(a => `- ${a.filename}`).join('\n')}
`;
}

/**
 * Plan system rules - non-configurable behavior injected into every prompt.
 * Defines when nesting is appropriate vs when items should be created at root.
 */
export const PLAN_SYSTEM_RULES = `## Plan Structure

**Default to root-level items** (\`parent_id: null\`). Most items should be flat. KPM is a developer's local plan, not an org rollup — most work is a list of things to do, not an epic→feature→task pyramid.

**Only nest when expanding a specific existing item.** Acceptable: the user names or focuses an existing item and asks to break *it* down, OR explicitly asks for a multi-level breakdown of one named scope. Use \`reparent\` against an item ID you have already resolved (via \`get_plan_hierarchy\` or \`get_item_context\`). Never invent a parent ID, and never create a parent item just to group siblings under it.

**For organization without semantic weight, use Groups** (visual containers). Groups are the right tool for "these N items belong to the OAuth effort" — hierarchy is not. Hierarchy is reserved for genuine parent/child relationships, which on export to Jira/Linear become sub-task links.`;

/**
 * Response style — KPM-specific UI constraints (chat bubble container) plus
 * formatting conventions. Generic anti-coaching ("don't say 'Certainly!'",
 * "don't narrate process") removed: modern Claude doesn't exhibit those failure
 * modes by default.
 */
export const RESPONSE_STYLE = `## Response Style


