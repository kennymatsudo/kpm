import { beforeEach, describe, expect, it } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { subscribe } from './storeEvents';
import { useExportStore } from './tracker/useExportStore';
import { useSyncReviewStore } from './tracker/useSyncReviewStore';
import type { TrackerExportCompletedEvent } from './storeEvents';
import type { SyncReviewItem, SyncReviewDeleteItem } from '../../shared/types';

function createReviewItem(
  planItemId: string,
  queueEntryId: string,
  overrides: {
    parentId?: string | null;
    externalKey?: string | null;
    validationErrors?: string[];
    decision?: SyncReviewItem['decision'];
  } = {}
): SyncReviewItem {
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
      external_key: null,
      external_id: null,
      tracker_type: null,
    },
    planItem: {
      id: planItemId,
      project_id: 'project-1',
      parent_id: overrides.parentId ?? null,
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
      work_brief_revision: 1,
      source_document_id: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      completed_at: null,
      external_key: overrides.externalKey ?? null,
      external_type: null,
    },
    resolvedType: { id: 'epic', name: 'Epic' },
    resolvedParent: null,
    resolvedDescription: null,
    validationErrors: overrides.validationErrors ?? [],
    jiraCurrent: null,
    diffs: null,
    statusTransition: null,
    decision: overrides.decision ?? 'pending',
    hasConflict: false,
  };
}

/** grandparent -> parent -> child, none of them synced yet. */
function createUnsyncedChain(): SyncReviewItem[] {
  return [
    createReviewItem('grandparent', 'queue-gp'),
    createReviewItem('parent', 'queue-p', { parentId: 'grandparent' }),
    createReviewItem('child', 'queue-c', { parentId: 'parent' }),
  ];
}

function decisionsById(): Record<string, SyncReviewItem['decision']> {
  return Object.fromEntries(
    useSyncReviewStore.getState().items.map((item) => [item.planItem.id, item.decision])
  );
}

function createDeleteReviewItem(queueEntryId: string): SyncReviewDeleteItem {
  return {
    queueEntry: {
      id: queueEntryId,
      kpm_project_id: 'project-1',
      plan_item_id: null,
      association_id: 'assoc-1',
      operation: 'delete',
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: null,
      custom_field_overrides: null,
      queued_by: 'user',
      queued_at: '2024-01-01T00:00:00.000Z',
      error_message: null,
      external_key: 'ENG-99',
      external_id: 'issue-99',
      tracker_type: 'linear',
    },
    decision: 'pending',
    currentIssue: null,
    fetchError: null,
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
      result: { success: true, created: [], updated: [], deleted: [], errors: [], deleteErrors: [] },
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
      approvedDeleteIds: [],
    });
    expect(events).toEqual([{ projectId: 'project-1', associationId: 'assoc-1' }]);
  });

  it('sends only the approved deletes, leaving the pending ones queued', async () => {
    api.tracker.export.executeApproved.mockResolvedValue({
      success: true,
      result: { success: true, created: [], updated: [], deleted: [], errors: [], deleteErrors: [] },
    });
    useSyncReviewStore.setState({
      items: [],
      deleteItems: [createDeleteReviewItem('queue-del-1'), createDeleteReviewItem('queue-del-2')],
      phase: 'reviewing',
    });

    useSyncReviewStore.getState().setDeleteDecision('queue-del-1', 'approved');
    await useSyncReviewStore.getState().executeApproved('project-1', 'assoc-1');

    expect(api.tracker.export.executeApproved).toHaveBeenCalledWith({
      projectId: 'project-1',
      associationId: 'assoc-1',
      approvedItemIds: [],
      approvedDeleteIds: ['queue-del-1'],
    });
  });

  it('approves the whole unsynced ancestor chain when a deep child is approved', () => {
    useSyncReviewStore.setState({ items: createUnsyncedChain(), phase: 'reviewing' });

    useSyncReviewStore.getState().toggleItemApproval('child');

    expect(decisionsById()).toEqual({
      grandparent: 'approved',
      parent: 'approved',
      child: 'approved',
    });
  });

  it('leaves an already-synced ancestor pending while still approving the unsynced one above it', () => {
    useSyncReviewStore.setState({
      items: [
        createReviewItem('grandparent', 'queue-gp'),
        createReviewItem('parent', 'queue-p', { parentId: 'grandparent', externalKey: 'ENG-7' }),
        createReviewItem('child', 'queue-c', { parentId: 'parent' }),
      ],
      phase: 'reviewing',
    });

    useSyncReviewStore.getState().toggleItemApproval('child');

    expect(decisionsById()).toEqual({
      grandparent: 'approved',
      parent: 'pending',
      child: 'approved',
    });
  });

  it('never approves an item with validation errors, as the item or as an ancestor', () => {
    useSyncReviewStore.setState({
      items: [
        createReviewItem('grandparent', 'queue-gp'),
        createReviewItem('parent', 'queue-p', { parentId: 'grandparent', validationErrors: ['Sub-task type requires a parent item'] }),
        createReviewItem('child', 'queue-c', { parentId: 'parent' }),
        createReviewItem('broken', 'queue-b', { validationErrors: ['Could not resolve issue type'] }),
      ],
      phase: 'reviewing',
    });

    useSyncReviewStore.getState().toggleItemApproval('child');
    useSyncReviewStore.getState().toggleItemApproval('broken');

    expect(decisionsById()).toEqual({
      grandparent: 'approved',
      parent: 'pending',
      child: 'approved',
      broken: 'pending',
    });
  });

  it('leaves an already-approved ancestor alone when another child is approved', () => {
    useSyncReviewStore.setState({
      items: [
        ...createUnsyncedChain(),
        createReviewItem('sibling', 'queue-s', { parentId: 'parent' }),
      ],
      phase: 'reviewing',
    });

    useSyncReviewStore.getState().toggleItemApproval('child');
    useSyncReviewStore.getState().toggleItemApproval('sibling');

    expect(decisionsById()).toEqual({
      grandparent: 'approved',
      parent: 'approved',
      child: 'approved',
      sibling: 'approved',
    });
  });

  it('un-approves only the item itself, leaving the parents its child still needs', () => {
    useSyncReviewStore.setState({ items: createUnsyncedChain(), phase: 'reviewing' });

    useSyncReviewStore.getState().toggleItemApproval('child');
    useSyncReviewStore.getState().toggleItemApproval('child');

    expect(decisionsById()).toEqual({
      grandparent: 'approved',
      parent: 'approved',
      child: 'pending',
    });
  });

  it('ignores a toggle for an item that is not under review', () => {
    const items = createUnsyncedChain();
    useSyncReviewStore.setState({ items, phase: 'reviewing' });

    useSyncReviewStore.getState().toggleItemApproval('not-in-list');

    expect(useSyncReviewStore.getState().items).toBe(items);
  });

  it('approves every valid item and returns them all to pending on a second pass', () => {
    useSyncReviewStore.setState({
      items: [
        ...createUnsyncedChain(),
        createReviewItem('broken', 'queue-b', { validationErrors: ['Could not resolve issue type'] }),
      ],
      phase: 'reviewing',
    });

    useSyncReviewStore.getState().toggleAllValid();
    expect(decisionsById()).toEqual({
      grandparent: 'approved',
      parent: 'approved',
      child: 'approved',
      broken: 'pending',
    });

    useSyncReviewStore.getState().toggleAllValid();
    expect(decisionsById()).toEqual({
      grandparent: 'pending',
      parent: 'pending',
      child: 'pending',
      broken: 'pending',
    });
  });

  it('does not call the export IPC when nothing is approved, including pending deletes', async () => {
    useSyncReviewStore.setState({
      items: [],
      deleteItems: [createDeleteReviewItem('queue-del-1')],
      phase: 'reviewing',
    });

    const result = await useSyncReviewStore.getState().executeApproved('project-1', 'assoc-1');

    expect(result).toBeNull();
    expect(api.tracker.export.executeApproved).not.toHaveBeenCalled();
  });
});
