import { describe, expect, it } from 'vitest';
import type { PlanItem, Project } from '../../../shared/types';
import { buildAgentContext } from './devSessionPrompt';

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
  });
});
