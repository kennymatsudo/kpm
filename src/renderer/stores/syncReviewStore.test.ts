import { beforeEach, describe, expect, it } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { subscribe } from './storeEvents';
import { useExportStore } from './tracker/useExportStore';
import { useSyncReviewStore } from './tracker/useSyncReviewStore';
import type { TrackerExportCompletedEvent } from './storeEvents';
import type { SyncReviewItem } from '../../shared/types';

function createReviewItem(planItemId: string, queueEntryId: string): SyncReviewItem {
  return {
    queueEntry: {
      id: queueEntryId,
      kpm_project_id: 'project-1',
      plan_item_id: planItemId,
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
    },
    planItem: {
      id: planItemId,
      project_id: 'project-1',
      parent_id: null,
      title: 'Plan item',
      description: null,
      label: null,
      item_order: 0,
      code_refs: null,
      status: 'planned',
      release_tag: null,
      position_x: 0,
      position_y: 0,
      group_id: null,
      association_id: 'assoc-1',
      external_id: null,
      external_status: null,
      status_category: null,
      external_url: null,
      external_issue_type: null,
      external_parent_key: null,
      external_epic_key: null,
      sync_source: 'local',
      last_synced_at: null,
      intent: null,
      acceptance_criteria: null,
      source_document_id: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      completed_at: null,
      external_key: null,
      external_type: null,
    },
    resolvedType: { id: 'epic', name: 'Epic' },
    resolvedParent: null,
    resolvedDescription: null,
    validationErrors: [],
    jiraCurrent: null,
    diffs: null,
    statusTransition: null,
    decision: 'pending',
    hasConflict: false,
  };
}

describe('useSyncReviewStore', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useExportStore.getState().reset();
    useSyncReviewStore.getState().reset();
  });

  it('removes a review item, propagates the queue removal to the IPC layer, and updates local state', async () => {
    api.tracker.exportQueue.remove.mockResolvedValue({ success: true });

    useSyncReviewStore.setState({
      items: [createReviewItem('plan-1', 'queue-1'), createReviewItem('plan-2', 'queue-2')],
      currentIndex: 1,
      phase: 'reviewing',
    });

    await useSyncReviewStore.getState().removeFromReview('plan-2');

    expect(api.tracker.exportQueue.remove).toHaveBeenCalledWith({ queueEntryId: 'queue-2' });
    expect(useSyncReviewStore.getState().items.map((item) => item.planItem.id)).toEqual(['plan-1']);
    expect(useSyncReviewStore.getState().currentIndex).toBe(0);
  });

  it('updates a review item\'s custom field overrides via the IPC layer and reflects them in local state', async () => {
    api.tracker.exportQueue.updateCustomFieldOverrides.mockResolvedValue({ success: true });

    useSyncReviewStore.setState({
      items: [createReviewItem('plan-1', 'queue-1')],
      currentIndex: 0,
      phase: 'reviewing',
    });

    await useSyncReviewStore
      .getState()
      .updateCustomFieldOverrides('queue-1', { 'custom-field': 'value-2' });

    expect(api.tracker.exportQueue.updateCustomFieldOverrides).toHaveBeenCalledWith({
      queueEntryId: 'queue-1',
      customFieldOverrides: { 'custom-field': 'value-2' },
    });
    expect(useSyncReviewStore.getState().items[0]?.queueEntry.custom_field_overrides).toEqual({
      'custom-field': 'value-2',
    });
  });

  it('does nothing when the plan item is not in the current review list', async () => {
    useSyncReviewStore.setState({
      items: [createReviewItem('plan-1', 'queue-1')],
      currentIndex: 0,
      phase: 'reviewing',
    });

    await useSyncReviewStore.getState().removeFromReview('not-in-list');

    expect(api.tracker.exportQueue.remove).not.toHaveBeenCalled();
    expect(useSyncReviewStore.getState().items).toHaveLength(1);
  });

  it('emits an event after approved tracker export completes', async () => {
    const events: TrackerExportCompletedEvent['payload'][] = [];
    const unsubscribe = subscribe('tracker-export-completed', (event) => {
      events.push(event.payload);
    });
    api.tracker.export.executeApproved.mockResolvedValue({
      success: true,
      result: { success: true, created: [], updated: [], errors: [] },
    });
    useSyncReviewStore.setState({
      items: [{ ...createReviewItem('plan-1', 'queue-1'), decision: 'approved' }],
      phase: 'reviewing',
    });

    await useSyncReviewStore.getState().executeApproved('project-1', 'assoc-1');
    unsubscribe();

    expect(api.tracker.export.executeApproved).toHaveBeenCalledWith({
      projectId: 'project-1',
      associationId: 'assoc-1',
      approvedItemIds: ['plan-1'],
    });
    expect(events).toEqual([{ projectId: 'project-1', associationId: 'assoc-1' }]);
  });
});
