/**
 * Review Assessment Service
 *
 * SDK-backed assessment agent that evaluates review threads and produces
 * per-thread dispositions, rationale, and draft replies for push_back threads.
 *
 */

import { z } from 'zod';
import type {
  IDevSessionRepository,
  IPlanItemRepository,
  IPlanRelationRepository,
} from '../../db/interfaces';
import type {
  DevSession,
  PrReviewSnapshot,
  PrReviewThread,
  ReviewDisposition,
} from '../../../shared/types';
import { getConfig } from '../../config';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import type { createGitHubService } from './GitHubService';
import { getDiff, detectBaseBranch } from './gitUtils';
import {
  createReviewAssessmentMcpServer,
  REVIEW_ASSESSMENT_TOOL_NAMES,
} from '../../claude/tools/review-assessment';
import type { FileExplorerService } from '../files/FileExplorerService';

type GitHubService = ReturnType<typeof createGitHubService>;

// =============================================================================
// Types
// =============================================================================

export interface AssessmentResult {
  threadId: string;
  disposition: ReviewDisposition;
  rationale: string;
  draftReply: string | null;
}

export interface BatchAssessmentResult {
  results: AssessmentResult[];
  errors: string[];
}

interface ToolContext {
  projectId: string;
  prRepoId: string;
  otherRepos: { id: string; path: string }[];
}

export interface ReviewAssessmentServiceDeps {
  devSessions: IDevSessionRepository;
  repos: IRepoRepository;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  reviewTasks: IReviewTaskRepository;
  gitHubService: GitHubService;
  fileExplorerService: FileExplorerService;
}

// =============================================================================
// Structured Output Schemas
// =============================================================================
//
// The SDK's outputFormat option enforces schema compliance on the final `result`
// message and retries on schema violations. We keep Zod schemas as the source of
// truth, derive JSON Schema for the SDK, and runtime-validate structured_output.

const assessmentItemSchema = z.object({
  thread_id: z.string(),
  disposition: z.enum(['implement', 'push_back', 'needs_user_input']),
  rationale: z.string(),
  draft_reply: z.union([z.string(), z.null()]),
});

const assessmentOutputSchema = z.object({
  assessments: z.array(assessmentItemSchema),
});

const postImplItemSchema = z.object({
  thread_id: z.string(),
  addressed: z.boolean(),
  reason: z.union([z.string(), z.null()]),
  draft_reply: z.union([z.string(), z.null()]),
});

const postImplOutputSchema = z.object({
  replies: z.array(postImplItemSchema),
});

const assessmentJsonSchema = z.toJSONSchema(assessmentOutputSchema, { target: 'draft-07' });
const postImplJsonSchema = z.toJSONSchema(postImplOutputSchema, { target: 'draft-07' });

// =============================================================================
// Structured Query Runner
// =============================================================================

/**
 * Run a query with structured output and return the validated result.
 *
 * The SDK enforces schema compliance on the final `result` message via
 * `outputFormat`, retrying internally on violations. On exhaustion, the
 * result subtype becomes `error_max_structured_output_retries` — we surface
 * that as a typed failure here so callers can report it.
 */
async function runStructuredQuery<T>(
  userPrompt: string,
  sdkOptions: SDKOptions,
  schema: z.ZodType<T>,
  timeoutMs: number,
): Promise<T> {
  });

  }

  if (!parsed.success) {
    throw new Error(`Structured output failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

// =============================================================================
// Assessment Prompt
// =============================================================================


You have read-only tools to explore beyond the PR diff before landing a disposition. A reviewer concern is often already resolved by work the diff alone can't show. Before you assign a disposition, check whichever of these apply:

1. **Follow-up plan items** — does \`list_plan_items\` surface a planned (or in-progress) task that covers this concern? Use \`get_plan_item\` to confirm the scope matches. If yes, the thread is a \`push_back\` with the follow-up as the rationale.
2. **In-flight work on this repo or a sibling repo** — call \`list_project_branches\` once to see every repo on the project. If a branch name or recent commit subject suggests the concern is being addressed elsewhere (commonly true for cross-repo changes like API/client pairs), use \`get_branch_activity\` to verify the commits touch the relevant files.



## Assessment Criteria

For each thread, consider:
1. Is the feedback correct given the full context of the code?
2. Is the suggestion within scope of what the PR is trying to accomplish?
3. Does the feedback conflict with the design intent?
4. Is the reviewer asking for explanation rather than a code change?
5. Is this a style/preference issue vs a correctness issue?
6. For bot-generated comments: is the suggestion actually applicable given the surrounding code context?
7. Is the concern already handled elsewhere — a planned follow-up task, an in-flight branch on this or a sibling repo, or a project doc that captured the decision?

## Dispositions

Assign exactly one disposition per thread:

- **implement**: The feedback identifies a real issue that should be fixed. The code change is correct, in scope, and worth doing.
- **push_back**: The feedback should not be implemented. Reasons include: the suggestion is incorrect, out of scope, conflicts with the design intent, is a style preference that doesn't improve the code, or the reviewer misunderstood the context. For push_back threads, you MUST provide a draft reply explaining why.
- **needs_user_input**: The feedback raises a legitimate question that could go either way. You can see both sides and the developer should make the call. Do NOT use this as a default — only when there is genuine ambiguity.

## Output Rules

Your final response is validated against a JSON schema — the shape of \`assessments\` is enforced automatically, so focus on content. Required content rules:

- Every thread in the input MUST have a corresponding entry in \`assessments\`
- \`draft_reply\` MUST be a non-empty string for \`push_back\` threads, and \`null\` for \`implement\` and \`needs_user_input\` threads
- \`rationale\` should reference specific code context, not just restate the comment

## Draft Reply Voice

Write like a developer replying on their own PR — not a bot, not a customer-support agent.

- Lead with the concrete fact that resolves it. No "Thanks for catching", no "Great point", no pleasantries.
- Don't restate the reviewer's concern or explain what would have been a problem. They already know — they wrote it.
- No hedging or hypothetical framing: skip "it would be a real issue if...", "you're right that in theory...", "this could be a concern but...". Just state what's true now.
- Short. One or two sentences is usually enough. Two short sentences beats one long one.
- Casual-professional tone: contractions are fine, first person is fine, lowercase after em-dashes is fine.

Examples of the voice you want:

Good: "The \`@retry\` decorator is being removed in #1234, so there's no retry path left to guard."
Good: "Not in scope here — tracked separately as PROJ-7012."
Good: "Left this as-is because the upstream caller already validates the input."

Avoid:
- "Thanks for catching this — it would be a real problem if retries were still in play. The \`@retry\` decorator is being removed in #1234, which eliminates the retry path entirely and resolves this concern."
- "Great point! You're absolutely right that..."
- "This is a valid concern. However, ..."`;
}

function buildAssessmentUserPrompt(
  snapshot: PrReviewSnapshot,
  threads: PrReviewThread[],
  diff: string | null,
  sessionContext: string | null,
): string {
  const lines: string[] = [];

  lines.push(`# PR Assessment Request`);
  lines.push('');
  lines.push(`PR #${snapshot.prNumber}: ${snapshot.title}`);
  lines.push(`Branch: ${snapshot.headRefName} -> ${snapshot.baseRefName}`);
  lines.push(`Head: ${snapshot.headOid.slice(0, 12)}`);
  lines.push(`Review decision: ${snapshot.reviewDecision ?? 'none'}`);

  lines.push('');
  lines.push(`## Tool Inputs`);
  lines.push(`Pass these IDs verbatim to the review tools. Don't guess UUIDs.`);
  lines.push(`- projectId (for list_plan_items, list_project_branches, read_project_document): ${toolContext.projectId}`);
  lines.push(`- this PR's repoId (for get_branch_activity): ${toolContext.prRepoId}`);
  if (toolContext.otherRepos.length > 0) {
    lines.push(`- sibling repos on this project:`);
    for (const r of toolContext.otherRepos) {
      lines.push(`    - repoId=${r.id} — path=${r.path}`);
    }
  } else {
    lines.push(`- sibling repos on this project: none`);
  }

  if (sessionContext) {
    lines.push('');
    lines.push(`## Session Context`);
    lines.push(sessionContext);
  }

  if (diff) {
    lines.push('');
    lines.push(`## PR Diff`);
    lines.push('```diff');
    lines.push(diff);
    lines.push('```');
  }

  lines.push('');
  lines.push(`## Threads to Assess (${threads.length})`);

  for (const thread of threads) {
    lines.push('');
    lines.push(`### Thread ${thread.id}`);
    if (thread.path) {
      lines.push(`Location: ${thread.path}${thread.line != null ? `:${thread.line}` : ''}`);
    } else {
      lines.push('Location: General review');
    }
    lines.push(`Bot-only: ${thread.hasBotOnlyComments ? 'yes' : 'no'}`);
    lines.push('');

    for (const comment of thread.comments) {
      lines.push(`**@${comment.author}** (${comment.authorType}) at ${comment.createdAt}:`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Business-Rule Validation
// =============================================================================
//
// Schema shape (field types, enum values, presence) is enforced by the SDK via
// outputFormat. These helpers apply cross-field business rules that the schema
// can't express (e.g. push_back threads must have a non-empty draft_reply).

function applyAssessmentBusinessRules(
  parsed: z.infer<typeof assessmentOutputSchema>,
): { results: AssessmentResult[]; errors: string[] } {
  const errors: string[] = [];
  const results: AssessmentResult[] = [];

  for (const item of parsed.assessments) {
    if (!item.rationale.trim()) {
      errors.push(`Skipped entry for thread ${item.thread_id}: missing rationale`);
      continue;
    }

    const draftReply = item.disposition === 'push_back'
      ? (item.draft_reply?.trim() ? item.draft_reply : null)
      : null;

    if (item.disposition === 'push_back' && !draftReply) {
      errors.push(`Thread ${item.thread_id}: push_back disposition but no draft_reply provided`);
    }

    results.push({
      threadId: item.thread_id,
      rationale: item.rationale,
      draftReply,
    });
  }

  return { results, errors };
}

// =============================================================================
// Post-Implementation Prompts & Parsing
// =============================================================================

function buildPostImplSystemPrompt(): string {

Your job is to look at review threads that were marked for implementation, examine the current diff, and draft concise "addressed" replies for threads that were actually fixed.

## Output Rules

Your final response is validated against a JSON schema — the shape of \`replies\` is enforced automatically, so focus on content. Required content rules:

- Every thread in the input MUST have a corresponding entry in \`replies\`
- If the diff shows the issue was fixed, set \`addressed\` to \`true\` and populate \`draft_reply\`
- If the diff does not show a fix for this specific thread, set \`addressed\` to \`false\` and leave \`draft_reply\` as \`null\`
- Do NOT fabricate changes — only mark as addressed if the diff actually shows the fix

## Draft Reply Voice

Write like a developer replying on their own PR — not a bot.

- Lead with what changed. Skip "Thanks for the suggestion", "Great catch", and other pleasantries.
- Don't restate the reviewer's concern — they wrote it, they know.
- No hedging or hypotheticals ("this would have been an issue if...", "you're right in theory...").
- Short. One sentence is usually enough. Point at the fix in concrete terms.
- Casual-professional. Contractions, first person, lowercase after em-dashes are all fine.

Examples of the voice you want:

Good: "Switched to resetting the stream before each attempt — see \`upload.py\` in the latest push."
Good: "Fixed — now validates before the DB call."
Good: "Moved the guard into the caller so it's enforced for every path."

Avoid:
- "Addressed — added seek(0) handling to reset the file position before each retry attempt, which ensures retries work correctly as you pointed out."
- "Thanks for the great catch! I've updated the code to..."
- "You're absolutely right. Fixed in the latest commit."`;
}

function buildPostImplUserPrompt(
  snapshot: PrReviewSnapshot,
  threads: PrReviewThread[],
  tasks: { thread_id: string; rationale: string | null }[],
  diff: string | null,
): string {
  const taskByThreadId = new Map(tasks.map((t) => [t.thread_id, t]));
  const lines: string[] = [];

  lines.push(`# Post-Implementation Reply Drafting`);
  lines.push('');
  lines.push(`PR #${snapshot.prNumber}: ${snapshot.title}`);
  lines.push(`Branch: ${snapshot.headRefName}`);
  lines.push(`Head: ${snapshot.headOid.slice(0, 12)}`);

  lines.push('');
  lines.push(`## Tool Inputs`);
  lines.push(`Pass these IDs verbatim if you need to explore beyond the diff.`);
  lines.push(`- projectId: ${toolContext.projectId}`);
  lines.push(`- this PR's repoId: ${toolContext.prRepoId}`);

  if (diff) {
    lines.push('');
    lines.push(`## Current Diff (includes implementation changes)`);
    lines.push('```diff');
    lines.push(diff);
    lines.push('```');
  }

  lines.push('');
  lines.push(`## Threads to Draft Replies For (${threads.length})`);

  for (const thread of threads) {
    const task = taskByThreadId.get(thread.id);
    lines.push('');
    lines.push(`### Thread ${thread.id}`);
    if (thread.path) {
      lines.push(`Location: ${thread.path}${thread.line != null ? `:${thread.line}` : ''}`);
    }
    if (task?.rationale) {
      lines.push(`Assessment rationale: ${task.rationale}`);
    }
    lines.push('');
    for (const comment of thread.comments) {
      lines.push('');
    }
  }

  return lines.join('\n');
}

interface PostImplResult {
  threadId: string;
  addressed: boolean;
  reason: string | null;
  draftReply: string | null;
}

function applyPostImplBusinessRules(
  parsed: z.infer<typeof postImplOutputSchema>,
): { results: PostImplResult[]; errors: string[] } {
  const errors: string[] = [];
  const results: PostImplResult[] = [];

  for (const item of parsed.replies) {
    results.push({
      threadId: item.thread_id,
      addressed: item.addressed,
      reason: item.reason?.trim() ? item.reason : null,
      draftReply: item.draft_reply?.trim() ? item.draft_reply : null,
    });
  }

  return { results, errors };
}

// =============================================================================
// Service Factory
// =============================================================================

export function createReviewAssessmentService(deps: ReviewAssessmentServiceDeps) {
  const log = (msg: string) => console.log(`[ReviewAssessment] ${msg}`);
  const logError = (msg: string) => console.error(`[ReviewAssessment] ${msg}`);

  const reviewMcpServer = createReviewAssessmentMcpServer({
    planItems: deps.planItems,
    planRelations: deps.planRelations,
    repos: deps.repos,
    fileExplorerService: deps.fileExplorerService,
  });

  function buildToolContext(session: DevSession): ToolContext {
    const projectRepos = deps.repos.getByProject(session.project_id);
    const otherRepos = projectRepos
      .filter((r) => r.id !== session.repo_id)
      .map((r) => ({ id: r.id, path: r.path }));
    return {
      projectId: session.project_id,
      prRepoId: session.repo_id,
      otherRepos,
    };
  }

  function getSessionContext(sessionId: string): ServiceResult<DevSession> {
    const session = deps.devSessions.get(sessionId);
    if (!session) return failure(`Session not found: ${sessionId}`);
    if (!session.pr_number) return failure('No PR associated with this session');
    return success(session);
  }

    try {

    } catch (e) {
      logError(`Failed to fetch diff: ${e instanceof Error ? e.message : 'unknown'}`);
      return null;
    }
  }

  function buildSessionContextString(session: DevSession): string | null {
    const parts: string[] = [];
    if (session.name) parts.push(`Session: ${session.name}`);
    if (session.initial_instructions) {
      parts.push(`Purpose: ${session.initial_instructions.slice(0, 500)}`);
    }
    if (session.plan_item_id) {
      const planItem = deps.planItems.get(session.plan_item_id);
      if (planItem) {
        parts.push(`Task: ${planItem.title}`);
        if (planItem.description) {
          parts.push(`Description: ${planItem.description.slice(0, 1000)}`);
        }
        const subtasks = deps.planItems.getChildrenByParent(session.project_id, planItem.id);
        if (subtasks.length > 0) {
          parts.push(`Subtasks:\n${subtasks.map(s => `- ${s.title}`).join('\n')}`);
        }
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }

  /**
   * Run a batch assessment over all unreviewed threads for a session's PR.
   *
   * 1. Fetches live thread state
   * 2. Identifies threads in needs_review status
   * 3. Assembles context (threads, diff, session info)
   * 4. Calls Claude SDK for structured assessment
   * 5. Parses results and updates task records
   */
    const reviewAssessmentConfig = getConfig().reviewAssessment;
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    // 1. Fetch live snapshot
    const snapshotResult = await deps.gitHubService.getPrReviewSnapshot(sessionId);
    if (!snapshotResult.ok) return snapshotResult;
    const snapshot = snapshotResult.data;

    const tasks = deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)

    if (tasks.length === 0) {
      return success({ results: [], errors: [] });
    }

    // Mark tasks as assessment_running
    const taskThreadIds = new Set(tasks.map((t) => t.thread_id));
    for (const task of tasks) {
      deps.reviewTasks.updateStatus(task.id, task.status, { internal_state: 'assessment_running' });
    }

    // 3. Get the threads that correspond to our tasks
    const threadsToAssess = snapshot.threads.filter((thread) => taskThreadIds.has(thread.id));

    if (threadsToAssess.length === 0) {
      // Tasks exist but threads don't — stale tasks
      for (const task of tasks) {
        deps.reviewTasks.updateStatus(task.id, task.status, { internal_state: 'stale' });
      }
      return success({ results: [], errors: ['No matching threads found in live snapshot'] });
    }

    // 4. Assemble context
    const sessionContext = buildSessionContextString(session);
    const toolContext = buildToolContext(session);
    const userPrompt = buildAssessmentUserPrompt(
      snapshot,
      threadsToAssess,
      diff,
      sessionContext,
    );

    log(`Assessing ${threadsToAssess.length} threads for PR #${session.pr_number}`);

    // 5. Call SDK — multi-turn with scoped read-only MCP tools so the agent
    //    can check follow-up plan items / sibling-repo branches / project docs
    //    before landing a disposition. outputFormat pins the final result to
    //    our schema; the SDK retries on schema violations and surfaces a
    //    typed error if retries are exhausted.
    const sdkOptions: SDKOptions = {
      model: getConfig().generation.fastModel,
      mcpServers: { review: reviewMcpServer },
      allowedTools: [...REVIEW_ASSESSMENT_TOOL_NAMES],
      persistSession: false,
      maxTurns: reviewAssessmentConfig.maxTurns,
      outputFormat: { type: 'json_schema', schema: assessmentJsonSchema },
    };

    let parsed: z.infer<typeof assessmentOutputSchema>;
    try {
        userPrompt,
        sdkOptions,
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      logError(`SDK query failed: ${errorMsg}`);

      // Mark tasks as failed
      for (const task of tasks) {
        deps.reviewTasks.updateStatus(task.id, task.status, {
          internal_state: 'failed',
          error: `Assessment failed: ${errorMsg}`,
        });
      }

      return failure(`Assessment failed: ${errorMsg}`);
    }

    // 6. Apply business rules (schema already validated structure)
    const { results, errors } = applyAssessmentBusinessRules(parsed);

    log(`Parsed ${results.length} assessment results, ${errors.length} errors`);

    // 7. Update tasks with results
    const taskByThreadId = new Map(tasks.map((t) => [t.thread_id, t]));

    for (const result of results) {
      const task = taskByThreadId.get(result.threadId);
      if (!task) {
        errors.push(`Assessment result for unknown thread: ${result.threadId}`);
        continue;
      }

      const newStatus = result.disposition === 'push_back' && result.draftReply
        ? 'ready_to_post' as const
        : 'assessed' as const;

      deps.reviewTasks.updateStatus(task.id, newStatus, {
        internal_state: null,
        disposition: result.disposition,
        rationale: result.rationale,
        draft_reply: result.draftReply,
        error: null,
      });

      taskByThreadId.delete(result.threadId);
    }

    // Mark any tasks without results as failed
    for (const [threadId, task] of taskByThreadId) {
      deps.reviewTasks.updateStatus(task.id, task.status, {
        internal_state: 'failed',
        error: `No assessment result returned for thread ${threadId}`,
      });
    }

    return success({ results, errors });
  }

  /**
   * Draft "addressed" replies for implement threads after the dev session
   * has made code changes.
   *
   * 1. Fetches live thread state
   * 2. Gets the current diff (which now includes implementation changes)
   * 3. For each in_progress implement thread, drafts an "addressed" reply
   * 4. Updates tasks to ready_to_post with draft replies
   */
  async function draftPostImplementationReplies(sessionId: string): AsyncResult<BatchAssessmentResult> {
    const reviewAssessmentConfig = getConfig().reviewAssessment;
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    // Find implement threads that are in_progress (just implemented)
    const tasks = deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)
      .filter((task) =>
        task.session_id === sessionId &&
        task.status === 'in_progress' &&
        task.disposition === 'implement'
      );

    if (tasks.length === 0) {
      return success({ results: [], errors: [] });
    }

    // Mark as post_impl_running
    for (const task of tasks) {
      deps.reviewTasks.updateStatus(task.id, task.status, { internal_state: 'post_impl_running' });
    }

    // Fetch live snapshot and diff
    const snapshotResult = await deps.gitHubService.getPrReviewSnapshot(sessionId);
    if (!snapshotResult.ok) return snapshotResult;
    const snapshot = snapshotResult.data;

    const taskThreadIds = new Set(tasks.map((t) => t.thread_id));
    const threads = snapshot.threads.filter((t) => taskThreadIds.has(t.id));

    if (threads.length === 0) {
      for (const task of tasks) {
        deps.reviewTasks.updateStatus(task.id, task.status, { internal_state: 'stale' });
      }
      return success({ results: [], errors: ['No matching threads in live snapshot'] });
    }

    log(`Drafting post-implementation replies for ${threads.length} threads on PR #${session.pr_number}`);

    const toolContext = buildToolContext(session);

    // Post-impl drafting is primarily diff-driven, but we keep the same tool
    // surface available for edge cases (e.g., verifying a companion change
    // landed on a sibling repo branch).
    const sdkOptions: SDKOptions = {
      model: getConfig().generation.fastModel,
      mcpServers: { review: reviewMcpServer },
      allowedTools: [...REVIEW_ASSESSMENT_TOOL_NAMES],
      persistSession: false,
      systemPrompt: buildPostImplSystemPrompt(),
      maxTurns: reviewAssessmentConfig.maxTurns,
      outputFormat: { type: 'json_schema', schema: postImplJsonSchema },
    };

    let parsed: z.infer<typeof postImplOutputSchema>;
    try {
        userPrompt,
        sdkOptions,
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      logError(`Post-implementation drafting failed: ${errorMsg}`);
      for (const task of tasks) {
        deps.reviewTasks.updateStatus(task.id, task.status, {
          internal_state: 'failed',
          error: `Post-implementation drafting failed: ${errorMsg}`,
        });
      }
      return failure(`Post-implementation drafting failed: ${errorMsg}`);
    }

    const { results, errors } = applyPostImplBusinessRules(parsed);

    log(`Parsed ${results.length} post-implementation drafts, ${errors.length} errors`);

    const taskByThreadId = new Map(tasks.map((t) => [t.thread_id, t]));

    for (const result of results) {
      const task = taskByThreadId.get(result.threadId);
      if (!task) {
        errors.push(`Post-impl result for unknown thread: ${result.threadId}`);
        continue;
      }

      if (result.addressed && result.draftReply) {
        deps.reviewTasks.updateStatus(task.id, 'ready_to_post', {
          internal_state: null,
          draft_reply: result.draftReply,
          error: null,
        });
      } else {
        // Thread not yet fixed — keep in_progress
        deps.reviewTasks.updateStatus(task.id, 'in_progress', {
          internal_state: null,
          error: result.reason || 'Thread appears not yet addressed',
        });
      }

      taskByThreadId.delete(result.threadId);
    }

    for (const [threadId, task] of taskByThreadId) {
      deps.reviewTasks.updateStatus(task.id, task.status, {
        internal_state: 'failed',
        error: `No post-implementation result for thread ${threadId}`,
      });
    }

    return success({ results: results.map((r) => ({
      threadId: r.threadId,
      rationale: r.reason || 'Addressed in implementation',
      draftReply: r.draftReply,
    })), errors });
  }

  return {
    assessThreads,
    draftPostImplementationReplies,
  };
}

export type ReviewAssessmentService = ReturnType<typeof createReviewAssessmentService>;
