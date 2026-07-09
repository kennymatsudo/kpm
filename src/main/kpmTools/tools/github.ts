/**
 * GitHub Integration Tools
 *
 * Phase 1: PR description generation using project context.
 * Generates high-quality PR descriptions by combining net git diff, commit log,
 * plan item context, and cross-repo awareness.
 */

import { z } from 'zod';
import * as path from 'path';
import { tool, jsonResult, toolError } from './index';
import type { IPlanItemRepository, IRepoRepository, IDevSessionRepository } from '../../db/interfaces';
import {
  getCommittedDiff,
  getCommitLog,
  getCurrentBranch,
  detectBaseBranch,
  getRecentCommits,
} from '../../services/repo/gitUtils';

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
          const baseBranch = base_branch || await detectBaseBranch(repo.path);
          const currentBranch = await getCurrentBranch(repo.path);
          const diff = await getCommittedDiff(repo.path, baseBranch, 80_000);
          const commitLog = await getCommitLog(repo.path, baseBranch);

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
              const recentCommits = await getRecentCommits(other.path);
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
  ];
}
