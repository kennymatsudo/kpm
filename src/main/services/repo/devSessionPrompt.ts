/**
 * Board agent prompt assembly — pure text transforms over plan-item/project
 * data, no I/O. Split out of DevSessionService.ts so prompt-format changes
 * don't require touching worktree/git/lifecycle code, and so these functions
 * can be unit-tested without a DB or git fixture.
 */

import type { AgentEffortLevel, PlanItem, Project } from '../../../shared/types';
import { DEFAULT_CONTEXT_FILENAME, isPlaceholderContext } from '../../../shared/contextFile';
import type { Settings as SDKSettings } from '@anthropic-ai/claude-agent-sdk';

export interface AgentContextInput {
  item: PlanItem;
  project: Project;
  children: PlanItem[];
  parent: PlanItem | null;
}

type KnownDescriptionSection = 'acceptanceCriteria' | 'outOfScope' | 'dependencies' | 'codeReferences' | 'verification';

interface ParsedDescription {
  context: string | null;
  knownSections: Partial<Record<KnownDescriptionSection, string>>;
}

const DESCRIPTION_SECTION_MAP: Record<string, KnownDescriptionSection> = {
  'acceptance criteria': 'acceptanceCriteria',
  'out of scope': 'outOfScope',
  dependencies: 'dependencies',
  'code references': 'codeReferences',
  verification: 'verification',
};

function normalizeDescriptionHeading(heading: string): string {
  return heading.trim().replace(/#+$/, '').trim().toLowerCase();
}

function appendDescriptionBlock(current: string | undefined, block: string): string {
  return current ? `${current}\n\n${block}` : block;
}

function parseDescriptionSections(description: string | null): ParsedDescription {
  if (!description?.trim()) {
    return { context: null, knownSections: {} };
  }

  const knownSections: ParsedDescription['knownSections'] = {};
  const contextBlocks: string[] = [];
  const lines = description.trim().split(/\r?\n/);
  let currentKnown: KnownDescriptionSection | null = null;
  let currentContextHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const block = buffer.join('\n').trim();
    buffer = [];
    if (!block) {
      currentKnown = null;
      currentContextHeading = null;
      return;
    }

    if (currentKnown) {
      knownSections[currentKnown] = appendDescriptionBlock(knownSections[currentKnown], block);
    } else if (currentContextHeading) {
      contextBlocks.push(`${currentContextHeading}\n${block}`);
    } else {
      contextBlocks.push(block);
    }

    currentKnown = null;
    currentContextHeading = null;
  };

  for (const line of lines) {
    const headingMatch = /^##\s+(.+)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      const normalized = normalizeDescriptionHeading(headingMatch[1]);
      const known = DESCRIPTION_SECTION_MAP[normalized];
      if (known) {
        currentKnown = known;
        currentContextHeading = null;
      } else {
        currentKnown = null;
        currentContextHeading = line.trim();
      }
      continue;
    }

    buffer.push(line);
  }

  flush();

  return {
    context: contextBlocks.length > 0 ? contextBlocks.join('\n\n') : null,
    knownSections,
  };
}

function splitMarkdownListItems(section: string | undefined): string[] {
  if (!section) return [];
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+(?:\[[ xX]\]\s*)?/, '').trim())
    .filter(Boolean);
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
  const sections: string[] = [];
  const parsedDescription = parseDescriptionSections(item.description);
  const parsedCriteria = splitMarkdownListItems(parsedDescription.knownSections.acceptanceCriteria);
  const acceptanceCriteria = item.acceptance_criteria && item.acceptance_criteria.length > 0
    ? item.acceptance_criteria
    : parsedCriteria;
  const hasCriteria = acceptanceCriteria.length > 0;

  // Task title
  sections.push(`# Task: ${item.title}`);

  // Tracker reference (just the key for commit messages)
  if (item.external_key) {
    sections.push(`**Ticket:** ${item.external_key}`);
  }

  // Intent — one-sentence commitment. What "done" means at a glance.
  if (item.intent) {
    sections.push('## Intent');
    sections.push(item.intent);
  }

  // Acceptance criteria — the contract the agent must satisfy.
  if (hasCriteria) {
    sections.push('## Acceptance Criteria');
    sections.push(acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n'));
  }

  // Promote execution-critical sections from the prose description so agents treat
  // them as constraints/verification, not undifferentiated background context.
  if (parsedDescription.knownSections.outOfScope) {
    sections.push('## Out of Scope');
    sections.push(parsedDescription.knownSections.outOfScope);
  }

  if (parsedDescription.knownSections.dependencies) {
    sections.push('## Dependencies');
    sections.push(parsedDescription.knownSections.dependencies);
  }

  // Description — rationale and context. Demoted to "Context" when structured fields carry the contract.
  if (parsedDescription.context) {
    sections.push(hasCriteria ? '## Context' : '## Description');
    sections.push(parsedDescription.context);
  } else if (!item.intent && !hasCriteria) {
    sections.push('## Description');
    sections.push('No description provided.');
  }

  // Sub-tasks
  if (children.length > 0) {
    sections.push('## Sub-tasks');
    sections.push(children.map((c) => `- [ ] ${c.title}`).join('\n'));
  }

  // Parent context (only title, not full description - task should be self-contained)
  if (parent) {
    sections.push('## Parent Context');
    sections.push(`This is part of: **${parent.title}**`);
  }

  // Code refs
  const relevantFiles = [
    ...(item.code_refs ?? []),
    ...splitMarkdownListItems(parsedDescription.knownSections.codeReferences),
  ];
  if (relevantFiles.length > 0) {
    sections.push('## Relevant Files');
    sections.push(Array.from(new Set(relevantFiles)).map((r) => `- ${r}`).join('\n'));
  }

  if (parsedDescription.knownSections.verification) {
    sections.push('## Verification');
    sections.push(parsedDescription.knownSections.verification);
  }

  // Instructions
  sections.push('---');
  sections.push('## Instructions');
  sections.push('Task input priority: Acceptance Criteria are the completion contract; Intent explains why the task exists; Out of Scope is a hard boundary; Context/Description is background, not extra scope; Additional User Instructions may constrain implementation but should not expand scope unless explicit.');
  sections.push('Execution order: inspect repo instructions and nearby code before editing; identify the smallest existing codepath to modify; implement the narrowest change that satisfies the task; run the most relevant verification available; stop after the task is satisfied and do not opportunistically refactor.');
  if (parsedDescription.knownSections.verification) {
    sections.push('Run the Verification command(s) above before finishing unless impossible. If you cannot run them, state why.');
  }
  sections.push(hasCriteria
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
