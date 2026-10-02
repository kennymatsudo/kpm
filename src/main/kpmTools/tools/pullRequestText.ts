/**
 * Renders a pull request for chat as plain text: bracketed section labels (PR
 * bodies and comments carry their own markdown headings, which a markdown
 * heading would blend into), one line per changed file, and the diff as-is. JSON repeated every file's keys and escaped
 * every newline and quote in bodies and diffs, which cost a large share of the
 * tokens in each read without adding anything the model used.
 */

import type { GhPrDetails, GhPrReadiness, PrReviewActivity } from '../../services/repo/ghUtils';
import type { GitHubAuthorType } from '../../../shared/types';

export const MAX_DIFF_CHARS = 60_000;
export const MAX_REVIEW_COMMENT_CHARS = 4_000;
// Bots post their findings as review threads; what they leave in the discussion
// is walkthroughs, coverage, and artifact lists, so it gets a tighter cut.
const MAX_BOT_DISCUSSION_CHARS = 1_000;

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// Named tags only, so a generic like `Array<string>` in a code sample survives.
const PRESENTATION_TAG = /<\/?(?:a|img|picture|source|details|summary|div|span|p|br|hr|sub|sup|b|i|strong|em|table|thead|tbody|tr|td|th)\b[^>]*>/gi;

/**
 * Review bots (Bugbot, CodeRabbit, CI reporters) and PR templates wrap their
 * text in hidden markers, badge images, and multi-kilobyte deep links. GitHub
 * never shows the markers and the link targets are opaque, so dropping them
 * keeps the text a reader sees at a fraction of the tokens.
 */
export function condenseCommentBody(body: string): string {
  return body.replace(HTML_COMMENT, '').replace(PRESENTATION_TAG, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

interface CommentSource {
  author: string;
  authorType: GitHubAuthorType;
  body: string;
}

function renderComment(comment: CommentSource, at: string | null, label?: string | null, maxChars = MAX_REVIEW_COMMENT_CHARS): string {
  const body = condenseCommentBody(comment.body);
  const truncated = body.length > maxChars;
  const heading = [
    `${comment.author}${comment.authorType === 'Bot' ? ' [bot]' : ''}`,
    label,
    at?.slice(0, 16).replace('T', ' '),
  ].filter(Boolean).join(' · ');
  const text = truncated ? `${body.slice(0, maxChars)}\n[truncated at ${maxChars.toLocaleString()} characters]` : body;
  return text ? `${heading}:\n${text}` : `${heading}: (no text)`;
}

function renderReadiness(readiness: GhPrReadiness): string {
  const lines: string[] = [];
  const { checks } = readiness;
  if (checks) {
    lines.push(`Checks: ${checks.passed} passed, ${checks.failed} failed, ${checks.pending} pending, ${checks.skipped} skipped`);
    for (const check of checks.failing) lines.push(`Failing: ${check.name}${check.url ? ` ${check.url}` : ''}`);
    if (checks.pendingNames.length > 0) lines.push(`Pending: ${checks.pendingNames.join(', ')}`);
  } else {
    lines.push('Checks: none reported');
  }
  lines.push(`Review decision: ${readiness.reviewDecision ?? 'none'} · mergeable: ${readiness.mergeable} · merge state: ${readiness.mergeStateStatus}`);
  return lines.join('\n');
}

/**
 * The review activity trimmed to what a reader needs. The empty COMMENTED
 * reviews GitHub creates to hold inline comments are dropped, since the threads
 * already carry those comments.
 */
function renderReviews(activity: PrReviewActivity, includeResolvedThreads: boolean): string {
  const { summary } = activity;
  const threads = activity.threads.filter((thread) => includeResolvedThreads || !thread.isResolved);
  const reviews = activity.topLevelReviews.filter((review) => review.state !== 'COMMENTED' || review.body.trim());
  const sections = [
    `[Reviews]\n${summary.totalThreads} threads (${summary.unresolvedThreads} unresolved, ${summary.resolvedThreads} resolved, ${summary.outdatedThreads} outdated), ${summary.humanThreads} with a human comment, ${summary.botOnlyThreads} bot-only`,
    ...reviews.map((review) => renderComment(review, review.submittedAt, review.state)),
  ];

  if (threads.length > 0) {
    sections.push('[Inline threads]');
    for (const thread of threads) {
      const location = [
        `${thread.path}${thread.line ? `:${thread.line}` : ''}`,
        thread.isOutdated && 'outdated',
        thread.isResolved && `resolved${thread.resolvedBy ? ` by ${thread.resolvedBy}` : ''}`,
        thread.url,
      ].filter(Boolean).join(' · ');
      sections.push([`Thread ${location}`, ...thread.comments.map((comment) => renderComment(comment, comment.createdAt))].join('\n\n'));
    }
  }
  const omitted = activity.threads.length - threads.length;
  if (omitted > 0) sections.push(`${omitted} resolved thread${omitted === 1 ? '' : 's'} omitted; set includeResolvedThreads to read them.`);

  if (activity.conversationComments.length > 0) {
    sections.push('[Discussion]');
    for (const comment of activity.conversationComments) {
      sections.push(renderComment(comment, comment.createdAt, undefined, comment.authorType === 'Bot' ? MAX_BOT_DISCUSSION_CHARS : MAX_REVIEW_COMMENT_CHARS));
    }
  }
  return sections.join('\n\n');
}

const DIFF_FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

function matchesPath(filePath: string, wanted: string): boolean {
  const prefix = wanted.replace(/\/+$/, '');
  return filePath === prefix || filePath.startsWith(`${prefix}/`);
}

/** Keeps only the per-file sections of a unified diff that touch one of `paths` (a file or a directory). */
export function filterDiffByPaths(diff: string, paths: readonly string[]): string {
  const kept: string[] = [];
  let keep = false;
  for (const line of diff.split('\n')) {
    const header = DIFF_FILE_HEADER.exec(line);
    if (header) keep = paths.some((wanted) => matchesPath(header[1], wanted) || matchesPath(header[2], wanted));
    if (keep) kept.push(line);
  }
  return kept.join('\n');
}

export interface PullRequestTextInput {
  details: GhPrDetails;
  reviews?: { activity: PrReviewActivity; includeResolvedThreads: boolean };
  diff?: { text: string; paths?: readonly string[] };
}

export function renderPullRequest({ details, reviews, diff }: PullRequestTextInput): string {
  const state = [details.state, details.isDraft && 'draft'].filter(Boolean).join(', ');
  const sections = [
    [
      `PR #${details.number}: ${details.title}`,
      details.url,
      `${state} · by ${details.author ?? 'unknown'} · ${details.headRefName ?? '?'} into ${details.baseRefName ?? '?'} · +${details.additions} -${details.deletions} across ${details.changedFiles} files`,
    ].join('\n'),
  ];
  if (details.readiness) sections.push(renderReadiness(details.readiness));

  const body = condenseCommentBody(details.body);
  sections.push(`[Description]\n${body || '(empty)'}`);

  if (details.files.length > 0) {
    sections.push(`[Files]\n${details.files.map((file) => `+${file.additions} -${file.deletions} ${file.path}`).join('\n')}`);
  }

  if (reviews) sections.push(renderReviews(reviews.activity, reviews.includeResolvedThreads));

  if (diff) {
    const scoped = diff.paths?.length ? filterDiffByPaths(diff.text, diff.paths) : diff.text;
    if (!scoped.trim()) {
      sections.push(`[Diff]\nNo changed file matches ${diff.paths?.join(', ')}; the Files list above has every path.`);
    } else if (scoped.length > MAX_DIFF_CHARS) {
      sections.push(
        `[Diff, cut at ${MAX_DIFF_CHARS.toLocaleString()} characters; the Files list is complete. Pass paths to read the rest a few files at a time.]\n` +
        scoped.slice(0, MAX_DIFF_CHARS)
      );
    } else {
      sections.push(`[Diff]\n${scoped}`);
    }
  }

  return sections.join('\n\n');
}
