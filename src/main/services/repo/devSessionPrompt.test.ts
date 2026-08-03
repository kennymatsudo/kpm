import { describe, expect, it } from 'vitest';
import type { PlanItem, Project } from '../../../shared/types';
import {
  buildAgentContext,
  buildBoardProviderPrompt,
  buildWorkBriefReconciliation,
  replaceCurrentWorkBrief,
} from './devSessionPrompt';

function item(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'item-1', project_id: 'project-1', parent_id: null, title: 'Task',
    description: null, intent: null, acceptance_criteria: null, work_brief_revision: 1,
    source_document_id: null, label: null, item_order: 0, code_refs: null,
    status: 'planned', release_tag: null, position_x: null, position_y: null,
    group_id: null, association_id: null, external_key: null, external_id: null,
    external_type: null, external_issue_type: null, external_status: null,
    status_category: 'not_started', external_url: null, external_parent_key: null,
    external_epic_key: null, sync_source: 'local', last_synced_at: null,
    ...overrides,
  };
}

const project = { id: 'project-1', name: 'Project' } as Project;

describe('buildAgentContext Work Brief projection', () => {
  it('treats an Acceptance Criteria heading inside context as ordinary context', () => {
    const prompt = buildAgentContext({
      item: item({
        description: 'Background\n\n## Acceptance Criteria\n\n- Legacy prose only',
        acceptance_criteria: ['Structured contract'],
      }),
      project,
      children: [],
      parent: null,
    });

    expect(prompt).toContain('## Acceptance Criteria\n\n- [ ] Structured contract');
    expect(prompt).toContain('## Context\n\nBackground\n\n## Acceptance Criteria\n\n- Legacy prose only');
    expect(prompt).not.toContain('- [ ] Legacy prose only');
    expect(prompt).not.toContain('## Instructions');
    expect(prompt).not.toContain('Do not commit');
  });
});

describe('buildBoardProviderPrompt', () => {
  it.each(['claude', 'pi'] as const)('uses native system instructions for %s', (agentType) => {
    expect(buildBoardProviderPrompt(agentType, 'ROLE', 'TASK')).toBe('TASK');
  });

  it.each(['codex', 'gemini'] as const)('prepends role instructions for %s', (agentType) => {
    expect(buildBoardProviderPrompt(agentType, 'ROLE', 'TASK')).toBe('ROLE\n\nTASK');
  });
});

describe('Work Brief reconciliation prompt', () => {
  it('marks the latest approved brief as authoritative', () => {
    const prompt = buildWorkBriefReconciliation({
      item: item({
        title: 'Revised task',
        work_brief_revision: 4,
        acceptance_criteria: ['Use the revised contract'],
      }),
      project,
      children: [],
      parent: null,
    }, 2);

    expect(prompt).toContain('changed from revision 2 to revision 4');
    expect(prompt).toContain('authoritative task contract');
    expect(prompt).toContain('Revised task');
    expect(prompt).toContain('Use the revised contract');
  });

  it('replaces the prior current brief while preserving other session instructions', () => {
    const first = buildWorkBriefReconciliation({
      item: item({ title: 'First revision', work_brief_revision: 2 }),
      project,
      children: [],
      parent: null,
    }, 1);
    const second = buildWorkBriefReconciliation({
      item: item({ title: 'Second revision', work_brief_revision: 3 }),
      project,
      children: [],
      parent: null,
    }, 2);

    const updated = replaceCurrentWorkBrief(
      `Original task\n\n${first}\n\n## Additional User Instructions\n\nKeep the API stable.`,
      second,
    );

    expect(updated).toContain('Original task');
    expect(updated).toContain('Second revision');
    expect(updated).toContain('Keep the API stable.');
    expect(updated).not.toContain('First revision');
    expect(updated.match(/<current-work-brief>/g)).toHaveLength(1);
  });
});
