/**
 * GitHub Service
 *
 * Manages GitHub PR operations for dev sessions via the `gh` CLI.
 * Follows the factory + DI pattern used by other services.
 */

import type { IDevSessionRepository, IRepoRepository, IPlanItemRepository } from '../../db/interfaces';
import { success, failure, wrapAsync, type AsyncResult } from '../result';
import { getConfig } from '../../config';
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
  hasCommitsAhead,
  readPrTemplate,
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
  hasCommits: boolean;
  prTemplate: string | null;
}

/** Branches that must never be pushed directly. */
const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'release']);

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
        // Safety: refuse to push protected branches
        if (PROTECTED_BRANCHES.has(session.branch_name)) {
          return failure(`Refusing to create PR from protected branch "${session.branch_name}". Create a feature branch first.`);
        }
        if (session.branch_name === session.base_branch) {
          return failure(`Head branch "${session.branch_name}" is the same as base branch. Create a feature branch first.`);
        }

        // Check for commits ahead of base
        const commits = await hasCommitsAhead(repoPath, baseBranch);
        if (!commits) {
          return failure(`No commits ahead of ${baseBranch}. Commit your changes before creating a PR.`);
        }

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
          getCurrentBranch(repoPath),
          hasCommitsAhead(repoPath, baseBranch),
        ]);

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
          hasCommits: commits,
          prTemplate,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Generate PR title and description using Sonnet.
     * Takes raw context from buildPrContext and generates polished content.
     * Falls back to the raw context if generation fails.
     */
    async generatePrContent(
      sessionId: string,
      rawTitle: string,
      rawBody: string,
      prTemplate: string | null,
      diff: string,
    ): AsyncResult<{ title: string; body: string }> {
      const log = (msg: string) => console.log(`[GitHubService:generatePr] ${msg}`);
      const logError = (msg: string) => console.error(`[GitHubService:generatePr] ${msg}`);

      try {
        const resolved = resolveSessionRepo(sessionId);
        if ('error' in resolved) return failure(resolved.error);

        // Gather context for the prompt
        const [sessionDiff, sessionCommitLog] = diff && commitLog
          ? [diff, commitLog]
          : await Promise.all([
              getCommitLog(repoPath, baseBranch),
            ]);


        // Build the generation prompt
        const contextParts: string[] = [];

        if (planItem) {
          if (planItem.description) {
            contextParts.push(`Description: ${planItem.description}`);
          }
          if (planItem.external_key) {
            contextParts.push(`Tracker Key: ${planItem.external_key}`);
          }
        }


        if (sessionDiff) {
          // Truncate diff for prompt to keep tokens reasonable
          const truncatedDiff = sessionDiff.length > 40_000
            ? sessionDiff.slice(0, 40_000) + '\n\n... (diff truncated)'
            : sessionDiff;
        }


        const prompt = `Generate a PR title and description for the following changes:\n\n${contextParts.join('\n\n')}`;

        log('Calling Sonnet to generate PR content...');

        const sdkOptions: SDKOptions = {
          systemPrompt,
          stderr: (data: string) => { logError(`stderr: ${data}`); },
        };

        const TIMEOUT_MS = getConfig().generation.prGenerationTimeoutMs;
              }


        if (!generatedContent.trim()) {
          log('No content generated, falling back to raw context');
          return success({ title: rawTitle, body: rawBody });
        }

        // Parse the response
        const titleMatch = /^TITLE:\s*(.+)$/m.exec(generatedContent);
        const bodyMatch = /^BODY:\s*\n([\s\S]*)$/m.exec(generatedContent);

        const title = titleMatch?.[1]?.trim() || rawTitle;

        log(`Generated title: ${title.substring(0, 60)}...`);
        return success({ title, body });
      } catch (error) {
        logError(`Generation failed, falling back: ${error instanceof Error ? error.message : String(error)}`);
        return success({ title: rawTitle, body: rawBody });
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
