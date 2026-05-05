import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../../tests/mocks/electron-api';
import { useSyncStore } from './useSyncStore';
describe('useSyncStore', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useSyncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('records incoming Jira updates without opening the review panel', async () => {
    api.tracker.sync.getPreview.mockResolvedValue({
      success: true,
      preview: {
        tracker_type: 'jira',
        link_id: 'assoc-1',
        external_project_key: 'PROJ',
        new_items: [],
        updated_items: [
          {
            plan_item_id: 'plan-1',
            external_key: 'PROJ-1',
            title: 'Update',
            changes: [
              {
                field: 'title',
                old_value: 'Old',
                new_value: 'New',
              },
            ],
          },
        ],
        conflicts: [],
        deleted_in_tracker: [],
        stats: {
          total: 1,
          new: 0,
          updated: 1,
          conflicts: 0,
          deleted: 0,
          unchanged: 0,
        },
      },
    });

    const result = await useSyncStore.getState().checkForUpdates('project-1', 'assoc-1');

    expect(result?.hasIncomingChanges).toBe(true);
    expect(result?.changeCount).toBe(1);
    expect(useSyncStore.getState().showPanel).toBe(false);
    expect(useSyncStore.getState().syncPreview).toBeNull();
    expect(useSyncStore.getState().syncAvailability['assoc-1']?.stats?.updated).toBe(1);
  });

  it('does not open review when Jira is already up to date', async () => {
    api.tracker.sync.getPreview.mockResolvedValue({
      success: true,
      preview: {
        tracker_type: 'jira',
        link_id: 'assoc-1',
        external_project_key: 'PROJ',
        new_items: [],
        updated_items: [],
        conflicts: [],
        deleted_in_tracker: [],
        stats: {
          total: 3,
          new: 0,
          updated: 0,
          conflicts: 0,
          deleted: 0,
          unchanged: 3,
        },
      },
    });

    await useSyncStore.getState().startSync('project-1', 'assoc-1');

    expect(useSyncStore.getState().showPanel).toBe(false);
    expect(useSyncStore.getState().syncPreview).toBeNull();
    expect(useSyncStore.getState().syncAvailability['assoc-1']).toMatchObject({
      hasIncomingChanges: false,
      changeCount: 0,
    });
  });

  it('reuses a fresh preview between polling and opening review', async () => {
    api.tracker.sync.getPreview.mockResolvedValue({
      success: true,
      preview: {
        tracker_type: 'jira',
        link_id: 'assoc-1',
        external_project_key: 'PROJ',
        new_items: [
          {
            external_id: '10001',
            external_key: 'PROJ-1',
            title: 'New issue',
            description: null,
            item_type: 'task',
            status: 'To Do',
            parent_external_key: null,
          },
        ],
        updated_items: [],
        conflicts: [],
        deleted_in_tracker: [],
        stats: {
          total: 1,
          new: 1,
          updated: 0,
          conflicts: 0,
          deleted: 0,
          unchanged: 0,
        },
      },
    });

    await useSyncStore.getState().checkForUpdates('project-1', 'assoc-1');
    await useSyncStore.getState().startSync('project-1', 'assoc-1');

    expect(api.tracker.sync.getPreview).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().showPanel).toBe(true);
    expect(useSyncStore.getState().syncPreview?.stats.new).toBe(1);
  });
});
