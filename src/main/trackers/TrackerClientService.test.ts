import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackerCredentials } from '../tracker-clients';

const mocks = vi.hoisted(() => {
  const provider = {
    getCredentials: vi.fn(),
    saveCredentials: vi.fn(),
    hasCredentials: vi.fn(),
    clearCredentials: vi.fn(),
  };
  const jiraTestConnection = vi.fn();
  const linearTestConnection = vi.fn();
  const JiraClient = vi.fn(function (creds: unknown) {
    return {
      type: 'jira',
      creds,
      testConnection: jiraTestConnection,
    };
  });
  const LinearClient = vi.fn(function (creds: unknown) {
    return {
      type: 'linear',
      creds,
      testConnection: linearTestConnection,
    };
  });
  const KeytarCredentialProvider = vi.fn(function () {
    return provider;
  });

  return { provider, jiraTestConnection, linearTestConnection, JiraClient, LinearClient, KeytarCredentialProvider };
});

vi.mock('../tracker-clients', () => ({
  JiraClient: mocks.JiraClient,
  LinearClient: mocks.LinearClient,
  KeytarCredentialProvider: mocks.KeytarCredentialProvider,
}));

import { TrackerClientService } from './TrackerClientService';

describe('TrackerClientService credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches testConnection to the client matching the credential type', async () => {
    const jiraCreds: TrackerCredentials = {
      type: 'jira',
      siteUrl: 'example.atlassian.net',
      email: 'dev@example.com',
      apiToken: 'jira-token',
    };
    const linearCreds: TrackerCredentials = { type: 'linear', apiToken: 'linear-token' };
    mocks.jiraTestConnection.mockResolvedValueOnce({ success: true });
    mocks.linearTestConnection.mockResolvedValueOnce({ success: true });

    await expect(TrackerClientService.testConnection(jiraCreds)).resolves.toEqual({ success: true });
    await expect(TrackerClientService.testConnection(linearCreds)).resolves.toEqual({ success: true });

    expect(mocks.JiraClient).toHaveBeenCalledWith(jiraCreds);
    expect(mocks.LinearClient).toHaveBeenCalledWith(linearCreds);
    expect(mocks.jiraTestConnection).toHaveBeenCalledTimes(1);
    expect(mocks.linearTestConnection).toHaveBeenCalledTimes(1);
  });

  it('does not persist credentials when the connection test fails', async () => {
    const creds: TrackerCredentials = {
      type: 'jira',
      siteUrl: 'example.atlassian.net',
      email: 'dev@example.com',
      apiToken: 'bad-token',
    };
    mocks.jiraTestConnection.mockResolvedValueOnce({ success: false, error: 'Unauthorized' });

    await expect(TrackerClientService.saveCredentials(creds)).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });

    expect(mocks.JiraClient).toHaveBeenCalledWith(creds);
    expect(mocks.provider.saveCredentials).not.toHaveBeenCalled();
  });

  it('persists credentials after a successful connection test', async () => {
    const creds: TrackerCredentials = { type: 'linear', apiToken: 'linear-token' };
    mocks.linearTestConnection.mockResolvedValueOnce({ success: true });
    mocks.provider.saveCredentials.mockResolvedValueOnce(undefined);

    await expect(TrackerClientService.saveCredentials(creds)).resolves.toEqual({ success: true });

    expect(mocks.LinearClient).toHaveBeenCalledWith(creds);
    expect(mocks.provider.saveCredentials).toHaveBeenCalledWith(creds);
    expect(mocks.linearTestConnection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.provider.saveCredentials.mock.invocationCallOrder[0]
    );
  });

  it('wraps credential persistence errors', async () => {
    const creds: TrackerCredentials = {
      type: 'jira',
      siteUrl: 'example.atlassian.net',
      email: 'dev@example.com',
      apiToken: 'jira-token',
    };
    mocks.jiraTestConnection.mockResolvedValueOnce({ success: true });
    mocks.provider.saveCredentials.mockRejectedValueOnce(new Error('Keychain locked'));

    await expect(TrackerClientService.saveCredentials(creds)).resolves.toEqual({
      success: false,
      error: 'Keychain locked',
    });
  });

  it('forwards clearCredentials to the credential provider with the tracker type', async () => {
    mocks.provider.clearCredentials.mockResolvedValueOnce(undefined);

    await expect(TrackerClientService.clearCredentials('linear')).resolves.toBeUndefined();

    expect(mocks.provider.clearCredentials).toHaveBeenCalledWith('linear');
  });
});
