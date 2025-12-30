/**
 * System prompt construction for Claude integration.
 *
 * Design principles (from Anthropic's context engineering guide):
 * - High-signal content only - no redundancy
 * - Examples over rules
 * - Progressive disclosure - let agent discover via exploration
 * - Clear organization with distinct sections
 */

// Re-export types
export type { PlanContext } from './types';

import { FULL_HIERARCHY_THRESHOLD, buildItemReferenceTable } from './planFormatting';
import { buildResponseModesSection } from './modes';

/**
 * Build the system prompt.
 *
 * Structure follows context engineering best practices:
 * 1. Identity & constraints (what Claude is, what it can't do)
 * 2. Current state (project, repos, plan)
 * 3. Response modes (how to behave)
 * 4. Tools (decision tree, not exhaustive docs)
 * 5. Reference (plan items, examples)
 */
export function buildSystemPrompt(context: PlanContext): string {

  const hasAttachments = attachments.length > 0;
  const hasRepos = repos.length > 0;
  const hasPlan = planItems.length > 0;


ID: \`${project.id}\` (use for all tool calls)
Phase: ${project.phase}



${hasAttachments ? buildAttachmentsSection(attachments) : ''}



# Current Plan
${hasPlan
    ? planItems.length <= FULL_HIERARCHY_THRESHOLD
      : `${planItems.length} items. Root items below. Query \`filter_plan_items\` for others.`
    : 'Empty.'}
}
