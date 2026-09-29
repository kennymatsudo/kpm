/**
 * GitHub Integration Tools
 *
 * PR description generation from project context, reading a pull request that
 * is not the current branch's, and searching pull requests.
 *
 * All run `gh` from the main process. That is the whole point of the read tools:
 * chat's Bash is sandboxed away from `~/.config/gh` and from every host but
 * localhost, so `gh` in the shell can never see a PR, whatever the user's gh
 * login says. See sdkOptionsBuilder.ts.
 */

import { z } from 'zod';
import * as path from 'path';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { IPlanItemRepository, IRepoRepository, IDevSessionRepository } from '../../db/interfaces';
import {
  getCommittedDiff,
  getCommitLog,
  getRecentCommits,
} from '../../services/repo/gitUtils';
import { resolveCurrentBranch, resolveDefaultBranch } from '../../services/repo/branchFacts';
import {
  describeGhFailure,
  getPrDetails,
  getPrDiff,
  getPrReviewActivity,
  listPrs,
  parsePrRef,
  repoOfPrUrl,
  type PrReviewActivity,
} from '../../services/repo/ghUtils';
import type { GitHubAuthorType } from '../../../shared/types';
import { resolveConnectedRepoPath } from './connectedRepo';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

const MAX_DIFF_CHARS = 100_000;
const MAX_REVIEW_COMMENT_CHARS = 4_000;
// Bots post their findings as review threads; what they leave in the discussion
// is walkthroughs, coverage, and artifact lists, so it gets a tighter cut.
const MAX_BOT_DISCUSSION_CHARS = 1_000;
const DEFAULT_PR_SEARCH_LIMIT = 20;
const MAX_PR_SEARCH_LIMIT = 100;
/** Rejects anything that is not a plain `owner/name` slug before it reaches gh. */
const REPO_SLUG = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/;

const READ_PR_DESCRIPTION = `Read a pull request from GitHub: title, body, state, author, base/head branches, changed files, and optionally the diff and the review activity.

## When to use
Any time the user names a PR — a URL, \`#123\`, or a bare number — including PRs in repos that are not connected to this project. This is the only way to reach GitHub: \`gh\` and \`git fetch\` in Bash are sandboxed away from your credentials and from the network, so they fail no matter how the user is authenticated. Do not report a PR as unreachable until this tool has failed. No number yet? Find it with \`find_pull_requests\` first.

## Parameters
- \`projectId\`: The project UUID.
- \`pr\`: PR URL, \`#123\`, or \`123\`. A bare number resolves against the connected repo's remote; a URL resolves against the repo it names.
- \`repoPath\`: Absolute path of the connected repo to run from. Optional when exactly one repo is connected. Only decides which \`gh\` config and remote are used, not which PR is read.
- \`includeDiff\`: Include the unified diff (default true). The diff is usually most of the response, so set false whenever the question is not about the code: status, description, reviews, or before editing the PR.
- \`includeReviews\`: Include reviews (approve / request changes and their summaries), inline review threads with file and line, and the discussion comments (default false). Set true when asked what reviewers said, whether feedback is addressed, or what a bot flagged.
- \`includeResolvedThreads\`: With \`includeReviews\`, also return resolved review threads (default false; they are counted either way).
- \`includeChecks\`: Include merge readiness (default false): CI check counts with the failing and pending check names, the review decision, \`mergeable\`, and \`mergeStateStatus\`. Set true for "is it green", "why is it blocked", or "is it ready to merge".

## Notes
- The diff is truncated past ${MAX_DIFF_CHARS.toLocaleString()} characters; the response says so and lists every changed file with its line counts, so report the truncation rather than treating the visible part as the whole PR.
- Each comment is cut at ${MAX_REVIEW_COMMENT_CHARS.toLocaleString()} characters (bot discussion comments at ${MAX_BOT_DISCUSSION_CHARS.toLocaleString()}) and marked \`truncated\`; say so rather than guessing at the rest. Bots report findings as review threads, which keep the higher limit. Threads carry a \`url\` for the user to open.
- Reviews, threads, and checks are a snapshot. Re-read after the user says they replied, pushed, or re-ran CI.
- A failing check's \`url\` points at its CI run; use a CI tool (such as Buildkite) on it for logs when one is available.
- \`mergeable\` and \`mergeStateStatus\` read \`UNKNOWN\` while GitHub is still computing them; say so rather than treating it as blocked.`;

interface ChatReviewComment {
  author: string;
  bot?: true;
  body: string;
  truncated?: true;
  at: string | null;
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// Named tags only, so a generic like `Array<string>` in a code sample survives.
const PRESENTATION_TAG = /<\/?(?:a|img|picture|source|details|summary|div|span|p|br|hr|sub|sup|b|i|strong|em|table|thead|tbody|tr|td|th)\b[^>]*>/gi;

/**
 * Review bots (Bugbot, CodeRabbit, CI reporters) wrap their text in hidden
 * markers, badge images, and multi-kilobyte deep links. GitHub never shows the
 * markers and the link targets are opaque, so dropping them keeps the text a
 * reader sees at a fraction of the tokens.
 */
function condenseCommentBody(body: string): string {
  return body.replace(HTML_COMMENT, '').replace(PRESENTATION_TAG, '').replace(/\n{3,}/g, '\n\n').trim();
}

function toChatComment(
  comment: { author: string; authorType: GitHubAuthorType; body: string },
  at: string | null,
  maxChars = MAX_REVIEW_COMMENT_CHARS,
): ChatReviewComment {
  const body = condenseCommentBody(comment.body);
  const truncated = body.length > maxChars;
  return {
    author: comment.author,
    ...(comment.authorType === 'Bot' && { bot: true as const }),
    body: truncated ? body.slice(0, maxChars) : body,
    ...(truncated && { truncated: true as const }),
    at,
  };
}

/**
 * The review activity trimmed to what a reader needs: GraphQL ids, permission
 * flags, and derived previews are dropped, as are the empty COMMENTED reviews
 * GitHub creates to hold inline comments, which the threads already carry.
 */
function toChatReviews(activity: PrReviewActivity, includeResolvedThreads: boolean) {
  const threads = activity.threads.filter((thread) => includeResolvedThreads || !thread.isResolved);
  return {
    summary: activity.summary,
    reviews: activity.topLevelReviews
      .filter((review) => review.state !== 'COMMENTED' || review.body.trim())
      .map((review) => ({ ...toChatComment(review, review.submittedAt), state: review.state })),
    threads: threads.map((thread) => ({
      path: thread.path,
      line: thread.line,
      ...(thread.isOutdated && { outdated: true }),
      ...(thread.isResolved && { resolvedBy: thread.resolvedBy }),
      url: thread.url,
      comments: thread.comments.map((comment) => toChatComment(comment, comment.createdAt)),
    })),
    discussion: activity.conversationComments.map((comment) =>
      toChatComment(comment, comment.createdAt, comment.authorType === 'Bot' ? MAX_BOT_DISCUSSION_CHARS : MAX_REVIEW_COMMENT_CHARS)
    ),
    ...(threads.length < activity.threads.length && { resolvedThreadsOmitted: activity.threads.length - threads.length }),
  };
}

const FIND_PRS_DESCRIPTION = `Search pull requests on GitHub by head branch, author, state, or GitHub search text. Returns number, title, state, draft flag, author, branches, review decision, and last-updated / merged times — no bodies or diffs; CI checks on request.

## When to use
Whenever you need a PR but have no number: "which PR carries this branch", "what has X opened", "what merged this week", "is there already a PR for my branch". Never scan PR numbers or match commits against PR heads to find one — search here, then read the hit with \`read_pull_request\`.

## Parameters
- \`projectId\`: The project UUID.
- \`repo\`: \`owner/name\` to search, e.g. \`klaviyo/k-repo\`. Defaults to the repo at \`repoPath\`; set it for a repo that is not connected.
- \`repoPath\`: Absolute path of a connected repo to run from. Optional when exactly one repo is connected.
- \`head\`: Exact head branch name, without an \`owner:\` prefix.
- \`author\`: GitHub login, or \`@me\` for the user.
- \`state\`: \`open\` (default), \`closed\`, \`merged\`, or \`all\`.
- \`search\`: GitHub search syntax, e.g. \`review-requested:@me\`, \`merged:>=2026-09-01\`, or words from the title.
- \`limit\`: Maximum results (default ${DEFAULT_PR_SEARCH_LIMIT}, max ${MAX_PR_SEARCH_LIMIT}).
- \`includeChecks\`: Add each PR's merge readiness (CI check counts with failing and pending names, \`mergeable\`, \`mergeStateStatus\`), the same as \`read_pull_request\` returns (default false). Set true when comparing several PRs, e.g. "which of my PRs are ready to merge"; for one PR, use \`read_pull_request\`.

## Notes
- Results are newest first. When \`truncated\` is true, narrow the filters rather than concluding a PR does not exist.
- An empty result for \`head\` means no PR in that repo has that head branch, in the given state — widen \`state\` to \`all\` before saying so.`;

/**
 * Create GitHub integration tools.
 */
export function createGitHubTools(
  planItemRepo: IPlanItemRepository,
  repoRepo: IRepoRepository,
  devSessionRepo: IDevSessionRepository
) {
  return [
    tool(
      'generate_pr_description',
      `Generate a pull request description for changes in a repository. Gathers git diff, commit log, plan item context, and cross-repo awareness to produce a comprehensive PR description.

Use this when the user wants to create a PR description for their current work. The description is returned directly in the conversation for review and refinement.

Requires at least a plan_item_id (to find the repo and context) or a repo_id.`,
      {
        plan_item_id: z.string().optional().describe('Plan item ID for context. Also used to find the associated repo and dev session.'),
        repo_id: z.string().optional().describe('Repository ID. Required if no plan_item_id, or to override the repo.'),
        base_branch: z.string().optional().describe('Base branch to diff against (defaults to main/master auto-detection).'),
      },
      async ({ plan_item_id, repo_id, base_branch }) => {
        try {
          // Resolve repo
          let resolvedRepoId = repo_id;
          let planItem: { id: string; title: string; description: string | null; external_key: string | null; parent_id: string | null; project_id: string } | undefined;

          if (plan_item_id) {
            planItem = planItemRepo.get(plan_item_id) as typeof planItem;
            if (!planItem) {
              return jsonResult({ success: false, error: `Plan item not found: ${plan_item_id}` });
            }

            // If no repo specified, try to find via dev session
            if (!resolvedRepoId) {
              const devSession = devSessionRepo.getByPlanItem(plan_item_id);
              if (devSession) {
                resolvedRepoId = devSession.repo_id;
              } else if (planItem.project_id) {
                // Fall back to single repo if project has only one
                const projectRepos = repoRepo.getByProject(planItem.project_id);
                if (projectRepos.length === 1) {
                  resolvedRepoId = projectRepos[0].id;
                } else if (projectRepos.length > 1) {
                  return jsonResult({
                    success: false,
                    error: `Multiple repos available. Specify repo_id. Options: ${projectRepos.map(r => `${r.id} (${path.basename(r.path)})`).join(', ')}`,
                  });
                }
              }
            }
          }

          if (!resolvedRepoId) {
            return jsonResult({ success: false, error: 'Could not determine repository. Provide repo_id or plan_item_id with an associated dev session.' });
          }

          const repo = repoRepo.getById(resolvedRepoId);
          if (!repo) {
            return jsonResult({ success: false, error: `Repository not found: ${resolvedRepoId}` });
          }

          // Gather context
          const repoPath = resolveEffectiveRepoPath(repo);
          const baseBranch = base_branch || await resolveDefaultBranch(repoPath);
          const currentBranch = await resolveCurrentBranch(repoPath);
          const diff = await getCommittedDiff(repoPath, baseBranch, 80_000);
          const commitLog = await getCommitLog(repoPath, baseBranch);

          // Build context sections
          const sections: string[] = [];

          if (currentBranch) {
            sections.push(`Branch: \`${currentBranch}\` -> \`${baseBranch}\``);
          }

          if (diff.trim()) {
            sections.push(`Net Diff (authoritative current PR contents):\nDescribe the final branch state, not the sequence of intermediate commits.\n\n\`\`\`diff\n${diff}\n\`\`\``);
          } else {
            sections.push('No changes detected in diff.');
          }

          if (commitLog) {
            sections.push(`Commit History (secondary chronology only):\nUse this for intent and grouping. Do not report reverted or abandoned approaches unless they remain in the net diff.\n\n\`\`\`\n${commitLog}\n\`\`\``);
          }

          // Plan item context
          if (planItem) {
            let ctx = `Plan Item: **${planItem.title}**`;
            if (planItem.external_key) ctx += ` (${planItem.external_key})`;
            if (planItem.description) ctx += `\n\n${planItem.description}`;

            if (planItem.parent_id) {
              const parent = planItemRepo.get(planItem.parent_id);
              if (parent) {
                ctx += `\n\nParent: **${parent.title}**`;
                if (parent.external_key) ctx += ` (${parent.external_key})`;
              }
            }
            sections.push(ctx);
          }

          // Dev session instructions
          if (plan_item_id) {
            const devSession = devSessionRepo.getByPlanItem(plan_item_id);
            if (devSession?.initial_instructions) {
              sections.push(`Implementation instructions:\n${devSession.initial_instructions}`);
            }
          }

          // Cross-repo changes
          if (planItem?.project_id) {
            const allRepos = repoRepo.getByProject(planItem.project_id);
            const otherRepos = allRepos.filter(r => r.id !== resolvedRepoId);
            const crossRepoInfo: string[] = [];
            for (const other of otherRepos) {
              const recentCommits = await getRecentCommits(resolveEffectiveRepoPath(other));
              if (recentCommits) {
                crossRepoInfo.push(`${path.basename(other.path)}:\n${recentCommits}`);
              }
            }
            if (crossRepoInfo.length > 0) {
              sections.push(`Related changes in other repos:\n${crossRepoInfo.join('\n\n')}`);
            }
          }

          return jsonResult({
            success: true,
            repo: path.basename(repo.path),
            branch: currentBranch,
            baseBranch,
            context: sections.join('\n\n---\n\n'),
            instruction: 'Use the net diff above as the source of truth for the PR description. Be concise, focus on the final behavior and why it matters. Use commit history only for intent/grouping, and reference the plan item/ticket if available.',
          });
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
    tool(
      'read_pull_request',
      READ_PR_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        pr: z.string().describe('PR URL, "#123", or "123".'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.'),
        includeDiff: z.boolean().default(true).describe('Include the unified diff.'),
        includeReviews: z.boolean().default(false).describe('Include reviews, review threads, and discussion comments.'),
        includeResolvedThreads: z.boolean().default(false).describe('With includeReviews, also return resolved threads.'),
        includeChecks: z.boolean().default(false).describe('Include CI checks and merge readiness.'),
      },
      async ({ projectId, pr, repoPath, includeDiff, includeReviews, includeResolvedThreads, includeChecks }) => {
        const resolution = resolveConnectedRepoPath(repoRepo.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        const prRef = parsePrRef(pr);
        if (!prRef) {
          return toolError(`"${pr}" is not a PR number or a github.com pull request URL.`);
        }

        toolLog(`[KPM Tools] read_pull_request ${prRef} @ ${cwd}`);

        try {
          const details = await getPrDetails(cwd, prRef, { includeReadiness: includeChecks });
          const prRepo = repoOfPrUrl(details.url);
          if (includeReviews && !prRepo) {
            return toolError(`Could not tell which repository ${details.url} belongs to, so its reviews cannot be read.`);
          }

          const [diff, reviewActivity] = await Promise.all([
            includeDiff ? getPrDiff(cwd, prRef) : undefined,
            includeReviews && prRepo ? getPrReviewActivity(cwd, prRepo, details.number, details.url) : undefined,
          ]);

          const reviews = reviewActivity && toChatReviews(reviewActivity, includeResolvedThreads);
          if (diff === undefined) {
            return jsonResult({ success: true, ...details, ...(reviews && { reviews }) });
          }

          const truncated = diff.length > MAX_DIFF_CHARS;
          return jsonResult({
            success: true,
            ...details,
            ...(reviews && { reviews }),
            diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff,
            diffTruncated: truncated,
            ...(truncated && {
              truncationNote:
                `Diff cut at ${MAX_DIFF_CHARS.toLocaleString()} characters; the file list is complete. ` +
                `If this repo is the PR's, read one file in full with git_read fetch ["origin", "pull/${details.number}/head"] ` +
                `then git_read diff ["origin/${details.baseRefName}...FETCH_HEAD", "--", "<path>"].`,
            }),
          });
        } catch (error) {
          return toolError(await describeGhFailure(cwd, error));
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
    tool(
      'find_pull_requests',
      FIND_PRS_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        repo: z.string().regex(REPO_SLUG, 'Expected owner/name').optional().describe('owner/name to search; defaults to the repo at repoPath.'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.'),
        head: z.string().min(1).optional().describe('Exact head branch name.'),
        author: z.string().min(1).optional().describe('GitHub login, or @me.'),
        state: z.enum(['open', 'closed', 'merged', 'all']).default('open'),
        search: z.string().min(1).optional().describe('GitHub search syntax.'),
        limit: z.number().int().min(1).max(MAX_PR_SEARCH_LIMIT).default(DEFAULT_PR_SEARCH_LIMIT),
        includeChecks: z.boolean().default(false).describe('Add each PR\'s CI checks and merge readiness.'),
      },
      async ({ projectId, repo, repoPath, head, author, state, search, limit, includeChecks }) => {
        const resolution = resolveConnectedRepoPath(repoRepo.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        toolLog(`[KPM Tools] find_pull_requests ${repo ?? '(connected repo)'} @ ${cwd}`);

        try {
          // One extra row says whether the limit cut the list short.
          const found = await listPrs(cwd, { repo, head, author, search, state, limit: limit + 1, includeReadiness: includeChecks });
          return jsonResult({
            success: true,
            pullRequests: found.slice(0, limit),
            truncated: found.length > limit,
          });
        } catch (error) {
          return toolError(await describeGhFailure(cwd, error));
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
  ];
}
