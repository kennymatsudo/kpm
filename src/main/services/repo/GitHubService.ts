/**
 * GitHub Service
 *
 * Manages GitHub PR operations for dev sessions via the `gh` CLI.
 * Follows the factory + DI pattern used by other services.
 */

import { existsSync } from 'fs';
import type { IDevSessionRepository, IRepoRepository, IPlanItemRepository } from '../../db/interfaces';
import type {
  PrComment,
  PrReviewSnapshot,
  PrReviewThread,
  PrReviewThreadComment,
  PrStatus,
} from '../../../shared/types';
import { success, failure, wrapAsync, type AsyncResult } from '../result';
import { getConfig } from '../../config';
import {
  checkGhAuth,
  createPr,
  getPrForBranch,
  getPrByNumber,
  parsePrIdentifier,
  getPrReviewSnapshot as fetchPrReviewSnapshot,
  pushBranch,
  isBranchPushed,
  replyToReviewThread as postReviewThreadReply,
  resolveReviewThread as resolveGhReviewThread,
  type GhAuthResult,
  type GhReviewThreadState,
  unresolveReviewThread as unresolveGhReviewThread,
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

export interface BuildAddressReviewContextOptions {
  threadIds?: string[];
  includeResolved?: boolean;
  includeOutdated?: boolean;
}

function formatThreadLocation(thread: PrReviewThread): string {
  if (thread.path && thread.line != null) return `${thread.path}:${thread.line}`;
  if (thread.path) return thread.path;
  return 'General';
}

function formatReviewContext(
  snapshot: PrReviewSnapshot,
  options?: BuildAddressReviewContextOptions
): string {
  const requestedIds = options?.threadIds ? new Set(options.threadIds) : null;
  const threads = snapshot.threads.filter((thread) => {
    if (requestedIds && !requestedIds.has(thread.id)) return false;
    if (!options?.includeResolved && thread.isResolved) return false;
    if (!options?.includeOutdated && thread.isOutdated) return false;
    return true;
  });

  if (threads.length === 0) {
    return `No matching review threads to address on PR #${snapshot.prNumber}.`;
  }

  const lines: string[] = [
    `Review feedback for PR #${snapshot.prNumber}: ${snapshot.title}`,
    `PR: ${snapshot.prUrl}`,
    `Head: ${snapshot.headRefName} (${snapshot.headOid.slice(0, 12)})`,
    '',
    'Address each unresolved review thread below. Make code changes where appropriate, then draft concise replies per thread.',
  ];

  for (const thread of threads) {
    lines.push('');
    lines.push(`THREAD ${thread.id}`);
    lines.push(`Location: ${formatThreadLocation(thread)}`);
    lines.push(`Resolved: ${thread.isResolved ? 'yes' : 'no'}`);
    lines.push(`Outdated: ${thread.isOutdated ? 'yes' : 'no'}`);
    lines.push(`Participants: ${thread.participants.join(', ') || 'unknown'}`);

    for (const comment of thread.comments) {
      const replyPrefix = comment.replyToId ? ` (reply to ${comment.replyToId})` : '';
      lines.push(`- @${comment.author}${replyPrefix} at ${comment.createdAt}`);
      lines.push(comment.body);
    }
  }

  if (snapshot.topLevelReviews.length > 0) {
    lines.push('');
    lines.push('Top-level reviews:');
    for (const review of snapshot.topLevelReviews) {
      if (!review.body.trim()) continue;
      lines.push(`- ${review.state ?? 'COMMENTED'} by @${review.author} at ${review.submittedAt ?? 'unknown time'}`);
      lines.push(review.body);
    }
  }

  return lines.join('\n');
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

    // PR operations need the session branch's HEAD, which lives in the worktree.
    // Fall back to the main repo path only if the worktree no longer exists.
    const repoPath = existsSync(session.worktree_path) ? session.worktree_path : repo.path;
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
          base: baseBranch,
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
     * Get a thread-first GitHub review snapshot for the session's PR.
     */
    async getPrReviewSnapshot(sessionId: string): AsyncResult<PrReviewSnapshot> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath, session } = resolved;

      if (!session.pr_number) {
        return failure('No PR associated with this session');
      }

      try {
        const snapshot = await fetchPrReviewSnapshot(repoPath, session.pr_number);

        deps.devSessions.updatePrInfo(
          sessionId,
          snapshot.prNumber,
          snapshot.prUrl,
          snapshot.state,
          snapshot.reviewDecision
        );

        return success(snapshot);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get all review comments on a session's PR.
     * Merges line-level comments and top-level reviews into a unified list.
     */
    async getPrComments(sessionId: string): AsyncResult<PrComment[]> {
      const snapshotResult = await this.getPrReviewSnapshot(sessionId);
      if (!snapshotResult.ok) return snapshotResult;

      const comments: PrComment[] = [];

      for (const thread of snapshotResult.data.threads) {
        for (const comment of thread.comments) {
          const numericId = comment.databaseId ?? Number.parseInt(comment.id, 10);
          comments.push({
            id: Number.isFinite(numericId) ? numericId : 0,
            author: comment.author,
            body: comment.body,
            path: thread.path,
            line: thread.line,
            state: null,
            createdAt: comment.createdAt,
          });
        }
      }

      for (const review of snapshotResult.data.topLevelReviews) {
        if (!review.body.trim()) continue;
        comments.push({
          id: review.databaseId ?? 0,
          author: review.author,
          body: review.body,
          path: null,
          line: null,
          state: review.state,
          createdAt: review.submittedAt ?? '',
        });
      }

      for (const comment of snapshotResult.data.conversationComments) {
        comments.push({
          id: comment.databaseId ?? 0,
          author: comment.author,
          body: comment.body,
          path: null,
          line: null,
          state: null,
          createdAt: comment.createdAt,
        });
      }

      comments.sort((a, b) => {
        if (a.path && b.path) {
          const pathCmp = a.path.localeCompare(b.path);
          if (pathCmp !== 0) return pathCmp;
          return (a.line ?? 0) - (b.line ?? 0);
        }
        if (a.path) return -1;
        if (b.path) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });

      return success(comments);
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
          persistSession: false,
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
     * Build structured context from live review threads for Claude to address.
     */
    async buildAddressReviewContext(
      sessionId: string,
      options?: BuildAddressReviewContextOptions
    ): AsyncResult<string> {
      const snapshotResult = await this.getPrReviewSnapshot(sessionId);
      if (!snapshotResult.ok) return snapshotResult;

      return success(formatReviewContext(snapshotResult.data, options));
    },

    /**
     * Build structured context from PR review comments for Claude to address.
     */
    async buildAddressCommentsContext(sessionId: string): AsyncResult<string> {
      return this.buildAddressReviewContext(sessionId);
    },

    /**
     * Post a reply to a GitHub review thread.
     */
    async replyToReviewThread(
      sessionId: string,
      threadId: string,
      body: string
    ): AsyncResult<PrReviewThreadComment> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);

      return wrapAsync(
        () => postReviewThreadReply(resolved.repoPath, threadId, body),
        'Failed to reply to GitHub review thread'
      );
    },

    /**
     * Resolve a GitHub review thread.
     */
    async resolveReviewThread(sessionId: string, threadId: string): AsyncResult<GhReviewThreadState> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);

      return wrapAsync(
        () => resolveGhReviewThread(resolved.repoPath, threadId),
        'Failed to resolve GitHub review thread'
      );
    },

    /**
     * Unresolve a GitHub review thread.
     */
    async unresolveReviewThread(sessionId: string, threadId: string): AsyncResult<GhReviewThreadState> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);

      return wrapAsync(
        () => unresolveGhReviewThread(resolved.repoPath, threadId),
        'Failed to unresolve GitHub review thread'
      );
    },

    /**
     * Auto-detect and link a PR for a session's branch.
     * Returns the PR status if found and linked, null if no PR exists.
     */
    async detectAndLinkPr(sessionId: string): AsyncResult<PrStatus | null> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath, session } = resolved;

      if (session.pr_number) return success(null);

      try {
        const status = await getPrForBranch(repoPath, session.branch_name);
        if (!status) return success(null);

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
     * Link an existing PR to a session by PR number or URL.
     */
    async linkPr(sessionId: string, prIdentifier: string): AsyncResult<PrStatus> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath } = resolved;

      const prNumber = parsePrIdentifier(prIdentifier);
      if (!prNumber) return failure('Invalid PR identifier. Provide a PR number or GitHub PR URL.');

      try {
        const status = await getPrByNumber(repoPath, prNumber);
        if (!status) return failure(`PR #${prNumber} not found in this repository.`);

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
  };
}

export type GitHubService = ReturnType<typeof createGitHubService>;
