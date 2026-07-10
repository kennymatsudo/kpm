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

import type { PlanContext, ContinuationTurn } from './types';
import type { TaskPromptTemplate } from '../../../shared/types';
import { FULL_HIERARCHY_THRESHOLD, buildItemReferenceTable } from './planFormatting';
import { buildResponseModesSection } from './modes';
import { buildToolDecisionTree } from './toolDocs';
import { buildAttachmentsSection } from './workspace';
import { PROMPT_REGISTRY_MAP } from './promptRegistry';

function buildContinuationSection(history?: ContinuationTurn[]): string {
  if (!history || history.length === 0) return '';

  const turns = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
    .join('\n\n');

  return `# Prior Conversation (continued)

The user switched worktrees since your last turn, so your tool cache was reset. Re-read files before citing their contents — prior claims about file contents may reflect a different worktree. The chat history below is for context; the user's next message picks up from where it left off.

${turns}

---
`;
}

function buildApprovalBehaviorSection(): string {
  return `## Change Application

Depending on a user setting, KPM either queues your proposed changes for the user to review or applies them immediately. Propose changes with the appropriate change tool; do not state in your reply whether a review step will occur — refer to changes as proposed.`;
}

const VIEW_CONTEXT_SECTION = `## View Context
Each user message may begin with a \`[Context: …]\` line naming the view the user is in. On the planning canvas, plan items are the default subject — use \`modify_plan\` when asked to create, update, or reorganize items. In the workspace, documents are the default subject — use \`propose_document_create\` for new documents and \`propose_document_edit\` for existing files. Plan tools remain available in both views.`;

function buildTaskCreationGuidance(taskPromptTemplate?: TaskPromptTemplate | null): string {
  const templateName = taskPromptTemplate?.name;
  const templateContent = taskPromptTemplate?.prompt_content?.trim();
  const activeTemplateSection = templateName && templateContent
    ? `\n\n### Active task template: ${templateName}\n\nFollow this template when writing new plan item titles and details. Map template sections into KPM's structured fields where appropriate: use \`intent\` for the concise outcome, \`acceptance_criteria\` for acceptance criteria, and \`description\` for the synced markdown body.\n\n${templateContent}`
    : '';

  return `## Plan Item Creation

Only create or modify plan items when the user explicitly asks. When creating implementation items, use clear verb-first titles, a one-sentence \`intent\`, testable \`acceptance_criteria\`, and code references in \`description\` when repo exploration found relevant files. Keep synced descriptions free of KPM-local document paths and other local-only references.${activeTemplateSection}`;
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
  const { project, repos, attachments, planItems, taskPromptTemplate, contextFileContent, getPromptContent, continuationHistory } = context;

  const hasAttachments = attachments.length > 0;
  const hasRepos = repos.length > 0;
  const hasPlan = planItems.length > 0;
  const hasContextFile = contextFileContent && contextFileContent.trim().length > 0;

  // Prompt resolver: user override > registry default > hardcoded constant
  const getPrompt = (key: string): string => {
    if (getPromptContent) return getPromptContent(key);
    return PROMPT_REGISTRY_MAP.get(key)?.defaultContent ?? '';
  };

  return `You are a technical planning partner in KPM. Help developers understand codebases, break down work, and create actionable plans.

${buildContinuationSection(continuationHistory)}# Project: ${project.name}
ID: \`${project.id}\` (use for all tool calls)
Phase: ${project.phase}
Project folder: \`${project.folder_path}\`
${hasRepos ? `Connected repos (read-only; ground truth for code):\n${repos.map(r => `- \`${r.active_worktree_path ?? r.path}\``).join('\n')}` : 'No repos connected.'}
Read/Grep/Glob can also reach any other folder on disk when the user points you at one — you are not limited to the project folder and connected repos for reading.

${getPrompt('system.grounding')}

${VIEW_CONTEXT_SECTION}
${getPrompt('system.constraints')}

${buildApprovalBehaviorSection()}

${buildResponseModesSection(hasRepos, planItems, getPromptContent)}

${getPrompt('system.workspace')}

${hasAttachments ? buildAttachmentsSection(attachments) : ''}
${buildToolDecisionTree(project.id)}

${getPrompt('system.plan_rules')}

${buildTaskCreationGuidance(taskPromptTemplate)}

${getPrompt('system.response_style')}
${hasContextFile ? `
# Project Context

${contextFileContent}
` : ''}
# Current Plan
${hasPlan
    ? planItems.length <= FULL_HIERARCHY_THRESHOLD
      ? `${planItems.length} items. IDs listed below — use directly.`
      : `${planItems.length} items. Root items below. Query \`query_plan_items\` for others.`
    : 'Empty.'}
${buildItemReferenceTable(planItems)}

## Plan References

Use \`@plan/<uuid>\` to reference a plan item inside any markdown you author (chat replies, plan-item description / intent / acceptance_criteria, document-edit proposals). KPM renders these as live chips that show the item's current title and status, and rewrites them to native syntax (Jira smart link, Linear URL, GitHub \`Closes ENG-123\`) on export.

Rules:
- Only use UUIDs from the **Item Reference** above, or from the **Focused Selection** section (focused plan items are always valid refs even when the plan is too large to list in full). KPM rejects unknown UUIDs at save — do not invent or guess.
- Refs work mid-prose: "After @plan/<uuid>, we can…" is fine.
- Don't put refs inside fenced code blocks — they won't resolve.
- Prefer a ref over restating the item's title or external key in prose; readers get a live chip.`;
}

export function buildFocusSystemPrompt(context: PlanContext): string {
  const { project, repos, focusDocument } = context;
  const connectedRepos = repos.length > 0
    ? repos.map((repo) => `- \`${repo.active_worktree_path ?? repo.path}\``).join('\n')
    : 'No repos connected.';

  const focusedDocumentSection = focusDocument
    ? `# Focused Document
Path: \`${focusDocument.path}\`
Title: ${focusDocument.title}

<document>
${focusDocument.content}
</document>`
    : '# Focused Document\nNo focused document was provided.';

  return `You are a focused document assistant in KPM. The document below is already loaded and is the user's implicit subject unless they ask about something else.

# Project
Name: ${project.name}
ID: \`${project.id}\`
Project folder: \`${project.folder_path}\`

Connected repos (read-only):
${connectedRepos}
Read/Grep/Glob can also reach any other folder on disk when the user points you at one.

${focusedDocumentSection}

# Operating Rules
- Answer from the focused document first.
- Use KPM project-file tools when you need other project documents.
- Use Read/Grep/Glob for connected repo validation and cite file paths when you reference code.
- Connected repos are read-only in chat. Do not modify repo files.
- To change project documents, use \`propose_document_edit\` or \`propose_document_create\`.
- To change project context files, use \`propose_context_edit\`.
- All document and context changes from this focused session must go through KPM review before applying.
- Do not create or modify plan items unless the user explicitly asks.
- Keep replies concise and utilitarian.`;
}
