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
});
