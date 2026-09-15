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
import type { ChatProvider, ChatSessionScope, TaskPromptTemplate } from '../../../shared/types';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';
import { FULL_HIERARCHY_THRESHOLD, buildItemReferenceTable } from './planFormatting';
import { buildPlanModificationsSection } from './modes';
import { buildToolDecisionTree } from './toolDocs';
import { buildAttachmentsSection } from './workspace';
import { resolveRegistryPrompt } from './promptRegistry';

function buildContinuationSection(history?: ContinuationTurn[]): string {
  if (!history || history.length === 0) return '';

  const turns = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
    .join('\n\n');

  return `# Prior Conversation (continued)

Your tool cache was reset since your last turn. Re-read files before citing their contents; anything the history below claims about a file may now be stale. The chat history is for context; the user's next message picks up from where it left off.

${turns}

---
`;
}

export function buildUserGlobalInstructionsSection(userGlobalInstructions?: string | null): string {
  const content = userGlobalInstructions?.trim();
  if (!content) return '';

  return `# User Global Preferences

The developer maintains these personal working preferences globally, in \`~/.claude/CLAUDE.md\`. Honor them in your replies and any content you author. Relative file references below resolve against \`~/.claude/\` and point at the developer's global files, not at this project's context file. Where they conflict with KPM's operating rules (write consent, plan/proposal tools, export boundaries), KPM's rules win.

${content}
`;
}

const VIEW_CONTEXT_SECTION = `## View Context
Each user message may begin with a \`[Context: …]\` line naming the view the user is in. In the plan, plan items are the default subject — use \`modify_plan\` when asked to create, update, or reorganize items. In the workspace, documents are the default subject — use \`propose_document_create\` for new documents and \`propose_document_edit\` for existing files. Plan tools remain available in both views.`;

function buildTaskCreationGuidance(taskPromptTemplate?: TaskPromptTemplate | null): string {
  const templateName = taskPromptTemplate?.name;
  const templateContent = taskPromptTemplate?.prompt_content?.trim();
  const activeTemplateSection = templateName && templateContent
    ? `\n\n### Active task template: ${templateName}\n\nFollow this template when writing new plan item titles and details. Map template sections into KPM's structured fields where appropriate: use \`intent\` for the concise outcome, \`acceptance_criteria\` for acceptance criteria, and \`description\` for the synced markdown body.\n\n${templateContent}`
    : '';

  return `## Plan Item Creation

When creating implementation items, use clear verb-first titles, a one-sentence \`intent\`, and testable \`acceptance_criteria\`. \`description\` is the only field that syncs to Jira and Linear, so keep it high-level prose a product manager can read, and keep implementation detail — file paths, function names, test commands — in \`intent\` and \`acceptance_criteria\`, which stay local to KPM. \`@plan/<uuid>\` refs are fine anywhere, because KPM rewrites them at the export boundary.${activeTemplateSection}`;
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
/**
 * The focus-mode rules for a provider whose own tools KPM does not name. Claude
 * gets `CLAUDE_FOCUS_OPERATING_RULES` instead, because it can be told which of
 * its built-in tools to use; the parity test forbids naming those to anyone
 * else.
 */
const FOCUS_OPERATING_RULES = `# Operating Rules
- This session is focused on one document. Direct file, shell, and git writes need the project's write grant; project files change through KPM's proposal tools.
- Jira, Linear, Confluence, and GitHub exports must not leak KPM-local fields or @plan internals.
- Plan data lives in KPM SQLite, not in connected repos.
- If the user asks to change the plan, use KPM plan tools so changes flow through KPM's proposal and review path.
- For document, project-context, move, or delete requests, use KPM proposal tools rather than editing files directly.
- Keep replies concise and utilitarian.`;

/** Claude's focus rules name its built-in tools, which is why they are not the shared set. */
const CLAUDE_FOCUS_OPERATING_RULES = `# Operating Rules
- Answer from the focused document first.
- Use KPM project-file tools when you need other project documents.
- Use Read/Grep/Glob for connected repo validation and cite file paths when you reference code.
- Direct file, shell, and git writes need the project's write grant, requested on the first attempt. This focused session is for the document — do not change repo files unless the user asks.
- To change project documents, use \`propose_document_edit\` or \`propose_document_create\`.
- To change project context files, use \`propose_context_edit\`.
- All document and context changes from this focused session must go through KPM review before applying.
- Do not create or modify plan items unless the user explicitly asks.
- Keep replies concise and utilitarian.`;

const FOCUS_PLAN_REFERENCES = `## Plan References
Use \`@plan/<uuid>\` when referring to plan items in markdown. Only use UUIDs listed in the current plan above.`;

/**
 * What one provider adds to the shared composition. `prelude` is the only place
 * a provider's own tool surface may be described.
 */
interface PromptProfile {
  identity: string;
  prelude?: string;
}

const PROMPT_PROFILES: Record<'codex' | 'pi', PromptProfile> = {
  codex: {
    identity: "You are Codex running inside KPM's main chat. Help the user understand codebases, plan work, and reason across connected repos.",
    prelude: `# MCP Tool Selection
- When the user explicitly names an MCP server, call that server's tool directly. For example, a request for Playwright must use an \`mcp__playwright__*\` tool.
- Do not substitute a shell check, web search, or another browser tool for an explicitly named MCP server.
- If that tool call fails, report its exact error. Do not claim that a browser is unavailable unless the named browser tool returned that error.`,
  },
  pi: {
    identity: "You are pi running inside KPM's main chat. Help the user understand codebases, plan work, and reason across connected repos.",
  },
};

/**
 * The system prompt for one chat, composed once for every provider.
 *
 * Claude keeps its own templates: it is the only provider whose built-in tool
 * names KPM may reference, and its main prompt carries sections (tool decision
 * tree, attachments, task-creation guidance) that would leak those names.
 * Everything else shares one composition, so a section added for one non-Claude
 * provider cannot silently skip the other.
 */
export function buildChatSystemPrompt(
  context: PlanContext,
  audience: { provider: ChatProvider; scope: ChatSessionScope },
): string {
  if (audience.provider === 'claude') {
    return audience.scope === 'focus_document'
      ? buildFocusSystemPrompt(context)
      : buildSystemPrompt(context);
  }

  const profile = PROMPT_PROFILES[audience.provider];
  const isFocus = audience.scope === 'focus_document';
  const repos = context.repos.length > 0
    ? context.repos.map((repo) => `- \`${resolveEffectiveRepoPath(repo)}\``).join('\n')
    : 'No repos connected.';
  const planSummary = context.planItems.length > 0 ? buildItemReferenceTable(context.planItems) : 'Empty.';
  const continuationSection = buildContinuationSection(context.continuationHistory);
  const continuation = continuationSection ? `\n${continuationSection}` : '';
  const focusDocument = context.focusDocument
    ? `\n# Focused Document\nPath: \`${context.focusDocument.path}\`\nTitle: ${context.focusDocument.title}\n\n<document>\n${context.focusDocument.content}\n</document>\n`
    : '';
  const projectContext = context.contextFileContent?.trim()
    ? `\n# Project Context\n\n${context.contextFileContent.trim()}\n`
    : '';
  const userPrefsSection = buildUserGlobalInstructionsSection(context.userGlobalInstructions);
  const userPrefs = userPrefsSection ? `\n${userPrefsSection}` : '';
  const operatingRules = isFocus
    ? FOCUS_OPERATING_RULES
    : [
        resolveRegistryPrompt('system.grounding', context.getPromptContent),
        resolveRegistryPrompt('system.constraints', context.getPromptContent),
        buildPlanModificationsSection(),
        resolveRegistryPrompt('system.workspace', context.getPromptContent),
        resolveRegistryPrompt('system.plan_rules', context.getPromptContent),
        resolveRegistryPrompt('system.response_style', context.getPromptContent),
      ].join('\n\n');
  const planRefs = isFocus ? FOCUS_PLAN_REFERENCES : buildPlanReferenceRulesSection();

  return `${profile.identity}
${profile.prelude ? `\n${profile.prelude}\n` : ''}
${operatingRules}

# Project
Name: ${context.project.name}
ID: \`${context.project.id}\`
Project folder: \`${context.project.folder_path}\`

Connected repos:
${repos}
${continuation}${focusDocument}${projectContext}${userPrefs}
# Current Plan
${context.planItems.length} items.
${planSummary}

${planRefs}`;
}

export function buildSystemPrompt(context: PlanContext): string {
  const { project, repos, attachments, planItems, taskPromptTemplate, contextFileContent, userGlobalInstructions, getPromptContent, continuationHistory } = context;

  const hasAttachments = attachments.length > 0;
  const hasRepos = repos.length > 0;
  const hasPlan = planItems.length > 0;
  const hasContextFile = contextFileContent && contextFileContent.trim().length > 0;

  const getPrompt = (key: string): string => resolveRegistryPrompt(key, getPromptContent);

  return `You are a technical partner in KPM. Help the user investigate codebases, reason across connected repos, plan and sequence work, keep project documents current, and carry out the changes they ask for.

${buildContinuationSection(continuationHistory)}# Project: ${project.name}
ID: \`${project.id}\` (use for all tool calls)
Project folder: \`${project.folder_path}\`
${hasRepos ? `Connected repos (ground truth for code):\n${repos.map(r => `- ID: \`${r.id}\` — path: \`${resolveEffectiveRepoPath(r)}\``).join('\n')}` : 'No repos connected.'}
Your file tools can also read any other folder on disk when the user points you at one — you are not limited to the project folder and connected repos for reading.

${getPrompt('system.grounding')}

${VIEW_CONTEXT_SECTION}

${getPrompt('system.constraints')}

${buildPlanModificationsSection()}

${getPrompt('system.workspace')}

${hasAttachments ? buildAttachmentsSection(attachments) : ''}
${buildToolDecisionTree(project.id)}

${getPrompt('system.plan_rules')}

${buildTaskCreationGuidance(taskPromptTemplate)}

${getPrompt('system.response_style')}
${buildUserGlobalInstructionsSection(userGlobalInstructions)}${hasContextFile ? `
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

${buildPlanReferenceRulesSection()}`;
}

export function buildPlanReferenceRulesSection(): string {
  return `## Plan References

Use \`@plan/<uuid>\` to reference a plan item inside any markdown you author (chat replies, plan-item description / intent / acceptance_criteria, document-edit proposals). KPM renders these as live chips that show the item's current title and status, and rewrites them to native syntax (Jira smart link, Linear URL, GitHub \`Closes ENG-123\`) on export.

Rules:
- Only use UUIDs from the **Item Reference** above, or from the **Focused Selection** section (focused plan items are always valid refs even when the plan is too large to list in full). KPM rejects unknown UUIDs at save — do not invent or guess.
- Refs work mid-prose: "After @plan/<uuid>, we can…" is fine.
- Don't put refs inside fenced code blocks — they won't resolve.
- Prefer a ref over restating the item's title or external key in prose; readers get a live chip.`;
}

export function buildFocusSystemPrompt(context: PlanContext): string {
  const { project, repos, focusDocument, userGlobalInstructions, continuationHistory } = context;
  const connectedRepos = repos.length > 0
    ? repos.map((repo) => `- ID: \`${repo.id}\` — path: \`${resolveEffectiveRepoPath(repo)}\``).join('\n')
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

${buildContinuationSection(continuationHistory)}# Project
Name: ${project.name}
ID: \`${project.id}\`
Project folder: \`${project.folder_path}\`

Connected repos:
${connectedRepos}
Read/Grep/Glob can also reach any other folder on disk when the user points you at one.

${focusedDocumentSection}

${buildUserGlobalInstructionsSection(userGlobalInstructions)}${CLAUDE_FOCUS_OPERATING_RULES}`;
}
