/**
 * GitHub Integration Tools
 *
 * PR description generation from project context, and reading a pull request
 * that is not the current branch's.
 *
 * Both run `gh` from the main process. That is the whole point of `read_pull_request`:
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
import { checkGhAuth, getPrDetails, getPrDiff, parsePrRef } from '../../services/repo/ghUtils';
import { describeGhAuth } from '../../../shared/ghAuth';
import { resolveConnectedRepoPath } from './connectedRepo';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

const MAX_DIFF_CHARS = 100_000;

const READ_PR_DESCRIPTION = `Read a pull request from GitHub: title, body, state, author, base/head branches, changed files, and the full diff.

## When to use
Any time the user names a PR — a URL, \`#123\`, or a bare number — including PRs in repos that are not connected to this project. This is the only way to reach GitHub: \`gh\` and \`git fetch\` in Bash are sandboxed away from your credentials and from the network, so they fail no matter how the user is authenticated. Do not report a PR as unreachable until this tool has failed.

## Parameters
- \`projectId\`: The project UUID.
- \`pr\`: PR URL, \`#123\`, or \`123\`. A bare number resolves against the connected repo's remote; a URL resolves against the repo it names.
- \`repoPath\`: Absolute path of the connected repo to run from. Optional when exactly one repo is connected. Only decides which \`gh\` config and remote are used, not which PR is read.
- \`includeDiff\`: Include the unified diff (default true). Set false when only the metadata matters.

## Notes
- The diff is truncated past ${MAX_DIFF_CHARS.toLocaleString()} characters; the response says so and lists every changed file with its line counts, so report the truncation rather than treating the visible part as the whole PR.
- Review comments and threads are not included.`;

/**
 * A gh failure is either "that PR isn't readable" or "gh can't talk to GitHub at
 * all", and the two have different remedies. gh's own stderr says which PR it
 * failed on; only an auth probe can say the credential is the problem, so it runs
 * on the failure path rather than before every read.
 */
async function describePrReadFailure(cwd: string, error: unknown): Promise<string> {
  const stderr = (error as { stderr?: string })?.stderr?.trim();
  const detail = stderr || (error instanceof Error ? error.message : String(error));
  const auth = await checkGhAuth(cwd);
  const credentialsAreClean = auth.authenticated && !auth.tokenEnvVar;
  return credentialsAreClean ? detail : `${detail}\n\n${describeGhAuth(auth)}`;
}

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
      },
      async ({ projectId, pr, repoPath, includeDiff }) => {
        const resolution = resolveConnectedRepoPath(repoRepo.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        const prRef = parsePrRef(pr);
        if (!prRef) {
          return toolError(`"${pr}" is not a PR number or a github.com pull request URL.`);
        }

        toolLog(`[KPM Tools] read_pull_request ${prRef} @ ${cwd}`);

        try {
          const details = await getPrDetails(cwd, prRef);
          if (!includeDiff) {
            return jsonResult({ success: true, ...details });
          }

          const diff = await getPrDiff(cwd, prRef);
          const truncated = diff.length > MAX_DIFF_CHARS;
          return jsonResult({
            success: true,
            ...details,
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
          return toolError(await describePrReadFailure(cwd, error));
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
  ];
}
