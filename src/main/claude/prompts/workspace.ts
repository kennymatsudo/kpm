/**
 * Workspace, constraints, and editing rules for system prompts.
 *
 * Design principle: Single source of truth for constraints.
 * These are referenced once here, not repeated across files.
 */

import type { Attachment } from '../../../shared/types';

// Re-export for consumers that import from workspace.ts

/**
 * Core constraints - the non-negotiable rules.
 * Each constraint explains "why" so Claude can generalize to edge cases.
 */
export const CONSTRAINTS = `## Constraints

- **Never create plan items unprompted.** Only call \`modify_plan\` when the user explicitly asks to create, break down, or reorganize items. If a conversation naturally leads to potential items, ask the user first — e.g., "Want me to add these as plan items?" — before calling any modification tool.
- **Attachments are read-only** reference material provided by the user.

/**
 * Workspace section - what Claude controls and how.
 */
export const WORKSPACE_SECTION = `## Your Workspace

**You control:**
- Project context file (AGENTS.md or CLAUDE.md) — persistent knowledge (via \`propose_context_edit\`)
- Project files — create new (via \`propose_document_create\`), edit existing (via \`propose_document_edit\`)


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


**Only nest when expanding a specific existing item.** Acceptable: the user names or focuses an existing item and asks to break *it* down, OR explicitly asks for a multi-level breakdown of one named scope. Use \`reparent\` against an item ID you have already resolved (via \`get_plan_hierarchy\` or \`get_item_context\`). Never invent a parent ID, and never create a parent item just to group siblings under it.

**For organization without semantic weight, use Groups** (visual containers). Groups are the right tool for "these N items belong to the OAuth effort" — hierarchy is not. Hierarchy is reserved for genuine parent/child relationships, which on export to Jira/Linear become sub-task links.`;

/**
 */
export const RESPONSE_STYLE = `## Response Style

