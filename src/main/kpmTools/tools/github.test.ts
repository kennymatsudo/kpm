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
  return { summary: { totalThreads: 0 }, threads: [], topLevelReviews: [], conversationComments: [], ...overrides };
}

async function readPr(input: Record<string, unknown>) {
  const tools = createGitHubTools({} as never, {
    getByProject: () => [{ path: REPO_PATH, active_worktree_path: null }],
  } as never, {} as never) as any[];
  const read = tools.find((tool) => tool.name === 'read_pull_request');
  const result = await runWithToolExecutionContext({ projectId: PROJECT_ID }, () => read.handler({
    includeDiff: false, includeReviews: true, includeResolvedThreads: false, ...input,
  }));
  return { result, body: result.isError ? null : JSON.parse(result.content[0].text) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPrDetails.mockResolvedValue({ number: 7, url: 'https://github.com/other-org/other-repo/pull/7', baseRefName: 'main', body: '' });
  getPrDiff.mockResolvedValue('diff');
  getPrReviewActivity.mockResolvedValue(activity());
});

describe('read_pull_request reviews', () => {
  it('reads reviews from the repository the PR belongs to, not the connected one', async () => {
    await readPr({ pr: 'https://github.com/other-org/other-repo/pull/7' });

    expect(getPrReviewActivity).toHaveBeenCalledWith(
      REPO_PATH, { owner: 'other-org', name: 'other-repo' }, 7, 'https://github.com/other-org/other-repo/pull/7'
    );
  });

  it('skips the review calls unless asked', async () => {
    const { body } = await readPr({ pr: '7', includeReviews: false });

    expect(getPrReviewActivity).not.toHaveBeenCalled();
    expect(body.reviews).toBeUndefined();
  });

  it('leaves resolved threads out by default but says how many', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread(), thread({ isResolved: true, resolvedBy: 'author' })],
    }));

    const { body } = await readPr({ pr: '7' });

    expect(body.reviews.threads).toHaveLength(1);
    expect(body.reviews.resolvedThreadsOmitted).toBe(1);
  });

  it('returns resolved threads when asked', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread(), thread({ isResolved: true, resolvedBy: 'author' })],
    }));

    const { body } = await readPr({ pr: '7', includeResolvedThreads: true });

    expect(body.reviews.threads).toHaveLength(2);
    expect(body.reviews.threads[1].resolvedBy).toBe('author');
  });

  it('drops the empty COMMENTED shells GitHub creates for inline comments', async () => {
    getPrReviewActivity.mockResolvedValue(activity({
      topLevelReviews: [
        { ...comment({ body: '' }), state: 'COMMENTED', submittedAt: null },
        { ...comment({ body: '' }), state: 'APPROVED', submittedAt: null },
      ],
    }));

    const { body } = await readPr({ pr: '7' });

    expect(body.reviews.reviews.map((review: { state: string }) => review.state)).toEqual(['APPROVED']);
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

    const { body } = await readPr({ pr: '7' });

    expect(body.reviews.threads[0].comments[0]).toMatchObject({
      bot: true,
      body: '### Finding\n\nUse `Array<string>` here',
    });
  });

  it('cuts bot discussion comments shorter than review threads', async () => {
    const long = 'x'.repeat(2_000);
    getPrReviewActivity.mockResolvedValue(activity({
      threads: [thread({ comments: [comment({ authorType: 'Bot', body: long })] })],
      conversationComments: [comment({ authorType: 'Bot', body: long })],
    }));

    const { body } = await readPr({ pr: '7' });

    expect(body.reviews.threads[0].comments[0].truncated).toBeUndefined();
    expect(body.reviews.discussion[0]).toMatchObject({ truncated: true });
    expect(body.reviews.discussion[0].body).toHaveLength(1_000);
  });
});
