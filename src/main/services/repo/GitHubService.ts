/**
 * GitHub Service
 *
 * Manages GitHub PR operations for dev sessions via the `gh` CLI.
 * Follows the factory + DI pattern used by other services.
 */

import type { IDevSessionRepository, IRepoRepository, IPlanItemRepository } from '../../db/interfaces';
import { success, failure, wrapAsync, type AsyncResult } from '../result';
import {
  checkGhAuth,
  createPr,
  getPrForBranch,
  pushBranch,
  isBranchPushed,
  type GhAuthResult,
} from './ghUtils';
import {
  getCommitLog,
  getCurrentBranch,
} from './gitUtils';

// =============================================================================
// Types
// =============================================================================

export interface GitHubServiceDeps {
  devSessions: IDevSessionRepository;
  repos: IRepoRepository;
  planItems: IPlanItemRepository;
}

export interface PrContextResult {
  suggestedTitle: string;
  body: string;
  branch: string | null;
  baseBranch: string;
}

// =============================================================================
// Service Factory
// =============================================================================

export function createGitHubService(deps: GitHubServiceDeps) {
  /**
   * Resolve a session ID to repo path.
   */
    const session = deps.devSessions.get(sessionId);
    if (!session) return { error: `Session not found: ${sessionId}` };
    const repo = deps.repos.getById(session.repo_id);
    if (!repo) return { error: `Repo not found: ${session.repo_id}` };
  }

  return {
    /**
     * Check if the user is authenticated with GitHub CLI.
     * Resolves session to get a repo path for the cwd.
     */
    async checkAuth(sessionId: string): AsyncResult<GhAuthResult> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      return wrapAsync(
        () => checkGhAuth(resolved.repoPath),
        'Failed to check GitHub auth status'
      );
    },

    /**
     * Create a PR from a dev session's branch.
     * Pushes the branch first if not already pushed.
     */
    async createPr(
      sessionId: string,
      title: string,
      body: string,
      draft?: boolean
    ): AsyncResult<{ number: number; url: string }> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath, session } = resolved;

      try {
        // Push branch if not already pushed
        const pushed = await isBranchPushed(repoPath, session.branch_name);
        if (!pushed) {
          await pushBranch(repoPath, session.branch_name);
        }

        // Create the PR
        const result = await createPr(repoPath, {
          head: session.branch_name,
          title,
          draft,
        });

        // Persist PR info on the session
        deps.devSessions.updatePrInfo(
          sessionId,
          result.number,
          result.url,
          draft ? 'OPEN' : 'OPEN',
          null
        );

        return success(result);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get current PR status for a session's branch.
     * Updates the cached PR info on the session row.
     */
    async getPrStatus(sessionId: string): AsyncResult<PrStatus | null> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath, session } = resolved;

      try {
        if (!status) return success(null);

        // Update cached state on the session
        deps.devSessions.updatePrInfo(
          sessionId,
          status.number,
          status.url,
          status.state,
          status.reviewDecision
        );

      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     */
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath, session } = resolved;

      if (!session.pr_number) {
        return failure('No PR associated with this session');
      }

      try {




        });

      }
    },

    /**
     * Build PR context for pre-filling the Create PR form.
     * Reuses the same context-gathering logic as generate_pr_description.
     */
    async buildPrContext(sessionId: string): AsyncResult<PrContextResult> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);

      try {

        // Build body sections
        const sections: string[] = [];

        // Plan item context
        if (planItem) {
          if (planItem.description) {
            sections.push(`## Description\n\n${planItem.description}`);
          }
          if (planItem.parent_id) {
            const parent = deps.planItems.get(planItem.parent_id);
            if (parent) {
              sections.push(`**Parent:** ${parent.title}${parent.external_key ? ` (${parent.external_key})` : ''}`);
            }
          }
        }

        // Build suggested title
        let suggestedTitle = planItem?.title ?? session.branch_name;
        if (planItem?.external_key) {
          suggestedTitle = `${planItem.external_key}: ${suggestedTitle}`;
        }

        return success({
          suggestedTitle,
          body: sections.join('\n\n'),
          branch: currentBranch,
          baseBranch,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Build structured context from PR review comments for Claude to address.
     */
    async buildAddressCommentsContext(sessionId: string): AsyncResult<string> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);





    },
  };
}

export type GitHubService = ReturnType<typeof createGitHubService>;
