import { describe, expect, it } from 'vitest';
import { buildCreatePrArgs, buildGraphQLPayload, parseCreatePrOutput } from './ghUtils';

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
