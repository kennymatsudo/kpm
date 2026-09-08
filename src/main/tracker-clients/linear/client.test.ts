import { describe, expect, it, vi } from 'vitest';
import { LinearClient } from './client';

describe('LinearClient', () => {
  it('creates an issue in the mapped initial status by resolving its state id', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-1' }] } })
      .mockResolvedValueOnce({
        teams: {
          nodes: [
            {
              states: {
                nodes: [
                  { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                  { id: 'state-done', name: 'Done', type: 'completed' },
                ],
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        issueCreate: {
          success: true,
          issue: {
            id: 'issue-1',
            identifier: 'ENG-1',
            url: 'https://linear.app/example/issue/ENG-1',
          },
        },
      });

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    const created = await client.createIssue({
      projectKey: 'ENG',
      issueTypeId: 'Issue',
      summary: 'Ship fix',
      initialStatusName: 'Done',
    });

    expect(created.url).toBe('https://linear.app/example/issue/ENG-1');
    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          teamId: 'team-1',
          title: 'Ship fix',
          stateId: 'state-done',
        }),
      })
    );
  });

  it('scopes a new issue to the project id carried in the association filter', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-1' }] } })
      .mockResolvedValueOnce({
        issueCreate: {
          success: true,
          issue: {
            id: 'issue-1',
            identifier: 'ENG-1',
            url: 'https://linear.app/example/issue/ENG-1',
          },
        },
      });

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    await client.createIssue({
      projectKey: 'ENG',
      issueTypeId: 'Issue',
      summary: 'Ship fix',
      issueFilter: JSON.stringify({ teamKey: 'ENG', projectId: 'proj-42' }),
    });

    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          teamId: 'team-1',
          projectId: 'proj-42',
        }),
      })
    );
  });

  it('assigns the token owner when asked to self-assign', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-1' }] } })
      .mockResolvedValueOnce({ viewer: { id: 'user-1' } })
      .mockResolvedValueOnce({
        issueCreate: {
          success: true,
          issue: { id: 'issue-1', identifier: 'ENG-1', url: 'https://linear.app/example/issue/ENG-1' },
        },
      });

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    const created = await client.createIssue({
      projectKey: 'ENG',
      issueTypeId: 'Issue',
      summary: 'Ship fix',
      assignToSelf: true,
    });

    expect(created.assigneeSkippedReason).toBeUndefined();
    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.objectContaining({ assigneeId: 'user-1' }) })
    );
  });

  it('creates the issue unassigned and reports why when Linear refuses the assignee', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-1' }] } })
      .mockResolvedValueOnce({ viewer: { id: 'user-1' } })
      .mockRejectedValueOnce(new Error('Entity not found: assignee'))
      .mockResolvedValueOnce({
        issueCreate: {
          success: true,
          issue: { id: 'issue-1', identifier: 'ENG-1', url: 'https://linear.app/example/issue/ENG-1' },
        },
      });

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    const created = await client.createIssue({
      projectKey: 'ENG',
      issueTypeId: 'Issue',
      summary: 'Ship fix',
      assignToSelf: true,
    });

    expect(created.key).toBe('ENG-1');
    expect(created.assigneeSkippedReason).toContain('assignee');
    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.not.objectContaining({ assigneeId: 'user-1' }) })
    );
  });

  it('surfaces a create failure unrelated to the assignee without retrying', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-1' }] } })
      .mockResolvedValueOnce({ viewer: { id: 'user-1' } })
      .mockRejectedValueOnce(new Error('Title is required'));

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    await expect(
      client.createIssue({ projectKey: 'ENG', issueTypeId: 'Issue', summary: '', assignToSelf: true })
    ).rejects.toMatchObject({ userMessage: expect.stringContaining('Title is required') });

    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('LinearClient.deleteIssue', () => {
  it('resolves the identifier to an internal id, then moves the issue to trash', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ issue: { id: 'issue-1' } })
      .mockResolvedValueOnce({ issueDelete: { success: true } });

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    await expect(client.deleteIssue('ENG-1')).resolves.toBeUndefined();

    expect(request).toHaveBeenNthCalledWith(1, expect.anything(), { id: 'ENG-1' });
    expect(request).toHaveBeenNthCalledWith(2, expect.anything(), { id: 'issue-1' });
  });

  it('throws when Linear answers the delete with success=false', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ issue: { id: 'issue-1' } })
      .mockResolvedValueOnce({ issueDelete: { success: false } });

    const client = new LinearClient({ type: 'linear', apiToken: 'token' });
    (client as unknown as { client: { request: typeof request } }).client = { request };

    await expect(client.deleteIssue('ENG-1')).rejects.toThrow(/success=false/);
  });
});
