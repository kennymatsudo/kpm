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
import { buildToolDecisionTree } from './toolDocs';
import { PROMPT_REGISTRY_MAP } from './promptRegistry';

/**
 * Build view context section for mode-aware suggestions.
 * This is additive to existing response modes, providing UI context.
 */
function buildViewContextSection(currentView?: ChatViewMode): string {
  if (!currentView) return '';

  if (currentView === 'plan') {
    return `## Current View: Plan Mode
The user is on the planning canvas. Use \`modify_plan\` when they ask you to create, update, or reorganize items.`;
  }

  return `## Current View: Workspace
Default action: \`propose_document_create\` for new documents, \`propose_document_edit\` for existing files.`;
}

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
  const hasClaudeMd = claudeMdContent && claudeMdContent.trim().length > 0;

  // Prompt resolver: user override > registry default > hardcoded constant
  const getPrompt = (key: string): string => {
    if (getPromptContent) return getPromptContent(key);
    return PROMPT_REGISTRY_MAP.get(key)?.defaultContent ?? '';
  };


ID: \`${project.id}\` (use for all tool calls)
Phase: ${project.phase}
Project folder: \`${project.folder_path}\`
${buildViewContextSection(currentView)}
${getPrompt('system.constraints')}


${getPrompt('system.workspace')}

${hasAttachments ? buildAttachmentsSection(attachments) : ''}

${getPrompt('system.plan_rules')}


${getPrompt('system.response_style')}
${hasClaudeMd ? `

${claudeMdContent}
` : ''}
# Current Plan
${hasPlan
    ? planItems.length <= FULL_HIERARCHY_THRESHOLD
      ? `${planItems.length} items. IDs listed below — use directly.`
      : `${planItems.length} items. Root items below. Query \`filter_plan_items\` for others.`
    : 'Empty.'}
}
