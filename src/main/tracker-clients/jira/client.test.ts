import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JiraClient } from './client';

const { doTransition, deleteIssue, createIssue, getCurrentUser } = vi.hoisted(() => ({
  doTransition: vi.fn(),
  deleteIssue: vi.fn(),
  createIssue: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock('jira.js', () => ({
  createCloudClient: () => ({
    issues: {
      doTransition,
      deleteIssue,
      createIssue,
    },
    myself: {
      getCurrentUser,
    },
  }),
}));

function testClient() {
  return new JiraClient({
    type: 'jira',
    siteUrl: 'company.atlassian.net',
    email: 'test@example.com',
    apiToken: 'token',
  });
}

const CREATE_PARAMS = {
  projectKey: 'PROJ',
  issueTypeId: '10001',
  summary: 'Ship fix',
} as const;

const ASSIGNEE_SCREEN_ERROR = {
  status: 400,
  body: {
    errors: {
      assignee: "Field 'assignee' cannot be set. It is not on the appropriate screen, or unknown.",
    },
  },
};

describe('JiraClient.createIssue self-assignment', () => {
  beforeEach(() => {
    createIssue.mockReset();
    getCurrentUser.mockReset();
    createIssue.mockResolvedValue({ id: '10100', key: 'PROJ-1' });
    getCurrentUser.mockResolvedValue({ accountId: 'account-1' });
  });

  it('assigns the credentialed account when asked, looking it up once per client', async () => {
    const client = testClient();

    const created = await client.createIssue({ ...CREATE_PARAMS, assignToSelf: true });
    await client.createIssue({ ...CREATE_PARAMS, assignToSelf: true });

    expect(created.assigneeSkippedReason).toBeUndefined();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(createIssue).toHaveBeenNthCalledWith(1, {
      fields: expect.objectContaining({ assignee: { accountId: 'account-1' } }),
    });
  });

  it('omits the assignee entirely when not asked', async () => {
    await testClient().createIssue(CREATE_PARAMS);

    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(createIssue.mock.calls[0][0].fields).not.toHaveProperty('assignee');
  });

  it('creates the issue unassigned and reports why when Jira refuses the assignee', async () => {
    createIssue
      .mockRejectedValueOnce(ASSIGNEE_SCREEN_ERROR)
      .mockResolvedValueOnce({ id: '10100', key: 'PROJ-1' });

    const created = await testClient().createIssue({ ...CREATE_PARAMS, assignToSelf: true });

    expect(created.key).toBe('PROJ-1');
    expect(created.assigneeSkippedReason).toContain("Field 'assignee' cannot be set");
    expect(createIssue).toHaveBeenCalledTimes(2);
    expect(createIssue.mock.calls[1][0].fields).not.toHaveProperty('assignee');
  });

  it('surfaces a failure that was not about the assignee without retrying', async () => {
    createIssue.mockRejectedValue({
      status: 400,
      body: { errors: { summary: 'Summary is required' } },
    });

    await expect(testClient().createIssue({ ...CREATE_PARAMS, assignToSelf: true })).rejects.toMatchObject({
      userMessage: 'Summary is required',
    });
    expect(createIssue).toHaveBeenCalledTimes(1);
  });

  it('creates the issue unassigned when the account lookup fails', async () => {
    getCurrentUser.mockRejectedValue(new Error('401 Unauthorized'));

    const created = await testClient().createIssue({ ...CREATE_PARAMS, assignToSelf: true });

    expect(created.assigneeSkippedReason).toBe('Could not resolve your Jira account');
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(createIssue.mock.calls[0][0].fields).not.toHaveProperty('assignee');
  });
});

describe('JiraClient.transitionIssue', () => {
  beforeEach(() => {
    doTransition.mockReset();
  });

  it('retries without resolution when Jira rejects that field on the transition screen', async () => {
    doTransition
      .mockRejectedValueOnce({
        status: 400,
        body: {
          errors: {
            resolution: "Field 'resolution' cannot be set. It is not on the appropriate screen, or unknown.",
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

describe('JiraClient.deleteIssue', () => {
  beforeEach(() => {
    deleteIssue.mockReset();
  });

  it('permanently deletes the issue by key', async () => {
    deleteIssue.mockResolvedValueOnce(undefined);

    const client = new JiraClient({
      type: 'jira',
      siteUrl: 'company.atlassian.net',
      email: 'test@example.com',
      apiToken: 'token',
    });

    await expect(client.deleteIssue('PROJ-7843')).resolves.toBeUndefined();
    expect(deleteIssue).toHaveBeenCalledWith({ issueIdOrKey: 'PROJ-7843' });
  });
});
