/**
 * MCP tool documentation for system prompts.
 *
 * Design principle: Decision tree over exhaustive docs.
 * Tools are self-documenting via MCP; the system prompt guides when to use them.
 * Detailed action schemas live in tool descriptions, not here.
 */

import type { ChatApprovalMode } from '../../../shared/appSettings';

/**
 * Tool decision tree - compact routing guide.
 */
export function buildToolDecisionTree(projectId: string, approvalMode: ChatApprovalMode): string {
  const actionHeading = approvalMode === 'auto_apply' ? 'Action tools apply immediately' : 'Action tools require user review';
  const deleteGuidance = approvalMode === 'auto_apply'
    ? 'delete immediately; use only when explicitly asked'
    : 'propose deletion for user confirmation; use only when explicitly asked';

  return `## Tools

Use \`projectId: "${projectId}"\` for all KPM tool calls.

- **Code facts:** use Grep/Glob/Read on connected repos. Do not use plan query tools for code exploration.
- **Plan facts:** use plan query tools only when the user asks about items, structure, status, blockers, or tracker links. Prefer \`batch_get_items\` for multiple IDs.
- **Project files:** use \`read_project_file\`, \`list_project_files\`, \`propose_document_create\`, and \`propose_document_edit\` for KPM project documents. When no specific file is given, list with \`recursive: true\` and use each file's \`summary\` to pick which documents to open before reading them in full; a missing \`summary\` means not-yet-indexed, not irrelevant, so read it when in doubt.
- **KPM changes:** ${actionHeading}. Use \`modify_plan\` for plan mutations, \`propose_context_edit\` for the project context file, and document proposal tools for project files.
- **Deletion:** \`delete_project_file\` will ${deleteGuidance}.
- **Read-heavy work:** use Grep/Glob/Read directly. Only use the \`explorer\` subagent via the Agent tool for broad searches spanning multiple repos simultaneously — not for reading project files, documents, or symbols within a single repo.
- **UI components:** if Storybook tools are configured, check existing components before proposing new ones.
- **External systems:** when the user references Slack, GitHub, Linear, or similar systems and tools are available, use those tools and report what you found.
- **Plan creation from code:** inspect relevant repo files first when implementation details matter, then include \`code_refs\` in created items.
- **Efficiency:** issue independent reads in parallel and gather enough evidence before answering or acting.
- **MCP result overflow:** when a tool call fails with "result exceeds maximum allowed tokens" and the error names a spill file under \`~/.claude/projects/\`, use \`read_spill_file\` to page the saved payload. Call it with just \`file_path\` first to get \`totalChars\`, then page with \`offset\`/\`length\` (up to 50 000 chars each) until \`hasMore\` is false. Do not abandon the data or re-query via a different tool.`;
}
