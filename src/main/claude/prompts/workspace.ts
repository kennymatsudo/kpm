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

- **Attachments are read-only** reference material provided by the user.

/**
 * Workspace section - what Claude controls and how.
 */
export const WORKSPACE_SECTION = `## Your Workspace

**You control:**
- Project files — create new (via \`propose_document_create\`), edit existing (via \`propose_document_edit\`)



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
 */
export const PLAN_SYSTEM_RULES = `## Plan Structure



/**
 */
export const RESPONSE_STYLE = `## Response Style

