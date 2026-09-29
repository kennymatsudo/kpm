import type * as ChildProcess from 'child_process';
import { describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  execFile: execFileMock,
}));

import {
  buildCreatePrArgs,
  buildEditPrArgs,
  buildGraphQLPayload,
  buildListPrArgs,
  classifyGhAuthError,
  getPrByNumber,
  listPrs,
  parsePrIdentifier,
  parseCreatePrOutput,
  parseGhAuthOutput,
  parsePrRef,
  repoOfPrUrl,
  summarizeChecks,
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

describe('buildListPrArgs', () => {
  it('binds every filter value to its flag so a leading dash cannot become a flag', () => {
    const args = buildListPrArgs({
      repo: 'klaviyo/k-repo',
      head: '--web',
      author: '-x',
      search: '--json=body',
      state: 'all',
      limit: 21,
    });

    expect(args.slice(0, 2)).toEqual(['pr', 'list']);
    expect(args.slice(2).every((arg) => /^--[a-z]+=/.test(arg))).toBe(true);
    expect(args).toEqual(expect.arrayContaining(['--head=--web', '--author=-x', '--search=--json=body']));
  });
});

describe('summarizeChecks', () => {
  it('reads check runs by conclusion and legacy statuses by state', () => {
    const summary = summarizeChecks([
      { name: 'Unit tests', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'Linting', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://buildkite.com/b/1' },
      { name: 'Optional', status: 'COMPLETED', conclusion: 'NEUTRAL' },
      { name: 'Deploy preview', status: 'IN_PROGRESS', conclusion: null },
      { context: 'coverage', state: 'SUCCESS' },
      { context: 'legacy-ci', state: 'ERROR', targetUrl: 'https://ci.example.com/2' },
    ]);

    expect(summary).toEqual({
      passed: 2,
      failed: 2,
      pending: 1,
      skipped: 1,
      failing: [
        { name: 'Linting', url: 'https://buildkite.com/b/1' },
        { name: 'legacy-ci', url: 'https://ci.example.com/2' },
      ],
      pendingNames: ['Deploy preview'],
    });
  });

  it('returns null when the PR has no checks', () => {
    expect(summarizeChecks([])).toBeNull();
  });
});

describe('listPrs', () => {
  it('flattens the author and reports an empty review decision as none', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback: (err: null, out: { stdout: string; stderr: string }) => void) => {
      callback(null, {
        stdout: JSON.stringify([{
          number: 7,
          url: 'https://github.com/o/r/pull/7',
          title: 'T',
          state: 'OPEN',
          isDraft: false,
          author: { login: 'octo', name: 'Octo' },
          headRefName: 'feature',
          baseRefName: 'main',
          reviewDecision: '',
          updatedAt: '2026-09-25T00:00:00Z',
          mergedAt: null,
        }]),
        stderr: '',
      });
    });

    const [entry] = await listPrs('/repo', { state: 'open', limit: 5 });

    expect(entry.author).toBe('octo');
    expect(entry.reviewDecision).toBeNull();
  });
});

describe('buildListPrArgs readiness', () => {
  it('asks gh for the check rollup only when readiness is requested', () => {
    const fieldsOf = (args: string[]) => args.find((arg) => arg.startsWith('--json='))!;

    expect(fieldsOf(buildListPrArgs({ state: 'open', limit: 5 }))).not.toContain('statusCheckRollup');
    expect(fieldsOf(buildListPrArgs({ state: 'open', limit: 5, includeReadiness: true }))).toContain('statusCheckRollup');
  });
});

describe('buildEditPrArgs', () => {
  it('sends the body over stdin rather than on the command line', () => {
    expect(buildEditPrArgs('12', { title: 'New', body: 'Long body' })).toEqual([
      'pr', 'edit', '12', '--title=New', '--body-file=-',
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

describe('repoOfPrUrl', () => {
  it.each([
    ['github.com', 'https://github.com/klaviyo/k-repo/pull/71540', { owner: 'klaviyo', name: 'k-repo' }],
    ['an Enterprise host', 'https://git.example.com/team/app/pull/3/files', { owner: 'team', name: 'app' }],
    ['a non-PR URL', 'https://github.com/klaviyo/k-repo/issues/4', null],
  ])('reads %s', (_case, url, expected) => {
    expect(repoOfPrUrl(url)).toEqual(expected);
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

describe('parsePrIdentifier', () => {
  it('keeps the repository a URL names', () => {
    expect(parsePrIdentifier('https://github.com/org/b/pull/12/files')).toEqual({
      number: 12,
      repo: { owner: 'org', name: 'b' },
    });
  });

  it.each(['12', '#12', ' 12 '])('leaves the repository open for %j', (input) => {
    expect(parsePrIdentifier(input)).toEqual({ number: 12, repo: null });
  });

  it('rejects anything else', () => {
    expect(parsePrIdentifier('--repo=x')).toBeNull();
  });
});

describe('getPrByNumber', () => {
  function failGhWith(error: Error) {
    execFileMock.mockImplementation((_file, _args, _options, callback: (err: Error) => void) => {
      callback(error);
    });
  }

  it('reports passing check runs as passing, not pending', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback: (err: null, out: { stdout: string; stderr: string }) => void) => {
      callback(null, {
        stdout: JSON.stringify({
          number: 12, url: 'https://github.com/o/r/pull/12', state: 'OPEN', reviewDecision: '', additions: 1, deletions: 0,
          mergeable: 'MERGEABLE', isDraft: false,
          statusCheckRollup: [{ __typename: 'CheckRun', name: 'Unit tests', status: 'COMPLETED', conclusion: 'SUCCESS' }],
        }),
        stderr: '',
      });
    });

    await expect(getPrByNumber('/repo', 12)).resolves.toMatchObject({ checksStatus: 'SUCCESS' });
  });

  it('returns null when the repository has no such PR', async () => {
    failGhWith(execError({ stderr: 'GraphQL: Could not resolve to a PullRequest with the number of 99. (repository.pullRequest)' }));

    await expect(getPrByNumber('/repo', 99)).resolves.toBeNull();
  });

  it.each([
    ['a rejected credential', execError({ stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)' })],
    ['a missing gh binary', execError({ code: 'ENOENT' })],
    ['a dropped connection', execError({ stderr: 'error connecting to api.github.com' })],
  ])('throws on %s so it is not reported as not found', async (_case, error) => {
    failGhWith(error);

    await expect(getPrByNumber('/repo', 12)).rejects.toBe(error);
  });
});
