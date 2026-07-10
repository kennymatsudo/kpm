/**
 * GitHub Service
 *
 * Manages GitHub PR operations for dev sessions via the `gh` CLI.
 * Follows the factory + DI pattern used by other services.
 */

import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'fs';
import { runClaudeQuery, type ClaudeQueryUsage } from '../../claude/runClaudeQuery';
import { randomUUID } from 'crypto';
import type { IDevSessionRepository, IRepoRepository, IPlanItemRepository } from '../../db/interfaces';
import type {
  PlanItem,
  PrComment,
  PrReviewSnapshot,
  PrReviewThread,
  PrReviewThreadComment,
  PrStatus,
} from '../../../shared/types';
import { success, failure, wrapAsync, type AsyncResult } from '../result';
import { getConfig } from '../../config';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import {
  checkGhAuth,
  createPr,
  getPrForBranch,
  getPrByNumber,
  parsePrIdentifier,
  getPrReviewSnapshot as fetchPrReviewSnapshot,
  probePrReviewState as fetchPrReviewProbe,
  type PrReviewProbe,
  pushBranch,
  isBranchPushed,
  replyToReviewThread as postReviewThreadReply,
  resolveReviewThread as resolveGhReviewThread,
  type GhAuthResult,
  type GhReviewThreadState,
  unresolveReviewThread as unresolveGhReviewThread,
} from './ghUtils';
import {
  getCommittedDiff,
  getCommitLog,
  getCurrentBranch,
  resolveBaseBranch,
  hasCommitsAhead,
  readPrTemplate,
} from './gitUtils';
import { collectLinkedRefKeys } from '../../documents/planRefResolver';
import { toExternalMarkdown } from '../../documents/exportBoundary';

// =============================================================================
// Types
// =============================================================================

export interface GitHubServiceDeps {
  devSessions: IDevSessionRepository;
  repos: IRepoRepository;
  planItems: IPlanItemRepository;
  /** Reads an optional project markdown document used as high-level PR context. */
  readProjectDocument?: (projectId: string, path: string) => AsyncResult<string>;
  /** Resolves configurable prompt content (override > registry default). */
  getPromptContent?: (key: string) => string;
  /**
   * Centralized Claude usage recorder. Optional so existing tests don't need
   * to wire it. PR-description generation calls in this service should funnel
   * through here.
   */
  recordUsage?: (event: {
    projectId: string | null;
    source: 'pr_description';
    model: string;
    usage: ClaudeQueryUsage;
    totalCostUsd?: number | null;
  }) => void;
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
const MAX_FEATURE_CONTEXT_DOC_CHARS = 24_000;

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

function truncateFeatureContextDoc(content: string): string {
  if (content.length <= MAX_FEATURE_CONTEXT_DOC_CHARS) return content;
  return `${content.slice(0, MAX_FEATURE_CONTEXT_DOC_CHARS)}\n\n... (feature context document truncated)`;
}

// =============================================================================
// Service Factory
// =============================================================================

export function createGitHubService(deps: GitHubServiceDeps) {
  /**
   * Resolve a session ID to repo path.
   */
  function resolveSessionRepo(sessionId: string): { repoPath: string; primaryRepoPath: string; session: ReturnType<IDevSessionRepository['get']> & {} } | { error: string } {
    const session = deps.devSessions.get(sessionId);
    if (!session) return { error: `Session not found: ${sessionId}` };
    const repo = deps.repos.getById(session.repo_id);
    if (!repo) return { error: `Repo not found: ${session.repo_id}` };

    // PR operations need the session branch's HEAD, which lives in the worktree.
    // Fall back to the main repo path only if the worktree no longer exists.
    const repoPath = existsSync(session.worktree_path) ? session.worktree_path : repo.path;
    return { repoPath, primaryRepoPath: repo.path, session };
  }

  async function readSessionPrTemplate(repoPath: string, primaryRepoPath: string): Promise<string | null> {
    const worktreeTemplate = await readPrTemplate(repoPath);
    if (worktreeTemplate || repoPath === primaryRepoPath) {
      return worktreeTemplate;
    }
    return readPrTemplate(primaryRepoPath);
  }

  function buildPrSystemPrompt(systemPromptTemplate: string, descriptionGuidance: string): string {
    if (systemPromptTemplate.includes('{{description_guidance}}')) {
      return systemPromptTemplate.replace('{{description_guidance}}', descriptionGuidance);
    }

    if (!descriptionGuidance.trim()) {
      return systemPromptTemplate;
    }

    const trimmedTemplate = systemPromptTemplate.trimEnd();
    const guidanceSection = `Description guidance:\n\n${descriptionGuidance}`;
    return trimmedTemplate ? `${trimmedTemplate}\n\n${guidanceSection}` : guidanceSection;
  }

  async function buildFeatureContextBrief(input: {
    projectId: string | null;
    featureContextPath?: string | null;
    planItem: PlanItem | null;
    branchName: string;
    baseBranch: string;
    diff: string;
    commitLog: string;
    recordUsage?: GitHubServiceDeps['recordUsage'];
  }): Promise<string | null> {
    if (!input.projectId || !input.featureContextPath || !deps.readProjectDocument) {
      return null;
    }

    const documentResult = await deps.readProjectDocument(input.projectId, input.featureContextPath);
    if (!documentResult.ok || !documentResult.data.trim()) {
      return null;
    }

    const taskParts: string[] = [];
    if (input.planItem) {
      taskParts.push(`Title: ${input.planItem.title}`);
      if (input.planItem.intent) taskParts.push(`Intent: ${input.planItem.intent}`);
      if (input.planItem.description) taskParts.push(`Description: ${input.planItem.description}`);
      if (input.planItem.acceptance_criteria?.length) {
        taskParts.push(`Acceptance Criteria:\n${input.planItem.acceptance_criteria.map((criterion) => `- ${criterion}`).join('\n')}`);
      }
      if (input.planItem.external_key) taskParts.push(`Tracker Key: ${input.planItem.external_key}`);
    }

    const truncatedDiff = input.diff.length > 12_000
      ? `${input.diff.slice(0, 12_000)}\n\n... (diff truncated for feature-context extraction)`
      : input.diff;
    const truncatedDocument = truncateFeatureContextDoc(documentResult.data);

    const prompt = `Extract high-level feature context for a PR description.

Use the attached project document to infer the larger user-facing feature or workflow being built. Use the task and net diff to identify the role of this specific PR inside that feature. The commit history is secondary chronology only; do not describe abandoned or reverted approaches unless they are still visible in the net diff or explain a reviewer-relevant risk. Do not require or assume a manually written summary from the user.

Return 3-6 concise bullets. Cover only what is supported by the inputs:
- Larger user-facing feature or workflow goal
- This PR's role in that feature
- Boundaries or intentionally excluded work only when they explain why this PR stops where it does
- Reviewer focus implied by this PR's role

Do not write a PR description. Do not create a roadmap. The larger user-facing feature is reviewer orientation, not roadmap content, so include it when the document supports it. Do not include a list of future tickets or later phases unless a specific dependency changes how reviewers should read this PR. If cleanup, expiration, routing, rendering, or another process is not implemented in this diff, describe it only as outside this PR, not as current behavior.

[REFERENCE - Feature Document]
Path: ${input.featureContextPath}

${truncatedDocument}

[REFERENCE - Task]
${taskParts.join('\n') || 'No task context provided.'}

[REFERENCE - Branch]
${input.branchName} -> ${input.baseBranch}

[REFERENCE - Net Diff]
Authoritative current PR contents compared with ${input.baseBranch}. Describe the final branch state, not the sequence of intermediate commits.

${truncatedDiff || 'No diff provided.'}

[REFERENCE - Commit History]
Secondary chronology for intent and grouping only. Do not report reverted or abandoned approaches unless they remain in the net diff.

${input.commitLog || 'No commit log provided.'}`;

    const sdkModel = getConfig().generation.fastModel;
    const result = await runClaudeQuery({
      prompt,
      sdkOptions: {
        model: sdkModel,
        tools: [],
        persistSession: false,
        systemPrompt: 'You extract concise feature context for pull request reviewers. Return only bullets, no preamble.',
        stderr: () => {},
        ...getClaudeSdkSpawnOptions(),
      },
      timeoutMs: getConfig().generation.prGenerationTimeoutMs,
      timeoutMessage: 'Feature context extraction timed out',
      recordUsage: input.recordUsage
        ? ({ usage, totalCostUsd }) => {
            input.recordUsage!({
              projectId: input.projectId,
              source: 'pr_description',
              model: sdkModel,
              usage,
              totalCostUsd,
            });
          }
        : undefined,
    });

    return result.text.trim() || null;
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
        const baseBranch = await resolveBaseBranch(repoPath, session.base_branch);
        const commits = await hasCommitsAhead(repoPath, baseBranch);
        if (!commits) {
          return failure(`No commits ahead of ${baseBranch}. Commit your changes before creating a PR.`);
        }

        // Push branch if not already pushed
        const pushed = await isBranchPushed(repoPath, session.branch_name);
        if (!pushed) {
          await pushBranch(repoPath, session.branch_name);
        }

        // Resolve @plan/<uuid> tokens in the body to bare external keys (so
        // Jira/Linear unfurl-on-paste works), and append `Closes <key>` lines
        // for any linked refs so tracker integrations auto-transition on
        // merge. Pulls plan items from the session's project.
        let resolvedBody = body;
        if (session.project_id) {
          const projectPlanItems = deps.planItems.getByProject(session.project_id);
          resolvedBody = toExternalMarkdown(body, projectPlanItems, 'github');
          const closeKeys = collectLinkedRefKeys(body, projectPlanItems);
          if (closeKeys.length > 0) {
            // Avoid duplicating `Closes …` if the author already wrote it.
            const closesPattern = /(?:^|\n)\s*(?:closes|fixes|resolves)\s+/i;
            if (!closesPattern.test(resolvedBody)) {
              const closesLine = `Closes ${closeKeys.join(', ')}`;
              resolvedBody = `${resolvedBody.replace(/\s+$/, '')}\n\n${closesLine}\n`;
            }
          }
        }

        // Create the PR
        const result = await createPr(repoPath, {
          head: session.branch_name,
          base: baseBranch,
          title,
          body: resolvedBody,
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
        const status = session.pr_number
          ? await getPrByNumber(repoPath, session.pr_number)
          : await getPrForBranch(repoPath, session.branch_name);
        if (!status) return success(null);

        // Update cached state on the session
        deps.devSessions.updatePrInfo(
          sessionId,
          status.number,
          status.url,
          status.state,
          status.reviewDecision
        );

        return success(status);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Cheap probe — totals + head + updatedAt only.
     *
     * Lets callers decide whether the heavy thread-walk in `getPrReviewSnapshot`
     * is worth running, without paying for the multi-page fetch.
     */
    async probePrReviewState(sessionId: string): AsyncResult<PrReviewProbe> {
      const resolved = resolveSessionRepo(sessionId);
      if ('error' in resolved) return failure(resolved.error);
      const { repoPath, session } = resolved;

      if (!session.pr_number) {
        return failure('No PR associated with this session');
      }

      try {
        const probe = await fetchPrReviewProbe(repoPath, session.pr_number);
        return success(probe);
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
      const { repoPath, primaryRepoPath, session } = resolved;

      try {
        const baseBranch = await resolveBaseBranch(repoPath, session.base_branch);
        const [currentBranch, commits, prTemplate] = await Promise.all([
          getCurrentBranch(repoPath),
          hasCommitsAhead(repoPath, baseBranch),
          readSessionPrTemplate(repoPath, primaryRepoPath),
        ]);

        // Build body sections
        const sections: string[] = [];

        // Plan item context
        const planItem = session.plan_item_id ? deps.planItems.get(session.plan_item_id) ?? null : null;
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
      commitLog: string,
      featureContextPath?: string | null
    ): AsyncResult<{ title: string; body: string }> {
      const log = (msg: string) => console.log(`[GitHubService:generatePr] ${msg}`);
      const logError = (msg: string) => console.error(`[GitHubService:generatePr] ${msg}`);

      try {
        const resolved = resolveSessionRepo(sessionId);
        if ('error' in resolved) return failure(resolved.error);
        const { repoPath, primaryRepoPath, session } = resolved;
        const baseBranch = await resolveBaseBranch(repoPath, session.base_branch);
        const effectivePrTemplate = prTemplate ?? await readSessionPrTemplate(repoPath, primaryRepoPath);

        // Gather context for the prompt
        const [sessionDiff, sessionCommitLog] = diff && commitLog
          ? [diff, commitLog]
          : await Promise.all([
              getCommittedDiff(repoPath, baseBranch, 80_000),
              getCommitLog(repoPath, baseBranch),
            ]);

        const planItem = session.plan_item_id ? deps.planItems.get(session.plan_item_id) ?? null : null;
        const featureContextBrief = await buildFeatureContextBrief({
          projectId: session.project_id,
          featureContextPath,
          planItem,
          branchName: session.branch_name,
          baseBranch,
          diff: sessionDiff,
          commitLog: sessionCommitLog,
          recordUsage: deps.recordUsage,
        });

        // Build the generation prompt
        const contextParts: string[] = [];

        if (planItem) {
          contextParts.push(`[REFERENCE — Task]\nTitle: ${planItem.title}`);
          if (planItem.description) {
            contextParts.push(`Description: ${planItem.description}`);
          }
          if (planItem.intent) {
            contextParts.push(`Intent: ${planItem.intent}`);
          }
          if (planItem.acceptance_criteria?.length) {
            contextParts.push(`Acceptance Criteria:\n${planItem.acceptance_criteria.map((criterion) => `- ${criterion}`).join('\n')}`);
          }
          if (planItem.external_key) {
            contextParts.push(`Tracker Key: ${planItem.external_key}`);
          }
        }

        if (featureContextBrief) {
          contextParts.push(`[REFERENCE — Feature Context]\n${featureContextBrief}`);
        }

        contextParts.push(`[REFERENCE — Branch]\n${session.branch_name} -> ${baseBranch}`);

        if (sessionDiff) {
          // Truncate diff for prompt to keep tokens reasonable
          const truncatedDiff = sessionDiff.length > 40_000
            ? sessionDiff.slice(0, 40_000) + '\n\n... (diff truncated)'
            : sessionDiff;
          contextParts.push(`[REFERENCE — Net Diff]\nAuthoritative current PR contents compared with ${baseBranch}. Describe the final branch state, not the sequence of intermediate commits.\n\n${truncatedDiff}`);
        }

        if (sessionCommitLog) {
          contextParts.push(`[REFERENCE — Commit History]\nSecondary chronology for intent and grouping only. Do not report reverted or abandoned approaches unless they remain in the net diff.\n\n${sessionCommitLog}`);
        }

        const descriptionGuidance = effectivePrTemplate
          ? `Your description MUST use the repository's PR template below as its skeleton. Use the template's section headings, in the template's order, and no others — with one exception: a brief lead overview paragraph (see below) may precede the first template heading.
- Begin the body with a 2-4 sentence overview paragraph that explains, in plain language, what changed and why it matters. Place it at the very top, BEFORE the first template heading, with no heading of its own. This lead paragraph is REQUIRED and is not an "invented section". If feature context is provided, name the larger user-facing feature or workflow and this PR's role in it here.
- Do NOT repeat this overview inside Risk Impact, Test Plan, or any other section. Those sections answer their own specific prompts; the lead paragraph is the only place for the general "what changed and why" summary.
- Do NOT invent any other sections the template does not contain (e.g. no "Description", "Acceptance Criteria", "Out of Scope", "Dependencies", "Code References", "Commits", or "Changes" headings unless the template itself defines them).
- Do NOT omit sections the template contains.
- Within each section, keep the answer concise. Aim for a description that fits on one screen.
- If the template DOES define a Description (or Summary/Overview) section, put the overview there instead of as a lead paragraph, and use this shape unless the template explicitly demands another one:
  1. A short context paragraph (2-4 sentences) explaining the larger user-facing feature or workflow being built, this PR's role in that feature, and the ownership boundary.
  2. A short reviewer-focus sentence or 3-5 bullets naming what reviewers should inspect.
  3. At most 3-5 "what changed" bullets, grouped by behavior or risk area rather than by files/classes/endpoints.
  4. A short out-of-scope sentence only when it prevents reviewer confusion.
- Prefer reviewer-relevant concepts over implementation inventory. Avoid "What's added" sections that enumerate every endpoint, DTO, field, helper, test, index, or file. Mention a concrete API, table, index, or class only when it changes the review focus, rollout risk, or system behavior.
- Translate domain jargon into ordinary engineering language where possible. Keep necessary service names, table names, and API names, but explain what role they play.
- Call out the highest-signal review areas: behavior changes, ownership boundaries, data model or migration implications, authorization/security decisions, idempotency/concurrency behavior, rollout/compatibility risk, and test coverage.
- If feature context is provided, the opening paragraph must include the larger user-facing feature or workflow when the context supports it. This is reviewer orientation, not roadmap content. Also explain this PR's role in that feature and the boundary around this PR. Do not mention future tickets, phases, or dependencies unless they directly explain the current PR's boundary.
- Never state non-implemented follow-up work as current behavior. If the diff does not implement cleanup, expiration, routing, rendering, or another process, phrase it as outside this PR or omit it.
- If a section asks a question that does not apply, answer "N/A" on one line. Do not explain why unless the absence is itself surprising.
- If a section expects a value after a colon (e.g. "Tested on ondemand (if applicable): "), put the value or "N/A" directly after the colon. One line, no elaboration.

HTML comments in the template (\`<!-- ... -->\`) are author-facing guidance and examples — read them to understand what each section expects, then write plain markdown in their place. Your output must not contain any \`<!-- ... -->\`, stray \`-->\`, or stray \`--->\`.

## PR Template
${effectivePrTemplate}`
          : (deps.getPromptContent
              ? deps.getPromptContent('generation.pr_description_instructions')
              : '');

        const systemPromptTemplate = deps.getPromptContent
          ? deps.getPromptContent('generation.pr_system_prompt')
          : '';
        const systemPrompt = buildPrSystemPrompt(systemPromptTemplate, descriptionGuidance);

        const prompt = `Generate a PR title and description for the following changes:\n\n${contextParts.join('\n\n')}`;

        log('Calling Sonnet to generate PR content...');

        const sdkOptions: SDKOptions = {
          model: getConfig().generation.fastModel,
          tools: [],
          persistSession: false,
          systemPrompt,
          stderr: (data: string) => { logError(`stderr: ${data}`); },
          ...getClaudeSdkSpawnOptions(),
        };

        const TIMEOUT_MS = getConfig().generation.prGenerationTimeoutMs;
        const sdkModel = getConfig().generation.fastModel;

        const result = await runClaudeQuery({
          prompt,
          sdkOptions,
          timeoutMs: TIMEOUT_MS,
          timeoutMessage: 'PR generation timed out',
          recordUsage: deps.recordUsage
            ? ({ usage, totalCostUsd }) => {
                deps.recordUsage!({
                  projectId: session.project_id,
                  source: 'pr_description',
                  model: sdkModel,
                  usage,
                  totalCostUsd,
                });
              }
            : undefined,
        });

        const generatedContent = result.text;

        if (!generatedContent.trim()) {
          log('No content generated, falling back to raw context');
          return success({ title: rawTitle, body: rawBody });
        }

        // Parse the response
        const titleMatch = /^TITLE:\s*(.+)$/m.exec(generatedContent);
        const bodyMatch = /^BODY:\s*\n([\s\S]*)$/m.exec(generatedContent);

        const title = titleMatch?.[1]?.trim() || rawTitle;
        let body = bodyMatch?.[1]?.trim() || rawBody;
        if (session.project_id) {
          body = toExternalMarkdown(body, deps.planItems.getByProject(session.project_id), 'github');
        }

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

        return success(status);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Link an existing PR to a plan item, creating a stub session if none exists.
     * Finds the most recent session for the item; if none exists, creates a minimal
     * inactive session so the PR data has somewhere to live.
     */
    async linkPrToItem(planItemId: string, repoId: string, prIdentifier: string): AsyncResult<PrStatus> {
      const existingSession = deps.devSessions.getByPlanItem(planItemId);

      let sessionId: string;
      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const planItem = deps.planItems.get(planItemId);
        if (!planItem) return failure(`Plan item not found: ${planItemId}`);
        if (!planItem.project_id) return failure(`Plan item has no project ID: ${planItemId}`);

        const repo = deps.repos.getById(repoId);
        if (!repo) return failure(`Repo not found: ${repoId}`);

        const stub = deps.devSessions.create({
          id: randomUUID(),
          project_id: planItem.project_id,
          plan_item_id: planItemId,
          repo_id: repoId,
          name: null,
          worktree_path: '',
          branch_name: '',
          base_branch: '',
          base_sha: null,
          status: 'inactive',
          agent_type: 'claude',
          review_policy: 'auto',
          automation_phase: null,
          playbook_id: null,
          playbook_snapshot: null,
          current_step_id: null,
          step_pass_counts: null,
          paused_reason: null,
          initial_instructions: '',
          pr_number: null,
          pr_url: null,
          pr_state: null,
          review_state: null,
          merge_order: null,
        });
        sessionId = stub.id;
      }

      return this.linkPr(sessionId, prIdentifier);
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

        return success(status);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type GitHubService = ReturnType<typeof createGitHubService>;
