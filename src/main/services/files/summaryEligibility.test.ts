import { describe, expect, it } from 'vitest';
import { containsLikelySecret, isSummarizablePath } from './summaryEligibility';

describe('isSummarizablePath', () => {
  it.each([
    'README.md',
    'meeting_notes/2026-08-07-customer-agent-composer-meeting.md',
    'decisions/2026-06-22-support-attachment-byte-owner.md',
    'docs/guide.mdx',
    'notes.txt',
    'design-tokens.md',
  ])('summarizes the prose document %s', (filePath) => {
    expect(isSummarizablePath(filePath)).toBe(true);
  });

  it.each([
    ['.env', 'a dotfile'],
    ['.env.local', 'a dotfile'],
    ['.playwright-mcp/page-2026-07-09.yml', 'a tool snapshot folder'],
    ['.github/pull_request_template.md', 'a dot-folder'],
    ['docs/.drafts/idea.md', 'a nested dot-folder'],
    ['config.yaml', 'data or config'],
    ['package.json', 'data or config'],
    ['pyproject.toml', 'data or config'],
    ['node_modules/pkg/README.md', 'a dependency folder'],
    ['dist/CHANGELOG.md', 'build output'],
    ['coverage/report.txt', 'build output'],
    ['secrets.md', 'a credential file name'],
    ['ops/aws-credentials.txt', 'a credential file name'],
    ['api_keys.md', 'a credential file name'],
    ['diagram.png', 'not text'],
  ])('skips %s (%s)', (filePath) => {
    expect(isSummarizablePath(filePath)).toBe(false);
  });
});

describe('containsLikelySecret', () => {
  it.each([
    ['a private key block', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc'],
    ['an AWS access key id', 'key: AKIAIOSFODNN7EXAMPLE'],
    ['a GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['a Slack token', 'xoxb-1234567890-abcdefghij'],
    ['an sk- key', 'use sk-ant-api03-abcdefghijklmnopqrstuv'],
    ['an env assignment', 'export STRIPE_SECRET_KEY=abcd1234efgh'],
  ])('flags %s', (_label, content) => {
    expect(containsLikelySecret(content)).toBe(true);
  });

  it('leaves prose that only talks about tokens and keys alone', () => {
    expect(containsLikelySecret('We rotate the API token weekly; set API_KEY in your shell before running.')).toBe(false);
  });
});
