/**
 * Board agent prompt assembly — pure text transforms over plan-item/project
 * data, no I/O. Split out of DevSessionService.ts so prompt-format changes
 * don't require touching worktree/git/lifecycle code, and so these functions
 * can be unit-tested without a DB or git fixture.
 */

import type { AgentEffortLevel, PlanItem, Project } from '../../../shared/types';
import type { AgentType } from '../../../shared/agent-types';
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

const CURRENT_WORK_BRIEF_START = '<current-work-brief>';
const CURRENT_WORK_BRIEF_END = '</current-work-brief>';

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

export function buildBoardProviderPrompt(
  agentType: AgentType,
  roleSystemPrompt: string,
  taskPrompt: string,
): string {
  return agentType === 'claude' || agentType === 'pi'
    ? taskPrompt
    : [roleSystemPrompt, taskPrompt].filter(Boolean).join('\n\n');
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

export function buildWorkBriefReconciliation(
  input: AgentContextInput,
  previousRevision: number | null,
  planRefSection = '',
): string {
  const revisionChange = previousRevision == null
    ? `The approved Work Brief is now revision ${input.item.work_brief_revision}.`
    : `The approved Work Brief changed from revision ${previousRevision} to revision ${input.item.work_brief_revision}.`;

  return [
    CURRENT_WORK_BRIEF_START,
    '## Current Work Brief',
    revisionChange,
    'This is the authoritative task contract. It supersedes conflicting task facts from earlier turns.',
    planRefSection.trim(),
    buildAgentContext(input),
    CURRENT_WORK_BRIEF_END,
  ].join('\n\n');
}

export function replaceCurrentWorkBrief(
  initialInstructions: string,
  currentWorkBrief: string,
): string {
  const start = initialInstructions.indexOf(CURRENT_WORK_BRIEF_START);
  if (start === -1) {
    return [initialInstructions.trim(), currentWorkBrief].filter(Boolean).join('\n\n');
  }

  const end = initialInstructions.indexOf(CURRENT_WORK_BRIEF_END, start);
  if (end === -1) {
    return [initialInstructions.slice(0, start).trim(), currentWorkBrief].filter(Boolean).join('\n\n');
  }

  const suffixStart = end + CURRENT_WORK_BRIEF_END.length;
  return [
    initialInstructions.slice(0, start).trim(),
    currentWorkBrief,
    initialInstructions.slice(suffixStart).trim(),
  ].filter(Boolean).join('\n\n');
}

export function buildCommitHookRepairPrompt(hookOutput: string): string {
  return [
    'The git commit failed while running commit hooks.',
    '',
    'Fix only the issues shown in the hook output below.',
    'Do not broaden the task or refactor unrelated code.',
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
