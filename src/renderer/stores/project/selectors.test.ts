import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../../../shared/types';
import { selectFilteredPlannedItems } from './selectors';

function makePlanItem(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: 'item-1',
    project_id: 'project-1',
    parent_id: null,
    title: 'Item',
    description: null,
    intent: null,
    acceptance_criteria: null,
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
    external_status: null,
    status_category: 'not_started',
    external_url: null,
    external_parent_key: null,
    external_epic_key: null,
    external_assignee_id: null,
    external_assignee_name: null,
    external_assignee_avatar_url: null,
    external_creator_id: null,
    external_creator_name: null,
    external_creator_avatar_url: null,
    sync_source: 'local',
    last_synced_at: null,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('selectFilteredPlannedItems', () => {
  it('keeps local-only items visible when a people filter is active', () => {
    const items = [
      makePlanItem({ id: 'local', title: 'Local KPM task', external_key: null }),
      makePlanItem({
        id: 'assigned',
        title: 'Assigned tracker task',
        association_id: 'assoc-1',
        external_key: 'LIN-123',
        external_id: 'lin-123',
        external_type: 'linear',
        external_assignee_id: 'user-1',
        external_assignee_name: 'Kenny',
        sync_source: 'linear',
      }),
      makePlanItem({
        id: 'other',
        title: 'Other tracker task',
        association_id: 'assoc-1',
        external_key: 'LIN-456',
        external_id: 'lin-456',
        external_type: 'linear',
        external_assignee_id: 'user-2',
        external_assignee_name: 'Someone Else',
        sync_source: 'linear',
      }),
    ];

    const filtered = selectFilteredPlannedItems(
      items,
      new Set(),
      new Set(['assignee:user-1'])
    );

    expect(filtered.map((item) => item.id)).toEqual(['local', 'assigned']);
  });

  it('still applies status filters to local-only items', () => {
    const items = [
      makePlanItem({ id: 'local-not-started', external_key: null, status_category: 'not_started' }),
      makePlanItem({ id: 'local-in-progress', external_key: null, status_category: 'in_progress' }),
    ];

    const filtered = selectFilteredPlannedItems(
      items,
      new Set(['not_started']),
      new Set(['assignee:user-1'])
    );

    expect(filtered.map((item) => item.id)).toEqual(['local-in-progress']);
  });
});
