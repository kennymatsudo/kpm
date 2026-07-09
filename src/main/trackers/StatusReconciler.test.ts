import { describe, expect, it, vi } from 'vitest';
import { createStatusReconciler } from './StatusReconciler';
import type { ExternalIssue, TrackerTransition, TrackerClient } from '../tracker-clients';

function issue(overrides: Partial<ExternalIssue> = {}): ExternalIssue {
  return {
    key: 'ENG-1',
    id: 'issue-1',
    title: 'Item',
    description: null,
    issueType: 'Issue',
    status: 'In Review',
    statusType: 'started',
    parentKey: null,
    epicKey: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://linear.app/example/issue/ENG-1',
    assignee: null,
    creator: null,
    ...overrides,
  };
}

const doneTransition: TrackerTransition = {
  id: 'state-done',
  name: 'Move to Done',
  to: { id: 'state-done', name: 'Done', statusCategory: { key: 'done', name: 'Done' } },
};

function mockClient(overrides: Partial<TrackerClient> = {}): TrackerClient {
  return {
    type: 'linear',
    getTransitions: vi.fn(async () => [doneTransition]),
    transitionIssue: vi.fn(async () => {}),
    fetchIssue: vi.fn(async () => issue()),
    ...overrides,
  } as unknown as TrackerClient;
}

describe('StatusReconciler', () => {
  it('plans no transition when the issue is already in the target category', async () => {
    const client = mockClient();
    const reconciler = createStatusReconciler(client, { done: 'Done' });

    const plan = await reconciler.planTransition(
      'ENG-1',
      issue({ status: 'Done', statusType: 'completed' }),
      'done'
    );

    expect(plan).toBeNull();
    expect(client.getTransitions).not.toHaveBeenCalled();
  });

  it('plans the mapped transition when one is needed', async () => {
    const client = mockClient();
    const reconciler = createStatusReconciler(client, { done: 'Done' });

    const plan = await reconciler.planTransition('ENG-1', issue(), 'done');

    expect(plan).toEqual(doneTransition);
  });

  it('throws when a transition is needed but no mapping resolves it', async () => {
    const client = mockClient();
    const reconciler = createStatusReconciler(client, null);

    await expect(reconciler.planTransition('ENG-1', issue(), 'done')).rejects.toThrow(
      /status mapping/i
    );
  });

  it('applies a transition, re-fetches, and verifies the issue landed', async () => {
    const client = mockClient({
      fetchIssue: vi.fn(async () => issue({ status: 'Done', statusType: 'completed' })),
    });
    const reconciler = createStatusReconciler(client, { done: 'Done' });

    const result = await reconciler.applyTransition('ENG-1', doneTransition, 'done');

    expect(client.transitionIssue).toHaveBeenCalledWith('ENG-1', 'state-done', true);
    expect(result.status).toBe('Done');
  });

  it('throws if the issue did not reach the target category after transitioning', async () => {
    const client = mockClient({
      fetchIssue: vi.fn(async () => issue({ status: 'In Review', statusType: 'started' })),
    });
    const reconciler = createStatusReconciler(client, { done: 'Done' });

    await expect(reconciler.applyTransition('ENG-1', doneTransition, 'done')).rejects.toThrow(
      /expected Done/
    );
  });
});
