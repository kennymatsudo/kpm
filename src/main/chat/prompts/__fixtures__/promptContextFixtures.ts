import type { PlanContext } from '../types';
import type { PlanItem } from '../../../../shared/types';

export function makePlanItem(id: string, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id,
    parent_id: null,
    title: 'Untitled',
    description: null,
    intent: null,
    acceptance_criteria: null,
    work_brief_revision: 1,
    source_document_id: null,
    label: null,
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_parent_key: null,
    external_epic_key: null,
    external_status: null,
    status_category: null,
    external_url: null,
    sync_source: 'local',
    last_synced_at: null,
    ...overrides,
  };
}

export const richMainFixture: PlanContext = {
  project: {
    id: 'project-main',
    name: 'Export Pipeline',
    folder_path: '/tmp/project-main',
    phase: 'discovery',
    session_tokens: 0,
    session_input_tokens: 0,
    session_output_tokens: 0,
  },
  repos: [
    { id: 'repo-1', project_id: 'project-main', path: '/tmp/repo-1' },
    { id: 'repo-2', project_id: 'project-main', path: '/tmp/repo-2' },
  ],
  attachments: [
    {
      id: 'att-1',
      project_id: 'project-main',
      path: '/tmp/project-main/attachments/spec.md',
      filename: 'spec.md',
    },
  ],
  planItems: [
    makePlanItem('11111111-1111-4111-8111-111111111111', {
      title: 'Ship export pipeline',
      item_order: 0,
    }),
    makePlanItem('22222222-2222-4222-8222-222222222222', {
      title: 'Add tracker adapter',
      parent_id: '11111111-1111-4111-8111-111111111111',
      item_order: 0,
    }),
  ],
  focusedResources: [],
  taskPromptTemplate: {
    id: 'tpl-1',
    project_id: 'project-main',
    name: 'Standard',
    prompt_content: 'Write clear acceptance criteria.',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  contextFileContent: '# Project notes\nUse the shared client.',
  userGlobalInstructions: 'Lead with the answer.',
};

export const focusFixture: PlanContext = {
  project: {
    id: 'project-1',
    name: 'Test Project',
    folder_path: '/tmp/project-1',
    phase: 'discovery',
    session_tokens: 0,
    session_input_tokens: 0,
    session_output_tokens: 0,
  },
  repos: [{ id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1' }],
  attachments: [],
  planItems: [],
  focusedResources: [],
  focusDocument: {
    path: '/tmp/project-1/notes/spec.md',
    title: 'Focused Spec Document',
    content: 'The focused document body describes the export boundary.',
  },
  continuationHistory: [
    { role: 'user', content: 'What did we decide about exports?' },
    { role: 'assistant', content: 'We translate at the export boundary.' },
  ],
};
