import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../../../shared/types';
import {
  buildCreateItemActions,
  buildPlanTaskEditActions,
  type PlanTaskEditDraft,
} from './planItemFormActions';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const PRIMARY_REPO_ID = '22222222-2222-4222-8222-222222222222';
const AFFECTED_REPO_ID = '33333333-3333-4333-8333-333333333333';

function planItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: ITEM_ID,
    project_id: 'project-1',
    parent_id: null,
    title: 'Original title',
    description: 'Original context',
    intent: 'Original intent',
    acceptance_criteria: ['Original criterion'],
    work_brief_revision: 4,
    source_document_id: null,
    label: 'task',
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    primary_repo_id: PRIMARY_REPO_ID,
    affected_repo_ids: [],
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_status: null,
    status_category: 'not_started',
    external_url: null,
    sync_source: 'local',
    last_synced_at: null,
    ...overrides,
  } as PlanItem;
}

function editDraft(overrides: Partial<PlanTaskEditDraft> = {}): PlanTaskEditDraft {
  return {
    workBrief: {
      title: 'Original title',
      context: 'Original context',
      intent: 'Original intent',
      acceptance_criteria: ['Original criterion'],
    },
    repositoryScope: {
      primary_repo_id: PRIMARY_REPO_ID,
      affected_repo_ids: [],
    },
    label: 'task',
    ...overrides,
  };
}

describe('buildPlanTaskEditActions', () => {
  it('constructs only a revision-guarded full Work Brief replacement for a brief-only change', () => {
    const workBrief = {
      title: 'Revised title',
      context: 'Revised context',
      intent: 'Revised intent',
      acceptance_criteria: ['First revised criterion', 'Second revised criterion'],
    };

    expect(buildPlanTaskEditActions(planItem(), editDraft({ workBrief }))).toEqual([
      {
        type: 'revise_work_brief',
        item_id: ITEM_ID,
        expected_revision: 4,
        work_brief: workBrief,
      },
    ]);
  });

  it('constructs only a repository target replacement for a scope-only change', () => {
    const repositoryScope = {
      primary_repo_id: null,
      affected_repo_ids: [AFFECTED_REPO_ID],
    };

    expect(buildPlanTaskEditActions(planItem(), editDraft({ repositoryScope }))).toEqual([
      {
        type: 'set_repo_targets',
        item_id: ITEM_ID,
        repository_scope: repositoryScope,
      },
    ]);
  });

  it('keeps Work Brief, Repository Scope, and generic operational changes in one action array', () => {
    expect(buildPlanTaskEditActions(planItem(), editDraft({
      workBrief: {
        title: 'Revised title',
        context: null,
        intent: null,
        acceptance_criteria: [],
      },
      repositoryScope: {
        primary_repo_id: AFFECTED_REPO_ID,
        affected_repo_ids: [PRIMARY_REPO_ID],
      },
      label: 'bug',
    }))).toEqual([
      {
        type: 'revise_work_brief',
        item_id: ITEM_ID,
        expected_revision: 4,
        work_brief: {
          title: 'Revised title',
          context: null,
          intent: null,
          acceptance_criteria: [],
        },
      },
      {
        type: 'set_repo_targets',
        item_id: ITEM_ID,
        repository_scope: {
          primary_repo_id: AFFECTED_REPO_ID,
          affected_repo_ids: [PRIMARY_REPO_ID],
        },
      },
      {
        type: 'update_item',
        item_id: ITEM_ID,
        updates: { label: 'bug' },
      },
    ]);
  });
});

describe('buildCreateItemActions', () => {
  it('preserves title-only quick create with empty optional values', () => {
    expect(buildCreateItemActions({
      title: 'Quick item',
      description: null,
      intent: null,
      acceptance_criteria: null,
      primary_repo_id: null,
      affected_repo_ids: [],
      label: null,
      parent_id: null,
      status_category: null,
    })).toEqual([
      {
        type: 'create_item',
        title: 'Quick item',
        description: undefined,
        intent: undefined,
        acceptance_criteria: undefined,
        primary_repo_id: null,
        affected_repo_ids: [],
        label: undefined,
        parent_id: null,
      },
    ]);
  });

  it('emits the compatible flat create payload and preserves status and position actions', () => {
    expect(buildCreateItemActions({
      title: 'Create unified editor',
      description: 'Shared tracker context',
      intent: 'Give users one clear brief.',
      acceptance_criteria: ['Create and edit use the same fields'],
      primary_repo_id: PRIMARY_REPO_ID,
      affected_repo_ids: [AFFECTED_REPO_ID],
      label: 'feature',
      parent_id: null,
      status_category: 'in_progress',
    }, { x: 120, y: 240 })).toEqual([
      {
        type: 'create_item',
        title: 'Create unified editor',
        description: 'Shared tracker context',
        intent: 'Give users one clear brief.',
        acceptance_criteria: ['Create and edit use the same fields'],
        primary_repo_id: PRIMARY_REPO_ID,
        affected_repo_ids: [AFFECTED_REPO_ID],
        label: 'feature',
        parent_id: null,
      },
      {
        type: 'update_item',
        item_id: '$1',
        updates: { status_category: 'in_progress' },
      },
      {
        type: 'set_position',
        item_id: '$1',
        x: 120,
        y: 240,
      },
    ]);
  });
});
