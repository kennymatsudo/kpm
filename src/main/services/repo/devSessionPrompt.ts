/**
 * Board agent prompt assembly — pure text transforms over plan-item/project
 * data, no I/O. Split out of DevSessionService.ts so prompt-format changes
 * don't require touching worktree/git/lifecycle code, and so these functions
 * can be unit-tested without a DB or git fixture.
 */

import type { AgentEffortLevel, PlanItem, Project } from '../../../shared/types';
import { DEFAULT_CONTEXT_FILENAME, isPlaceholderContext } from '../../../shared/contextFile';
import { workBriefFromPlanItem } from '../../../shared/workBrief';
import { projectWorkBriefToExecution } from '../../workBrief/projections';
import type { Settings as SDKSettings } from '@anthropic-ai/claude-agent-sdk';

export interface AgentContextInput {
  item: PlanItem;
  project: Project;
  children: PlanItem[];
  parent: PlanItem | null;
}

export type BoardClaudeModel = 'opus' | 'sonnet' | 'haiku';

export function resolveBoardEffort(
  model: BoardClaudeModel,
  requestedEffort: AgentEffortLevel | undefined,
): AgentEffortLevel | undefined {
  if (model !== 'opus' && (requestedEffort === 'xhigh' || requestedEffort === 'max')) {
    return 'high';
  }
  return requestedEffort;
}

export function buildBoardSdkSettings(): SDKSettings {
  return {
    disableWorkflows: true,
    workflowKeywordTriggerEnabled: false,
  };
}

/**
 * Build agent context from plan item data.
 * The worktree's own CLAUDE.md/AGENTS.md (the repo's, not KPM's project-level
 * one) is auto-read by the SDK, so it is not included here. KPM's project-level
 * context file is injected separately in `createAndStartFromBoard`, since the
 * worktree never contains it.
 *
 * Exported for unit testing.
 */
export function buildAgentContext(input: AgentContextInput): string {
  const { item, children, parent } = input;
  const workBrief = workBriefFromPlanItem(item);
  const sections: string[] = [projectWorkBriefToExecution(workBrief)];

  if (item.external_key) {
    sections.push(`**Ticket:** ${item.external_key}`);
  }

  if (children.length > 0) {
    sections.push('## Sub-tasks');
    sections.push(children.map((child) => `- [ ] ${child.title}`).join('\n'));
  }

  if (parent) {
    sections.push('## Parent Context');
    sections.push(`This is part of: **${parent.title}**`);
  }

  if (item.code_refs && item.code_refs.length > 0) {
    sections.push('## Relevant Files');
    sections.push(item.code_refs.map((reference) => `- ${reference}`).join('\n'));
  }

  sections.push('---');
  sections.push('## Instructions');
  sections.push('Task input priority: Acceptance Criteria are the completion contract; Intent explains the required outcome; Context is background, not extra scope; Additional User Instructions may constrain implementation but must not silently replace the captured contract.');
  sections.push('Execution order: inspect repo instructions and nearby code before editing; identify the smallest existing codepath to modify; implement the narrowest change that satisfies the task; run the most relevant verification available; stop after the task is satisfied and do not opportunistically refactor.');
  sections.push(workBrief.acceptance_criteria.length > 0
    ? 'Implement this task so that every acceptance criterion above is satisfied. In your final response, include a criterion-by-criterion status, exact verification performed, and any assumptions or follow-ups. Do not commit - I will review and commit the changes myself.'
    : 'Implement this task. In your final response, include what changed, exact verification performed, and any assumptions or follow-ups. Do not commit - I will review and commit the changes myself.');
  if (item.external_key) {
    sections.push(`Ticket reference for commits: **${item.external_key}**`);
  }

  return sections.join('\n\n');
}

/**
 * Wraps the project-level context file in the same <context-file> block
 * format `ContextFileService.buildContextPrefix` uses for explicitly attached
 * files. Excludes the still-untouched placeholder written at project creation.
 *
 * Exported for unit testing.
 */
export function buildProjectContextPrefix(
  contextFile: { content: string | null; filename?: string } | null,
): string {
  if (!contextFile?.content || isPlaceholderContext(contextFile.content)) {
    return '';
  }
  const filename = contextFile.filename ?? DEFAULT_CONTEXT_FILENAME;
  return `<context-file path="${filename}">\n${contextFile.content}\n</context-file>\n\n`;
}

function buildLegacyBoardPrompt(item: Pick<PlanItem, 'title' | 'description'>): string {
  const parts: string[] = [item.title];
  if (item.description) {
    parts.push('', item.description);
  }
  return parts.join('\n').trim();
}

/**
 * Build the board-start prompt around the canonical structured task context.
 * If the user leaves the board editor at its legacy default (title/description),
 * omit that duplicate text and rely on the structured context alone.
 */
export function buildBoardStartInstructions(
  input: AgentContextInput & { userPrompt?: string | null }
): string {
  const structuredContext = buildAgentContext(input);
  const normalizedUserPrompt = input.userPrompt?.trim() ?? '';
  const legacyDefaultPrompt = buildLegacyBoardPrompt(input.item);

  if (
    normalizedUserPrompt.length === 0
    || normalizedUserPrompt === input.item.title.trim()
    || normalizedUserPrompt === legacyDefaultPrompt
  ) {
    return structuredContext;
  }

  return [
    structuredContext,
    '## Additional User Instructions',
    normalizedUserPrompt,
  ].join('\n\n');
}

export function buildCommitHookRepairPrompt(hookOutput: string): string {
  return [
    'The git commit failed while running commit hooks.',
    '',
    'Fix only the issues shown in the hook output below. Do not commit.',
    'Do not broaden the task or refactor unrelated code.',
    'After making the fix, rerun the narrowest relevant check if one is clear from the output.',
    '',
    'In your final response, include:',
    '1. What changed',
    '2. The exact verification command you ran, or "not run" with the reason',
    '',
    'Commit hook output:',
    '```text',
    hookOutput.trim() || 'No hook output was captured.',
    '```',
  ].join('\n');
}
