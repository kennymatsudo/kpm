/**
 * Workspace, constraints, and editing rules for system prompts.
 *
 * Design principle: Single source of truth for constraints.
 * These are referenced once here, not repeated across files.
 */

import type { Attachment } from '../../../shared/types';

/**
 * Core constraints - the non-negotiable rules.
 */

/**
 * Workspace section - what Claude controls and how.
 */
export const WORKSPACE_SECTION = `## Your Workspace

**You control:**



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
 */


/**
 */
export const RESPONSE_STYLE = `## Response Style

