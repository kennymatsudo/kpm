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
    getTransitions: vi.fn(),
    transitionIssue: vi.fn(),
    getProjectStatuses: vi.fn(),
  };
}

function createService(overrides: {
  externalPlanItems?: Partial<Parameters<typeof createSyncService>[0]['externalPlanItems']>;
  tracker?: Partial<Parameters<typeof createSyncService>[0]['tracker']>;
} = {}) {
  return createSyncService({
    database: {} as never,
    planItems: {
      getByProject: vi.fn(() => []),
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
      bulkUpsertSnapshots: vi.fn(),
      bulkDeleteSnapshots: vi.fn(),
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
  });

  it('passes new item status_category into createFromExternal', () => {
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
          title: 'New done issue',
          description: null,
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
    }));
  });

  it('does not re-infer status_category from a Linear status name without state type during apply', () => {
    const updateFromExternal = vi.fn();
    const service = createService({ externalPlanItems: { updateFromExternal } });
    const cached = {
      id: 'plan-1',
      title: 'Existing',
      description: null,
      label: null,
      release_tag: null,
    } as PlanItem;
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
      result,
      new Map([['plan-1', cached]]),
      null
    );

    expect(updateFromExternal).toHaveBeenCalledWith('plan-1', {
      external_status: 'Custom Dev State',
    });
  });
});
