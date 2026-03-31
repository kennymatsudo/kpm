import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JiraClient } from './client';

const { doTransition } = vi.hoisted(() => ({
  doTransition: vi.fn(),
}));

vi.mock('jira.js', () => {
  class MockVersion3Client {
    issues = {
      doTransition,
    };
  }

  return {
    Version3Client: MockVersion3Client,
  };
});

describe('JiraClient.transitionIssue', () => {
  beforeEach(() => {
    doTransition.mockReset();
  });

  it('retries without resolution when Jira rejects that field on the transition screen', async () => {
    doTransition
      .mockRejectedValueOnce({
        response: {
          data: {
            errors: {
              resolution: "Field 'resolution' cannot be set. It is not on the appropriate screen, or unknown.",
            },
          },
        },
      })
      .mockResolvedValueOnce(undefined);

    const client = new JiraClient({
      type: 'jira',
      siteUrl: 'company.atlassian.net',
      email: 'test@example.com',
      apiToken: 'token',
    });

    await expect(client.transitionIssue('PROJ-7843', '61', true)).resolves.toBeUndefined();

    expect(doTransition).toHaveBeenCalledTimes(2);
    expect(doTransition).toHaveBeenNthCalledWith(1, {
      issueIdOrKey: 'PROJ-7843',
      transition: { id: '61' },
      fields: {
        resolution: { name: 'Done' },
      },
    });
    expect(doTransition).toHaveBeenNthCalledWith(2, {
      issueIdOrKey: 'PROJ-7843',
      transition: { id: '61' },
    });
  });

  it('surfaces non-resolution transition failures without retrying', async () => {
    doTransition.mockRejectedValueOnce({
      status: 400,
      errors: {
        assignee: 'Assignee is required',
      },
    });

    const client = new JiraClient({
      type: 'jira',
      siteUrl: 'company.atlassian.net',
      email: 'test@example.com',
      apiToken: 'token',
    });

    await expect(client.transitionIssue('PROJ-7843', '61', true)).rejects.toMatchObject({
      userMessage: 'Assignee is required',
    });

    expect(doTransition).toHaveBeenCalledTimes(1);
  });
});
