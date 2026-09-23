import { describe, expect, it } from 'vitest';
import { trackerEndpoints } from './trackerEndpoints';

const trackerState = { title: 'From Linear', description: 'Body', updatedAt: '2026-09-23T00:00:00.000Z' };

const params = {
  projectId: '00000000-0000-4000-8000-000000000001',
  resolutions: { '00000000-0000-4000-8000-000000000003': 'use_theirs' },
  deletedAction: 'keep_local',
  preview: {
    tracker_type: 'linear',
    link_id: '00000000-0000-4000-8000-000000000002',
    external_project_key: 'ENG',
    new_items: [{
      external_key: 'ENG-1',
      external_id: 'linear-uuid-1',
      title: 'New',
      description: null,
      tracker_state: trackerState,
      external_issue_type: 'Issue',
      external_status: 'Todo',
      status_category: 'not_started',
      external_url: 'https://linear.app/x/issue/ENG-1',
      external_parent_key: null,
      external_epic_key: null,
    }],
    updated_items: [{
      plan_item_id: '00000000-0000-4000-8000-000000000004',
      external_key: 'ENG-2',
      title: 'Updated',
      tracker_state: trackerState,
      changes: [{ field: 'title', old_value: 'Old', new_value: 'Updated' }],
    }],
    conflicts: [{
      plan_item_id: '00000000-0000-4000-8000-000000000003',
      external_key: 'ENG-3',
      title: 'Conflict',
      tracker_state: trackerState,
      fields: [{ field: 'description', your_value: 'Mine', tracker_value: 'Theirs' }],
    }],
    deleted_in_tracker: [],
    stats: { total: 3, new: 1, updated: 1, conflicts: 1, deleted: 0, unchanged: 0 },
  },
};

describe('trackerEndpoints.sync.apply', () => {
  // Apply writes tracker_state as the new snapshot; if the schema strips it, every item throws.
  it('keeps the fields apply needs from each preview item', () => {
    const parsed = trackerEndpoints['sync.apply'].params.parse(params);

    expect(parsed.preview.new_items[0].tracker_state).toEqual(trackerState);
    expect(parsed.preview.new_items[0].external_id).toBe('linear-uuid-1');
    expect(parsed.preview.updated_items[0].tracker_state).toEqual(trackerState);
    expect(parsed.preview.conflicts[0].tracker_state).toEqual(trackerState);
  });
});
