import { describe, expect, it, vi } from 'vitest';
import { recordTrackerAgreement } from './trackerAgreement';

function createDeps() {
  return {
    planItems: { update: vi.fn() },
    sync: { upsertSnapshot: vi.fn() },
  };
}

describe('recordTrackerAgreement', () => {
  const remote = {
    title: 'Tracker title',
    description: 'Tracker description',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('snapshots what the tracker returned and stamps the item as synced', () => {
    const deps = createDeps();

    recordTrackerAgreement('plan-1', remote, {}, deps);

    expect(deps.sync.upsertSnapshot).toHaveBeenCalledWith({
      plan_item_id: 'plan-1',
      snapshot_title: 'Tracker title',
      snapshot_description: 'Tracker description',
      external_updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(deps.planItems.update).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({ last_synced_at: expect.any(String) })
    );
  });

  it('applies the caller\'s other sync fields without letting them set the sync time', () => {
    const deps = createDeps();

    recordTrackerAgreement(
      'plan-1',
      remote,
      { extra: { external_key: 'ENG-1', last_synced_at: '1999-01-01T00:00:00.000Z' } },
      deps
    );

    const [, updates] = deps.planItems.update.mock.calls[0];
    expect(updates.external_key).toBe('ENG-1');
    expect(updates.last_synced_at).not.toBe('1999-01-01T00:00:00.000Z');
  });
});
