import { describe, expect, it, vi } from 'vitest';
import type { OutboundDeletion } from '../../../shared/types';
import type { ExternalIssue } from '../../tracker-clients';
import { describeDeletions, drainDeletions } from './TrackerDeletionDrain';

function createExternalIssue(key: string): ExternalIssue {
  return {
    key,
    id: `issue-${key}`,
    title: `Issue ${key}`,
    description: 'Body',
    issueType: 'Issue',
    status: 'In Progress',
    statusType: 'started',
    parentKey: null,
    epicKey: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: `https://linear.app/${key}`,
  };
}

function createDeletion(overrides: Partial<OutboundDeletion> = {}): OutboundDeletion {
  return {
    id: 'queue-1',
    kpm_project_id: 'proj-1',
    association_id: 'assoc-1',
    operation: 'delete',
    plan_item_id: null,
    target_issue_type_id: null,
    target_issue_type_name: null,
    target_parent_key: null,
    target_status_category: null,
    custom_field_overrides: null,
    queued_by: 'user',
    queued_at: '2026-01-01T00:00:00.000Z',
    error_message: null,
    external_key: 'ENG-1',
    external_id: 'issue-1',
    tracker_type: 'linear',
    ...overrides,
  };
}

function createDeps() {
  return { outboundChanges: { remove: vi.fn(), setError: vi.fn() } };
}

describe('describeDeletions', () => {
  it('attaches the current tracker state for each deletion', async () => {
    const fetchIssue = vi.fn(async (key: string) => createExternalIssue(key));

    const described = await describeDeletions(
      [createDeletion({ id: 'a', external_key: 'ENG-1' }), createDeletion({ id: 'b', external_key: 'ENG-2' })],
      { fetchIssue }
    );

    expect(fetchIssue.mock.calls.map(([key]) => key)).toEqual(['ENG-1', 'ENG-2']);
    expect(described.map(d => d.currentIssue?.title)).toEqual(['Issue ENG-1', 'Issue ENG-2']);
    expect(described.every(d => d.decision === 'pending' && d.fetchError === null)).toBe(true);
  });

  it('records a fetch failure inline rather than losing the deletion', async () => {
    const fetchIssue = vi.fn(async () => {
      throw new Error('Issue not found');
    });

    const described = await describeDeletions(
      [createDeletion()],
      { fetchIssue }
    );

    expect(described).toHaveLength(1);
    expect(described[0].currentIssue).toBeNull();
    expect(described[0].fetchError).toBe('Issue not found');
  });

  it('still lists every deletion when there is no client to ask', async () => {
    const described = await describeDeletions([createDeletion()], null);

    expect(described).toHaveLength(1);
    expect(described[0].currentIssue).toBeNull();
    expect(described[0].fetchError).toBeNull();
  });
});

describe('drainDeletions', () => {
  it('deletes only the approved rows and clears them from the queue', async () => {
    const deps = createDeps();
    const deleteIssue = vi.fn(async () => {});

    const result = await drainDeletions(
      [
        createDeletion({ id: 'approved', external_key: 'ENG-1' }),
        createDeletion({ id: 'skipped', external_key: 'ENG-2' }),
      ],
      ['approved'],
      { deleteIssue },
      deps
    );

    expect(deleteIssue).toHaveBeenCalledExactlyOnceWith('ENG-1');
    expect(result.deleted).toEqual([{ external_key: 'ENG-1' }]);
    expect(deps.outboundChanges.remove).toHaveBeenCalledExactlyOnceWith('approved');
  });

  it('leaves a failed row queued with its error so the next drain retries it', async () => {
    const deps = createDeps();
    const deleteIssue = vi.fn(async () => {
      throw new Error('Linear API unavailable');
    });

    const result = await drainDeletions([createDeletion({ id: 'row-1' })], ['row-1'], { deleteIssue }, deps);

    expect(result.deleted).toEqual([]);
    expect(result.errors).toEqual([{ external_key: 'ENG-1', error: 'Linear API unavailable' }]);
    expect(deps.outboundChanges.remove).not.toHaveBeenCalled();
    expect(deps.outboundChanges.setError).toHaveBeenCalledExactlyOnceWith('row-1', 'Linear API unavailable');
  });

  it('carries on after one failure so a single bad row cannot block the rest', async () => {
    const deps = createDeps();
    const deleteIssue = vi.fn(async (key: string) => {
      if (key === 'ENG-1') throw new Error('gone');
    });

    const result = await drainDeletions(
      [createDeletion({ id: 'a', external_key: 'ENG-1' }), createDeletion({ id: 'b', external_key: 'ENG-2' })],
      ['a', 'b'],
      { deleteIssue },
      deps
    );

    expect(result.errors.map(e => e.external_key)).toEqual(['ENG-1']);
    expect(result.deleted).toEqual([{ external_key: 'ENG-2' }]);
  });
});
