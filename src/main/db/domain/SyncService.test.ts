import { describe, expect, it, vi } from 'vitest';
import { createSyncService } from './SyncService';
import type { ExternalIssue, TrackerClient } from '../../tracker-clients';
import type { PlanItem } from '../../../shared/types';

function createIssue(overrides: Partial<ExternalIssue> = {}): ExternalIssue {
  return {
    key: overrides.key ?? 'ENG-1',
    id: overrides.id ?? 'issue-1',
    title: overrides.title ?? 'Linear issue',
    description: overrides.description ?? null,
    issueType: overrides.issueType ?? 'Issue',
    status: overrides.status ?? 'Custom Dev State',
    statusType: overrides.statusType,
    parentKey: overrides.parentKey ?? null,
    epicKey: overrides.epicKey ?? null,
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    url: overrides.url ?? 'https://linear.app/example/issue/ENG-1',
    assignee: overrides.assignee ?? null,
    creator: overrides.creator ?? null,
  };
}

function createClient(issue: ExternalIssue): TrackerClient {
  return {
    type: 'linear',
    documentCodec: {
      toExternal: (value) => value ?? null,
      fromExternal: (value) => typeof value === 'string' ? value : null,
    },
    testConnection: vi.fn(),
    getAvailableProjects: vi.fn(),
    async *fetchIssues() {},
    fetchIssuesByJql: vi.fn(async function* () {
      yield issue;
    }),
    fetchIssue: vi.fn(),
    searchIssues: vi.fn(),
    searchIssuesByText: vi.fn(async () => []),
    getRecentIssues: vi.fn(async () => []),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
    getTransitions: vi.fn(),
    transitionIssue: vi.fn(),
    getProjectStatuses: vi.fn(),
  };
}

function createService(overrides: {
  externalPlanItems?: Partial<Parameters<typeof createSyncService>[0]['externalPlanItems']>;
  tracker?: Partial<Parameters<typeof createSyncService>[0]['tracker']>;
  sync?: Partial<Parameters<typeof createSyncService>[0]['sync']>;
  outboundChanges?: Partial<Parameters<typeof createSyncService>[0]['outboundChanges']>;
} = {}) {
  return createSyncService({
    database: {} as never,
    planItems: {
      getByProject: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    } as never,
    externalPlanItems: {
      getLinkedItems: vi.fn(() => []),
      createFromExternal: vi.fn(),
      updateFromExternal: vi.fn(),
      linkSubtasksToParentIssues: vi.fn(),
      unlinkFromExternal: vi.fn(),
      ...overrides.externalPlanItems,
    } as never,
    sync: {
      getSnapshotsByItemIds: vi.fn(() => new Map()),
      upsertSnapshot: vi.fn(),
      bulkDeleteSnapshots: vi.fn(),
      ...overrides.sync,
    } as never,
    tracker: {
      getAssociationById: vi.fn(() => ({
        id: 'assoc-1',
        kpm_project_id: 'project-1',
        scope_id: 'scope-1',
        issue_filter: JSON.stringify({ teamKey: 'ENG' }),
        display_name: 'Engineering',
        status_mapping: null,
        custom_field_values: null,
        epic_key: null,
        last_synced_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        tracker_type: 'linear',
        project_key: 'ENG',
        project_name: 'Engineering',
        site_url: 'linear.app',
      })),
      updateAssociationLastSynced: vi.fn(),
      ...overrides.tracker,
    } as never,
    outboundChanges: {
      getByAssociation: vi.fn(() => []),
      updateStatusCategory: vi.fn(),
      ...overrides.outboundChanges,
    },
  });
}

describe('SyncService', () => {
  it('adds inferred status_category to new items from Linear state type', async () => {
    const service = createService();
    const issue = createIssue({ status: 'Custom Dev State', statusType: 'started' });

    const preview = await service.generateSyncPreview(
      'project-1',
      'assoc-1',
      createClient(issue)
    );

    expect(preview.new_items[0]?.status_category).toBe('in_progress');
    expect(preview.new_items[0]?.external_id).toBe(issue.id);
  });

  it('passes new item status_category and external id into createFromExternal', () => {
    const createFromExternal = vi.fn(() => ({ id: 'created-1' } as PlanItem));
    const service = createService({ externalPlanItems: { createFromExternal } });
    const result = { success: true, created: 0, updated: 0, deleted: 0, errors: [] };

    service.applyNewItems(
      'project-1',
      {
        tracker_type: 'linear',
        link_id: 'assoc-1',
        external_project_key: 'ENG',
        new_items: [{
          external_key: 'ENG-1',
          external_id: 'issue-eng-1',
          title: 'New done issue',
          description: null,
          tracker_state: { title: 'New done issue', description: null, updatedAt: '2026-01-01T00:00:00.000Z' },
          label: null,
          external_issue_type: 'Issue',
          external_status: 'Done',
          status_category: 'done',
          external_url: 'https://linear.app/example/issue/ENG-1',
          external_parent_key: null,
          external_epic_key: null,
        }],
        updated_items: [],
        conflicts: [],
        deleted_in_tracker: [],
        stats: { total: 1, new: 1, updated: 0, conflicts: 0, deleted: 0, unchanged: 0 },
      },
      result
    );

    expect(createFromExternal).toHaveBeenCalledWith(expect.objectContaining({
      status_category: 'done',
      external_id: 'issue-eng-1',
    }));
  });

  it('snapshots the tracker values when a conflict is resolved by keeping the local edit', () => {
    const upsertSnapshot = vi.fn();
    const service = createService({ sync: { upsertSnapshot } });
    const result = { success: true, created: 0, updated: 0, deleted: 0, errors: [] };

    service.applyConflictResolutions(
      {
        tracker_type: 'linear',
        link_id: 'assoc-1',
        external_project_key: 'ENG',
        new_items: [],
        updated_items: [],
        conflicts: [{
          plan_item_id: 'plan-1',
          external_key: 'ENG-1',
          title: 'My title',
          tracker_state: { title: 'Their title', description: 'Their body', updatedAt: '2026-01-02T00:00:00.000Z' },
          fields: [{ field: 'title', your_value: 'My title', tracker_value: 'Their title' }],
        }],
        deleted_in_tracker: [],
        stats: { total: 1, new: 0, updated: 0, conflicts: 1, deleted: 0, unchanged: 0 },
      },
      new Map([['plan-1', 'keep_mine' as const]]),
      result
    );

    expect(upsertSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      snapshot_title: 'Their title',
      snapshot_description: 'Their body',
      external_updated_at: '2026-01-02T00:00:00.000Z',
    }));
  });

  it('applies the tracker value when a conflict is resolved by taking theirs', () => {
    const updateFromExternal = vi.fn();
    const service = createService({ externalPlanItems: { updateFromExternal } });
    const result = { success: true, created: 0, updated: 0, deleted: 0, errors: [] };

    service.applyConflictResolutions(
      {
        tracker_type: 'linear',
        link_id: 'assoc-1',
        external_project_key: 'ENG',
        new_items: [],
        updated_items: [],
        conflicts: [{
          plan_item_id: 'plan-1',
          external_key: 'ENG-1',
          title: 'My title',
          tracker_state: { title: 'Their title', description: 'Their body', updatedAt: '2026-01-02T00:00:00.000Z' },
          fields: [{ field: 'title', your_value: 'My title', tracker_value: 'Their title' }],
        }],
        deleted_in_tracker: [],
        stats: { total: 1, new: 0, updated: 0, conflicts: 1, deleted: 0, unchanged: 0 },
      },
      new Map([['plan-1', 'use_theirs' as const]]),
      result
    );

    expect(updateFromExternal).toHaveBeenCalledWith('plan-1', { title: 'Their title' });
    expect(result.updated).toBe(1);
  });

  it('writes only the fields present in the change list, without inferring extras', () => {
    const updateFromExternal = vi.fn();
    const service = createService({ externalPlanItems: { updateFromExternal } });
    const result = { success: true, created: 0, updated: 0, deleted: 0, errors: [] };

    service.applyUpdates(
      {
        tracker_type: 'linear',
        link_id: 'assoc-1',
        external_project_key: 'ENG',
        new_items: [],
        updated_items: [{
          plan_item_id: 'plan-1',
          external_key: 'ENG-1',
          title: 'Existing',
          tracker_state: { title: 'Existing', description: null, updatedAt: '2026-01-01T00:00:00.000Z' },
          changes: [{
            field: 'external_status',
            old_value: 'Old custom state',
            new_value: 'Custom Dev State',
          }],
        }],
        conflicts: [],
        deleted_in_tracker: [],
        stats: { total: 1, new: 0, updated: 1, conflicts: 0, deleted: 0, unchanged: 0 },
      },
      result
    );

    expect(updateFromExternal).toHaveBeenCalledWith('plan-1', {
      external_status: 'Custom Dev State',
    });
  });

  describe('local status waiting to export', () => {
    const linkedItem = {
      id: 'plan-1',
      title: 'Linear issue',
      description: null,
      status_category: 'done',
      external_key: 'ENG-1',
      external_status: 'In Review',
    } as PlanItem;
    const inReview = createIssue({ status: 'In Review', statusType: 'started' });
    const mapping = { in_review: 'In Review', done: 'Done' };

    it('reports a conflict instead of overwriting the queued status', () => {
      const analysis = createService().analyzeChanges(linkedItem, inReview, null, mapping, 'done');

      expect(analysis.conflicts).toEqual([{ field: 'status', your_value: 'Done', tracker_value: 'In Review' }]);
      expect(analysis.updates).toEqual([]);
      expect(analysis.trackerStatusCategory).toBe('in_review');
    });

    it('still takes the tracker status when nothing local is queued', () => {
      const analysis = createService().analyzeChanges(linkedItem, inReview, null, mapping);

      expect(analysis.conflicts).toEqual([]);
      expect(analysis.updates).toEqual([{ field: 'status_category', old_value: 'done', new_value: 'in_review' }]);
    });

    it('moves the queued status to the tracker value when the tracker wins', () => {
      const updateFromExternal = vi.fn();
      const updateStatusCategory = vi.fn();
      const service = createService({
        externalPlanItems: { updateFromExternal },
        outboundChanges: {
          getByAssociation: vi.fn(() => [{
            id: 'queue-1',
            plan_item_id: 'plan-1',
            operation: 'update',
            target_status_category: 'done',
          }]) as never,
          updateStatusCategory,
        },
      });
      const result = { success: true, created: 0, updated: 0, deleted: 0, errors: [] };

      service.applyConflictResolutions(
        {
          tracker_type: 'linear',
          link_id: 'assoc-1',
          external_project_key: 'ENG',
          new_items: [],
          updated_items: [],
          conflicts: [{
            plan_item_id: 'plan-1',
            external_key: 'ENG-1',
            title: 'Linear issue',
            tracker_state: { title: 'Linear issue', description: null, updatedAt: '2026-01-02T00:00:00.000Z' },
            fields: [{ field: 'status', your_value: 'Done', tracker_value: 'In Review' }],
            changes: [{ field: 'external_assignee_name', old_value: null, new_value: 'Ada' }],
            tracker_status_category: 'in_review',
          }],
          deleted_in_tracker: [],
          stats: { total: 1, new: 0, updated: 0, conflicts: 1, deleted: 0, unchanged: 0 },
        },
        new Map([['plan-1', 'use_theirs' as const]]),
        result
      );

      expect(updateFromExternal).toHaveBeenCalledWith('plan-1', { external_assignee_name: 'Ada' });
      expect(updateFromExternal).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
      expect(updateStatusCategory).toHaveBeenCalledWith('queue-1', 'in_review');
    });

    it('leaves the item and its queued status alone when the local status is kept', () => {
      const updateFromExternal = vi.fn();
      const updateStatusCategory = vi.fn();
      const service = createService({ externalPlanItems: { updateFromExternal }, outboundChanges: { updateStatusCategory } });
      const result = { success: true, created: 0, updated: 0, deleted: 0, errors: [] };

      service.applyConflictResolutions(
        {
          tracker_type: 'linear',
          link_id: 'assoc-1',
          external_project_key: 'ENG',
          new_items: [],
          updated_items: [],
          conflicts: [{
            plan_item_id: 'plan-1',
            external_key: 'ENG-1',
            title: 'Linear issue',
            tracker_state: { title: 'Linear issue', description: null, updatedAt: '2026-01-02T00:00:00.000Z' },
            fields: [{ field: 'status', your_value: 'Done', tracker_value: 'In Review' }],
            tracker_status_category: 'in_review',
          }],
          deleted_in_tracker: [],
          stats: { total: 1, new: 0, updated: 0, conflicts: 1, deleted: 0, unchanged: 0 },
        },
        new Map([['plan-1', 'keep_mine' as const]]),
        result
      );

      expect(updateFromExternal).not.toHaveBeenCalled();
      expect(updateStatusCategory).not.toHaveBeenCalled();
    });
  });
});
