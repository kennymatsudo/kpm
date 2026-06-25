import { describe, expect, it, vi } from 'vitest';
import { queueTrackerUpdateIfNeeded } from './PlanItemService';

describe('queueTrackerUpdateIfNeeded', () => {
  it('updates an existing queue entry when status changes', () => {
    const syncQueue = {
      getByItemId: vi.fn().mockReturnValue({ id: 'queue-1' }),
      updateStatusCategory: vi.fn(),
      add: vi.fn(),
    };

    queueTrackerUpdateIfNeeded(
      {
        id: 'plan-1',
        project_id: 'project-1',
        external_key: 'ENG-123',
        association_id: 'assoc-1',
        status_category: 'in_progress',
      },
      { status_category: 'done' },
      'user',
      {
        planItems: {},
        syncQueue,
        tracker: {},
      } as never
    );

    expect(syncQueue.updateStatusCategory).toHaveBeenCalledWith('queue-1', 'done');
    expect(syncQueue.add).not.toHaveBeenCalled();
  });
});
