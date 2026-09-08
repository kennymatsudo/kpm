import { describe, expect, it } from 'vitest';
import { describeGhAuth, type GhAuthFailure } from './ghAuth';

describe('describeGhAuth', () => {
  it('names the environment variable whose token is being rejected', () => {
    expect(
      describeGhAuth({ authenticated: true, account: 'octocat', tokenEnvVar: 'GITHUB_TOKEN' })
    ).toBe(
      'gh is authenticated as octocat, but it is using GITHUB_TOKEN from the environment. That token, not your keyring login, is being rejected.'
    );
  });

  it('sends a keyring login to gh auth refresh rather than blaming the environment', () => {
    expect(describeGhAuth({ authenticated: true, account: 'octocat' })).toBe(
      'gh is authenticated as octocat, but GitHub rejected its credentials. Run `gh auth refresh` in your terminal.'
    );
  });

  it.each<[GhAuthFailure, string]>([
    ['not_installed', 'GitHub CLI not found. Install gh, then reopen this panel.'],
    ['not_authenticated', 'GitHub CLI not authenticated. Run `gh auth login` in your terminal.'],
    [
      'check_failed',
      'Could not verify GitHub access. Check your connection and credentials, then try again.',
    ],
  ])('gives %s a remedy of its own', (reason, expected) => {
    expect(describeGhAuth({ authenticated: false, reason })).toBe(expected);
  });
});
