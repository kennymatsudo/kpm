import { describe, expect, it, vi } from 'vitest';
import { LinearClient } from './client';

describe('LinearClient', () => {
  it('sends stateId when creating an issue with a target status id', async () => {
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
      targetStatusId: 'state-done',
    });

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
});
