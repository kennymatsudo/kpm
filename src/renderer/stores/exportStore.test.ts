import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { emit } from './storeEvents';
import { useExportStore } from './tracker/useExportStore';

describe('export store', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useExportStore.getState().reset();
    vi.clearAllMocks();
  });

  it('removes a queue entry when a sync-review-item-removed event is emitted', async () => {
    useExportStore.setState({
      queueEntries: [
        {
          id: 'queue-1',
          kpm_project_id: 'project-1',
          plan_item_id: 'plan-1',
          association_id: 'assoc-1',
          operation: 'create',
          target_issue_type_id: 'epic',
          target_issue_type_name: 'Epic',
          target_parent_key: null,
          target_status_category: null,
          custom_field_overrides: null,
          queued_by: 'user',
          queued_at: '2024-01-01T00:00:00.000Z',
          error_message: null,
          plan_item: {
            id: 'plan-1',
            title: 'Plan item',
            description: null,
            label: null,
            parent_id: null,
            external_key: null,
            external_type: null,
          },
        },
      ],
      queueCount: 1,
      queueCountsByAssociation: { 'assoc-1': 1 },
      queuedItemIds: new Set(['plan-1']),
    });
    api.tracker.exportQueue.remove.mockResolvedValue({ success: true });

    emit({ type: 'sync-review-item-removed', payload: { queueEntryId: 'queue-1' } });
    await vi.waitFor(() => {
      expect(api.tracker.exportQueue.remove).toHaveBeenCalledWith({ queueEntryId: 'queue-1' });
    });

    expect(useExportStore.getState().queueEntries).toHaveLength(0);
  });

  it('updates custom field overrides when a sync-review-custom-field-overrides-updated event is emitted', async () => {
    useExportStore.setState({
      queueEntries: [
        {
          id: 'queue-1',
          kpm_project_id: 'project-1',
          plan_item_id: 'plan-1',
          association_id: 'assoc-1',
          operation: 'create',
          target_issue_type_id: 'epic',
          target_issue_type_name: 'Epic',
          target_parent_key: null,
          target_status_category: null,
          custom_field_overrides: null,
          queued_by: 'user',
          queued_at: '2024-01-01T00:00:00.000Z',
          error_message: null,
          plan_item: {
            id: 'plan-1',
            title: 'Plan item',
            description: null,
            label: null,
            parent_id: null,
            external_key: null,
            external_type: null,
          },
        },
      ],
      queueCount: 1,
      queueCountsByAssociation: { 'assoc-1': 1 },
      queuedItemIds: new Set(['plan-1']),
    });
    api.tracker.exportQueue.updateCustomFieldOverrides.mockResolvedValue({ success: true });

    emit({
      type: 'sync-review-custom-field-overrides-updated',
      payload: { queueEntryId: 'queue-1', overrides: { 'custom-field': 'value-1' } },
    });
    await vi.waitFor(() => {
      expect(api.tracker.exportQueue.updateCustomFieldOverrides).toHaveBeenCalledWith({
        queueEntryId: 'queue-1',
        customFieldOverrides: { 'custom-field': 'value-1' },
      });
    });

    expect(useExportStore.getState().queueEntries[0]?.custom_field_overrides).toEqual({
      'custom-field': 'value-1',
    });
  });

  it('updates queue custom field overrides through the export domain', async () => {
    useExportStore.setState({
      queueEntries: [
        {
          id: 'queue-1',
          kpm_project_id: 'project-1',
          plan_item_id: 'plan-1',
          association_id: 'assoc-1',
          operation: 'create',
          target_issue_type_id: 'epic',
          target_issue_type_name: 'Epic',
          target_parent_key: null,
          target_status_category: null,
          custom_field_overrides: null,
          queued_by: 'user',
          queued_at: '2024-01-01T00:00:00.000Z',
          error_message: null,
          plan_item: {
            id: 'plan-1',
            title: 'Plan item',
            description: null,
            label: null,
            parent_id: null,
            external_key: null,
            external_type: null,
          },
        },
      ],
      queueCount: 1,
      queueCountsByAssociation: { 'assoc-1': 1 },
      queuedItemIds: new Set(['plan-1']),
    });
    api.tracker.exportQueue.updateCustomFieldOverrides.mockResolvedValue({ success: true });

    await useExportStore
      .getState()
      .updateQueueCustomFieldOverrides('queue-1', { 'custom-field': 'value-1' });

    expect(api.tracker.exportQueue.updateCustomFieldOverrides).toHaveBeenCalledWith({
      queueEntryId: 'queue-1',
      customFieldOverrides: { 'custom-field': 'value-1' },
    });
    expect(useExportStore.getState().queueEntries[0]?.custom_field_overrides).toEqual({
      'custom-field': 'value-1',
    });
  });

  it('tracks queue counts per association when loading the queue', async () => {
    api.tracker.exportQueue.get.mockResolvedValue({
      success: true,
      entries: [
        {
          id: 'queue-1',
          kpm_project_id: 'project-1',
          plan_item_id: 'plan-1',
          association_id: 'assoc-1',
          operation: 'create',
          target_issue_type_id: 'epic',
          target_issue_type_name: 'Epic',
          target_parent_key: null,
          target_status_category: null,
          custom_field_overrides: null,
          queued_by: 'user',
          queued_at: '2024-01-01T00:00:00.000Z',
          error_message: null,
          plan_item: {
            id: 'plan-1',
            title: 'Plan item 1',
            description: null,
            label: null,
            parent_id: null,
            external_key: null,
            external_type: null,
          },
        },
        {
          id: 'queue-2',
          kpm_project_id: 'project-1',
          plan_item_id: 'plan-2',
          association_id: 'assoc-2',
          operation: 'create',
          target_issue_type_id: 'story',
          target_issue_type_name: 'Story',
          target_parent_key: null,
          target_status_category: null,
          custom_field_overrides: null,
          queued_by: 'user',
          queued_at: '2024-01-01T00:00:00.000Z',
          error_message: null,
          plan_item: {
            id: 'plan-2',
            title: 'Plan item 2',
            description: null,
            label: null,
            parent_id: null,
            external_key: null,
            external_type: null,
          },
        },
        {
          id: 'queue-3',
          kpm_project_id: 'project-1',
          plan_item_id: 'plan-3',
          association_id: 'assoc-1',
          operation: 'update',
          target_issue_type_id: 'epic',
          target_issue_type_name: 'Epic',
          target_parent_key: null,
          target_status_category: null,
          custom_field_overrides: null,
          queued_by: 'user',
          queued_at: '2024-01-01T00:00:00.000Z',
          error_message: null,
          plan_item: {
            id: 'plan-3',
            title: 'Plan item 3',
            description: null,
            label: null,
            parent_id: null,
            external_key: null,
            external_type: null,
          },
        },
      ],
    });

    await useExportStore.getState().loadQueue('project-1');

    expect(useExportStore.getState().queueCount).toBe(3);
    expect(useExportStore.getState().getQueueCountForAssociation('assoc-1')).toBe(2);
    expect(useExportStore.getState().getQueueCountForAssociation('assoc-2')).toBe(1);
  });
});
