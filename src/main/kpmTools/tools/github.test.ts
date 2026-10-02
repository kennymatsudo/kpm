import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runWithToolExecutionContext } from '../runtime';
import { createGitHubTools } from './github';
import type * as GhUtils from '../../services/repo/ghUtils';
import type { PrReviewActivity } from '../../services/repo/ghUtils';

const getPrDetails = vi.fn();
const getPrDiff = vi.fn();
const getPrReviewActivity = vi.fn();

vi.mock('../../services/repo/ghUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof GhUtils>()),
  getPrDetails: (...args: unknown[]) => getPrDetails(...args),
  getPrDiff: (...args: unknown[]) => getPrDiff(...args),
  getPrReviewActivity: (...args: unknown[]) => getPrReviewActivity(...args),
}));

vi.mock('../../config', () => ({ getConfig: () => ({ claude: { debug: false } }) }));

const PROJECT_ID = '7f3c2a1e-4b5d-4c6e-8f90-1a2b3c4d5e6f';
const REPO_PATH = '/repos/kpm';

function comment(overrides: Record<string, unknown> = {}) {
  return { author: 'reviewer', authorType: 'User', body: 'Looks off', createdAt: '2026-09-29T00:00:00Z', ...overrides };
}

function thread(overrides: Record<string, unknown> = {}) {
  return {
    path: 'src/a.ts', line: 3, isResolved: false, isOutdated: false, resolvedBy: null,
    url: 'https://github.com/o/r/pull/7#discussion_r1', comments: [comment()], ...overrides,
  };
}

function activity(overrides: Partial<Record<keyof PrReviewActivity, unknown>> = {}) {
  return { summary: { totalThreads: 0, unresolvedThreads: 0, resolvedThreads: 0, outdatedThreads: 0, humanThreads: 0, botOnlyThreads: 0 }, threads: [], topLevelReviews: [], conversationComments: [], ...overrides };
}

async function readPr(input: Record<string, unknown>) {
  const tools = createGitHubTools({} as never, {
    getByProject: () => [{ path: REPO_PATH, active_worktree_path: null }],
  } as never, {} as never) as any[];
  const read = tools.find((tool) => tool.name === 'read_pull_request');
  const result = await runWithToolExecutionContext({ projectId: PROJECT_ID }, () => read.handler({
    includeDiff: false, includeReviews: true, includeResolvedThreads: false, ...input,
  }));
  return { result, text: result.content[0].text as string };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPrDetails.mockResolvedValue({
    number: 7, url: 'https://github.com/other-org/other-repo/pull/7', title: 'Fix login', state: 'OPEN', isDraft: false,
    author: 'alice', baseRefName: 'main', headRefName: 'fix-login', body: '', additions: 3, deletions: 1, changedFiles: 2,
    files: [{ path: 'src/a.ts', additions: 2, deletions: 1 }, { path: 'docs/b.md', additions: 1, deletions: 0 }],
  });
  getPrDiff.mockResolvedValue('diff');
  getPrReviewActivity.mockResolvedValue(activity());
});

const TWO_FILE_DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  'diff --git a/docs/b.md b/docs/b.md',
  '--- a/docs/b.md',
  '+++ b/docs/b.md',
  '@@ -0,0 +1 @@',
  '+doc',
].join('\n');

describe('read_pull_request', () => {
  it('lists the header, an empty description, and one line per changed file', async () => {
    const { text } = await readPr({ pr: '7', includeReviews: false });

    expect(text).toBe([
      'PR #7: Fix login',
      'https://github.com/other-org/other-repo/pull/7',
      'OPEN · by alice · fix-login into main · +3 -1 across 2 files',
      '',
      '[Description]',
      '(empty)',
      '',
      '[Files]',
      '+2 -1 src/a.ts',
      '+1 -0 docs/b.md',
    ].join('\n'));
  });

  it('returns only the diff sections under the requested paths', async () => {
    getPrDiff.mockResolvedValue(TWO_FILE_DIFF);

    const { text } = await readPr({ pr: '7', includeReviews: false, includeDiff: true, paths: ['docs/'] });

    expect(text.split('[Diff]\n')[1]).toBe([
      'diff --git a/docs/b.md b/docs/b.md',
      '--- a/docs/b.md',
      '+++ b/docs/b.md',
      '@@ -0,0 +1 @@',
      '+doc',
    ].join('\n'));
  });

  it('says so when no changed file matches the requested paths', async () => {
    getPrDiff.mockResolvedValue(TWO_FILE_DIFF);

    const { text } = await readPr({ pr: '7', includeReviews: false, includeDiff: true, paths: ['src/missing.ts'] });

    expect(text).toContain('[Diff]\nNo changed file matches src/missing.ts; the Files list above has every path.');
  });
});

describe('read_pull_request reviews', () => {
  it('reads reviews from the repository the PR belongs to, not the connected one', async () => {
    await readPr({ pr: 'https://github.com/other-org/other-repo/pull/7' });

    expect(getPrReviewActivity).toHaveBeenCalledWith(
      REPO_PATH, { owner: 'other-org', name: 'other-repo' }, 7, 'https://github.com/other-org/other-repo/pull/7'
    );
  });

  it('skips the review calls unless asked', async () => {
    const { text } = await readPr({ pr: '7', includeReviews: false });

    expect(getPrReviewActivity).not.toHaveBeenCalled();
    expect(text).not.toContain('[Reviews]');
  });

  it('leaves resolved threads out by default but says how many', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread(), thread({ path: 'src/resolved.ts', isResolved: true, resolvedBy: 'author' })],
    }));

    const { text } = await readPr({ pr: '7' });

    expect(text).toContain('Thread src/a.ts:3 · https://github.com/o/r/pull/7#discussion_r1');
    expect(text).not.toContain('src/resolved.ts');
    expect(text).toContain('1 resolved thread omitted; set includeResolvedThreads to read them.');
  });

  it('returns resolved threads when asked', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread(), thread({ path: 'src/resolved.ts', isResolved: true, resolvedBy: 'author' })],
    }));

    const { text } = await readPr({ pr: '7', includeResolvedThreads: true });

    expect(text).toContain('Thread src/resolved.ts:3 · resolved by author · https://github.com/o/r/pull/7#discussion_r1');
  });

  it('drops the empty COMMENTED shells GitHub creates for inline comments', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      topLevelReviews: [
        { ...comment({ author: 'shell', body: '' }), state: 'COMMENTED', submittedAt: null },
        { ...comment({ author: 'bob', body: '' }), state: 'APPROVED', submittedAt: null },
      ],
    }));

    const { text } = await readPr({ pr: '7' });

    expect(text).toContain('bob · APPROVED: (no text)');
    expect(text).not.toContain('shell');
  });

  it('strips hidden markers and HTML wrappers but keeps generics in code', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread({
        comments: [comment({
          authorType: 'Bot',
          body: '<!-- BUGBOT -->\n### Finding\n\n<a href="https://cursor.com/open?link=abc"><img src="x.png"></a>\n\n\n\nUse `Array<string>` here',
        })],
      })],
    }));

    const { text } = await readPr({ pr: '7' });

    expect(text).toContain('reviewer [bot] · 2026-09-29 00:00:\n### Finding\n\nUse `Array<string>` here');
  });

  it('cuts bot discussion comments shorter than review threads', async () => {
    const long = 'x'.repeat(2_000);
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread({ comments: [comment({ authorType: 'Bot', body: long })] })],
      conversationComments: [comment({ authorType: 'Bot', body: long })],
    }));

    const { text } = await readPr({ pr: '7' });

    expect(text).toContain(`[bot] · 2026-09-29 00:00:\n${long}\n\n`);
    expect(text).toContain(`${'x'.repeat(1_000)}\n[truncated at 1,000 characters]`);
  });
});
