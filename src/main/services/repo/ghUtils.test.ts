import { describe, expect, it } from 'vitest';
import {
  buildCreatePrArgs,
  buildGraphQLPayload,
  classifyGhAuthError,
  parseCreatePrOutput,
  parseGhAuthOutput,
  parsePrRef,
} from './ghUtils';

function execError(fields: { code?: string; stderr?: string }): Error {
  return Object.assign(new Error('gh failed'), fields);
}

describe('parseGhAuthOutput', () => {
  it('reads the account from a keyring login and reports no env token', () => {
    expect(
      parseGhAuthOutput('  ✓ Logged in to github.com account octocat (keyring)\n', {})
    ).toEqual({ authenticated: true, account: 'octocat', tokenEnvVar: undefined });
  });

  it('names the environment variable when gh is using one', () => {
    expect(
      parseGhAuthOutput('  ✓ Logged in to github.com account octocat (GITHUB_TOKEN)\n', {})
    ).toEqual({ authenticated: true, account: 'octocat', tokenEnvVar: 'GITHUB_TOKEN' });
  });

  it('falls back to the environment when gh prints a config path as the source', () => {
    expect(
      parseGhAuthOutput(
        '  ✓ Logged in to github.com account octocat (/home/o/.config/gh/hosts.yml)\n',
        { GH_TOKEN: 'gho_x' }
      )
    ).toEqual({ authenticated: true, account: 'octocat', tokenEnvVar: 'GH_TOKEN' });
  });

  it('returns null when no account line is present', () => {
    expect(parseGhAuthOutput('You are not logged into any GitHub hosts.', {})).toBeNull();
  });
});

describe('classifyGhAuthError', () => {
  it('reports a missing gh binary separately from a logged-out one', () => {
    expect(classifyGhAuthError(execError({ code: 'ENOENT' }), {})).toEqual({
      authenticated: false,
      reason: 'not_installed',
    });
  });

  it.each([
    ['no host is configured', 'You are not logged into any GitHub hosts. To log in, run: gh auth login'],
    ['this host has no account', 'You are not logged into any accounts on github.com'],
  ])('treats gh saying %s as not authenticated', (_case, stderr) => {
    expect(classifyGhAuthError(execError({ stderr }), {})).toEqual({
      authenticated: false,
      reason: 'not_authenticated',
    });
  });

  it('still reports the account when gh exits non-zero but is logged in', () => {
    expect(
      classifyGhAuthError(
        execError({ stderr: '✓ Logged in to github.com account octocat (keyring)' }),
        {}
      )
    ).toEqual({ authenticated: true, account: 'octocat', tokenEnvVar: undefined });
  });

  it.each<[string, unknown]>([
    [
      'a failed-login block',
      execError({
        stderr:
          'github.com\n  X Failed to log in to github.com account octocat (keyring)\n  - The token in keyring is invalid.',
      }),
    ],
    ['a non-Error throw', 'boom'],
  ])('treats %s as a failed check, not a logged-out user', (_case, error) => {
    expect(classifyGhAuthError(error, {})).toEqual({
      authenticated: false,
      reason: 'check_failed',
    });
  });
});

describe('buildCreatePrArgs', () => {
  it('builds gh pr create args without unsupported json output flags', () => {
    expect(buildCreatePrArgs({
      head: 'feature/test-pr',
      base: 'main',
      title: 'Test PR',
      body: 'Body',
      draft: true,
    })).toEqual([
      'pr', 'create',
      '--head', 'feature/test-pr',
      '--base', 'main',
      '--title', 'Test PR',
      '--body', 'Body',
      '--draft',
    ]);
  });
});

describe('parseCreatePrOutput', () => {
  it('parses the created PR URL from gh stdout', () => {
    expect(parseCreatePrOutput('https://github.com/acme/widgets/pull/123\n')).toEqual({
      number: 123,
      url: 'https://github.com/acme/widgets/pull/123',
    });
  });

  it('extracts the PR URL when gh prints extra text around it', () => {
    expect(parseCreatePrOutput('Opening pull request:\nhttps://github.com/acme/widgets/pull/456\n')).toEqual({
      number: 456,
      url: 'https://github.com/acme/widgets/pull/456',
    });
  });

  it('throws when gh output does not include a PR URL', () => {
    expect(() => parseCreatePrOutput('created pull request successfully')).toThrow(
      /Failed to parse created pull request URL/
    );
  });
});

describe('buildGraphQLPayload', () => {
  it('embeds query and variables as a JSON body', () => {
    const payload = buildGraphQLPayload('query($id: ID!) { node(id: $id) { id } }', {
      id: 'THREAD_1',
      prNumber: 42,
    });
    expect(JSON.parse(payload)).toEqual({
      query: 'query($id: ID!) { node(id: $id) { id } }',
      variables: { id: 'THREAD_1', prNumber: 42 },
    });
  });

  it('preserves a body starting with @ as a literal string value (no gh file semantics)', () => {
    const malicious = '@/Users/victim/.ssh/id_rsa';
    const payload = buildGraphQLPayload('mutation($body: String!) { x(body: $body) }', {
      body: malicious,
    });
    expect(JSON.parse(payload).variables.body).toBe(malicious);
  });

  it('omits null and undefined variables', () => {
    const payload = buildGraphQLPayload('query($after: String) { x }', {
      after: null,
      cursor: undefined,
    });
    expect(JSON.parse(payload).variables).toEqual({});
  });
});

describe('parsePrRef', () => {
  it.each([
    ['a bare number', '123', '123'],
    ['a hash-prefixed number', '#123', '123'],
    ['surrounding whitespace', '  123 ', '123'],
  ])('normalizes %s', (_case, input, expected) => {
    expect(parsePrRef(input)).toBe(expected);
  });

  it('keeps a URL intact so gh resolves it against the repo it names', () => {
    expect(parsePrRef('https://github.com/klaviyo/k-repo/pull/58550')).toBe(
      'https://github.com/klaviyo/k-repo/pull/58550'
    );
  });

  it.each([
    ['a flag', '--json'],
    ['a non-pull GitHub URL', 'https://github.com/klaviyo/k-repo/issues/1'],
    ['a lookalike host', 'https://github.com.evil.test/o/r/pull/1'],
    ['a host that merely ends in github.com', 'https://evilgithub.com/o/r/pull/1'],
    ['a branch name', 'feature/frustration-score'],
  ])('rejects %s', (_case, input) => {
    expect(parsePrRef(input)).toBeNull();
  });
});
