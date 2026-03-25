import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { useExportStore } from './tracker/useExportStore';

describe('export store', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useExportStore.getState().reset();
    vi.clearAllMocks();
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
      queuedItemIds: new Set(['plan-1']),
    });
    api.tracker.exportQueue.updateCustomFieldOverrides.mockResolvedValue({ success: true });

    await useExportStore
      .getState()
      .updateQueueCustomFieldOverrides('queue-1', { 'custom-field': 'value-1' });

    expect(api.tracker.exportQueue.updateCustomFieldOverrides).toHaveBeenCalledWith('queue-1', {
      'custom-field': 'value-1',
    });
    expect(useExportStore.getState().queueEntries[0]?.custom_field_overrides).toEqual({
      'custom-field': 'value-1',
    });
  });
});
