/**
 * GitHub Integration Tools
 *
 * PR description generation from project context, reading a pull request that
 * is not the current branch's, and searching pull requests.
 *
 * All run `gh` from the main process, which is why the read tools exist beside
 * `gh` in Bash: the user's own sandbox often cuts the shell off from GitHub
 * (Codex's workspace-write sandbox has no network unless the user enables it).
 */

import { z } from 'zod';
import * as path from 'path';
import { tool, jsonResult, toolResult, toolError, toolLog, projectScoped } from './index';
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
} from '../../services/repo/ghUtils';
import { MAX_DIFF_CHARS, MAX_REVIEW_COMMENT_CHARS, renderPullRequest } from './pullRequestText';
import { resolveConnectedRepoPath } from './connectedRepo';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

const MAX_CONTEXT_DIFF_CHARS = 50_000;
const DEFAULT_PR_SEARCH_LIMIT = 20;
const MAX_PR_SEARCH_LIMIT = 100;
/** Rejects anything that is not a plain `owner/name` slug before it reaches gh. */
const REPO_SLUG = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/;

const READ_PR_DESCRIPTION = `Read a GitHub pull request: title, body, state, author, branches, and changed files, plus on request the diff, the review activity, and CI status. Use it whenever the user names a PR by URL, #123, or number, including PRs in repos not connected to this project. It works even when the user's sandbox cuts gh in Bash off from GitHub, so do not call a PR unreachable until this tool fails. With no PR number, use find_pull_requests first.

Set only the parts the question needs: includeDiff for questions about the code (with paths when the question is about some files), includeReviews for what reviewers or bots said, includeChecks for CI and merge readiness. A diff over ${MAX_DIFF_CHARS.toLocaleString()} characters is cut and says so; read the rest by paths, and each comment over ${MAX_REVIEW_COMMENT_CHARS.toLocaleString()} characters is marked truncated; report either instead of treating what you see as complete. Reviews and checks are a snapshot, so read again after the user says they pushed, replied, or re-ran CI. mergeable reads UNKNOWN while GitHub is still computing it, which is not the same as blocked. A failing check's url points at its CI run, for a CI tool to open.`;

const FIND_PRS_DESCRIPTION = `Search a repository's GitHub pull requests by head branch, author, state, or GitHub search text. Use it whenever you need a PR but have no number: which PR carries this branch, what someone opened, what merged this week, whether a PR already exists for the current branch. Never scan PR numbers or compare commits to PR heads to find one. Returns number, title, state, draft flag, author, branches, review decision, and updated or merged time, newest first, with no bodies or diffs; read a hit in full with read_pull_request. includeChecks adds CI and merge readiness per PR, for comparing several. When truncated is true, narrow the filters before concluding a PR does not exist, and widen state to all before saying a branch has no PR.`;

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
      'get_pr_context',
      `Gather the raw material for a pull request description when the change is not already in the conversation: the branch's net diff against its base (up to ${MAX_CONTEXT_DIFF_CHARS.toLocaleString()} characters), its commit log, the linked plan item and its parent, the task's implementation instructions, and recent commits in the project's other repos. It returns context, not a finished description; write the description yourself from it. When you already know what the branch changes, skip this and write from what you know. Pass plan_item_id to find the repo from the task's session, or repo_id; the repo IDs are in the system prompt's Project list.`,
      {
        plan_item_id: z.string().optional().describe('Plan item whose session and context to use'),
        repo_id: z.string().optional().describe('Connected repo ID; required without plan_item_id, or to override its repo'),
        base_branch: z.string().optional().describe('Branch to diff against; defaults to the repo\'s default branch'),
      },
      projectScoped(async ({ projectId, plan_item_id, repo_id, base_branch }) => {
        try {
          // Resolve repo
          let resolvedRepoId = repo_id;
          let planItem: { id: string; title: string; description: string | null; external_key: string | null; parent_id: string | null; project_id: string } | undefined;

          if (plan_item_id) {
            planItem = planItemRepo.get(plan_item_id) as typeof planItem;
            if (planItem?.project_id !== projectId) {
              return toolError(`No plan item ${plan_item_id} in this project.`);
            }

            // If no repo specified, try to find via dev session
            if (!resolvedRepoId) {
              const devSession = devSessionRepo.getByPlanItem(plan_item_id);
              if (devSession) {
                resolvedRepoId = devSession.repo_id;
              } else {
                // Fall back to single repo if project has only one
                const projectRepos = repoRepo.getByProject(projectId);
                if (projectRepos.length === 1) {
                  resolvedRepoId = projectRepos[0].id;
                } else if (projectRepos.length > 1) {
                  return toolError(`Several repos are connected; pass repo_id. Options: ${projectRepos.map(r => `${r.id} (${path.basename(r.path)})`).join(', ')}`);
                }
              }
            }
          }

          if (!resolvedRepoId) {
            return toolError('Could not tell which repository to use. Pass repo_id, or a plan_item_id whose task has a session.');
          }

          const repo = repoRepo.getById(resolvedRepoId);
          if (repo?.project_id !== projectId) {
            return toolError(`No connected repo ${resolvedRepoId} in this project.`);
          }

          // Gather context
          const repoPath = resolveEffectiveRepoPath(repo);
          const baseBranch = base_branch || await resolveDefaultBranch(repoPath);
          const currentBranch = await resolveCurrentBranch(repoPath);
          const diff = await getCommittedDiff(repoPath, baseBranch, MAX_CONTEXT_DIFF_CHARS);
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

          sections.push('Write the description from the net diff: the final behavior and why it matters. Use the commit history only for intent and grouping, and name the plan item or ticket when there is one.');
          return toolResult(`Repo: ${path.basename(repo.path)}\n\n${sections.join('\n\n---\n\n')}`);
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      }),
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
    tool(
      'read_pull_request',
      READ_PR_DESCRIPTION,
      {
        pr: z.string().describe('PR URL, "#123", or "123"; a bare number resolves against the connected repo\'s remote'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it) whose gh setup to use; optional when exactly one repo is connected'),
        includeDiff: z.boolean().default(false).describe('Include the unified diff, usually most of the response'),
        paths: z.array(z.string().min(1)).max(50).optional().describe('With includeDiff, only the diff of these files or directories, as repo-relative paths from the Files list'),
        includeReviews: z.boolean().default(false).describe('Include reviews, unresolved inline threads with file and line, and discussion comments'),
        includeResolvedThreads: z.boolean().default(false).describe('With includeReviews, also return resolved threads'),
        includeChecks: z.boolean().default(false).describe('Include CI check counts with failing and pending names, review decision, and mergeable state'),
      },
      projectScoped(async ({ projectId, pr, repoPath, includeDiff, paths, includeReviews, includeResolvedThreads, includeChecks }) => {
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

          return toolResult(renderPullRequest({
            details,
            ...(reviewActivity && { reviews: { activity: reviewActivity, includeResolvedThreads } }),
            ...(diff !== undefined && { diff: { text: diff, paths } }),
          }));
        } catch (error) {
          return toolError(await describeGhFailure(cwd, error));
        }
      }),
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
    tool(
      'find_pull_requests',
      FIND_PRS_DESCRIPTION,
      {
        repo: z.string().regex(REPO_SLUG, 'Expected owner/name').optional().describe('owner/name to search, e.g. "klaviyo/k-repo"; set it for a repo that is not connected. Defaults to the repo at repoPath'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it); optional when exactly one repo is connected'),
        head: z.string().min(1).optional().describe('Exact head branch name, without an owner: prefix'),
        author: z.string().min(1).optional().describe('GitHub login, or @me for the user'),
        state: z.enum(['open', 'closed', 'merged', 'all']).default('open'),
        search: z.string().min(1).optional().describe('GitHub search syntax, e.g. "review-requested:@me", "merged:>=2026-09-01", or title words'),
        limit: z.number().int().min(1).max(MAX_PR_SEARCH_LIMIT).default(DEFAULT_PR_SEARCH_LIMIT),
        includeChecks: z.boolean().default(false).describe('Add each PR\'s CI checks and merge readiness'),
      },
      projectScoped(async ({ projectId, repo, repoPath, head, author, state, search, limit, includeChecks }) => {
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
      }),
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
  ];
}
