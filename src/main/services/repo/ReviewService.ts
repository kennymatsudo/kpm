/**
 * Review Service
 *
 * Reconciles live GitHub review threads into persisted workflow state and
 * exposes a renderer-friendly review inbox API.
 *
 * All unresolved, non-outdated threads become tasks regardless of author type
 * (universal assessment model).
 */

import type {
  IDevSessionRepository,
  IReviewOwnershipRepository,
  IReviewSyncStateRepository,
  IReviewTaskRepository,
} from '../../db/interfaces';
import type {
  DevSession,
  PrReviewThread,
  ReviewDisposition,
  ReviewInboxSnapshot,
  ReviewOwnership,
  ReviewTask,
  ReviewTaskPriority,
  ReviewTaskSource,
  ReviewTaskStatus,
} from '../../../shared/types';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import type { createDevSessionService } from './DevSessionService';
import type { createGitHubService } from './GitHubService';

type GitHubService = ReturnType<typeof createGitHubService>;
type DevSessionService = ReturnType<typeof createDevSessionService>;

export interface TriggerReviewAutomationResult {
  inbox: ReviewInboxSnapshot;
  taskIds: string[];
  context: string;
}

export interface FlushQueuedReviewTasksResult {
  taskIds: string[];
  context: string;
}

export interface ReplyToThreadResult {
  inbox: ReviewInboxSnapshot;
  replyId: string;
  resolved: boolean;
}

export interface ReviewServiceDeps {
  devSessions: IDevSessionRepository;
  reviewTasks: IReviewTaskRepository;
  reviewOwnership: IReviewOwnershipRepository;
  reviewSyncState: IReviewSyncStateRepository;
  gitHubService: GitHubService;
  devSessionService: DevSessionService;
}

function deriveTaskSource(thread: PrReviewThread): ReviewTaskSource {
  if (thread.hasBotOnlyComments) return 'bot';
  const hasBotComments = thread.comments.some((comment) => comment.authorType !== 'User');
  return hasBotComments ? 'mixed' : 'human';
}

function deriveTaskPriority(thread: PrReviewThread): ReviewTaskPriority {
  if (thread.hasBotOnlyComments) return 'low';
  if (thread.path && thread.line != null) return 'high';
  return 'medium';
}

function buildTaskTitle(thread: PrReviewThread): string {
  if (thread.path && thread.line != null) {
    return `Review feedback on ${thread.path}:${thread.line}`;
  }
  if (thread.path) {
    return `Review feedback on ${thread.path}`;
  }
  return 'General review feedback';
}

function getLatestCommentId(thread: PrReviewThread): string | null {
  return thread.comments[thread.comments.length - 1]?.id ?? null;
}

/** All unresolved, non-outdated threads are actionable under universal assessment. */
function isThreadActionable(thread: PrReviewThread): boolean {
  return !thread.isResolved && !thread.isOutdated;
}

function threadChanged(existing: ReviewTask, thread: PrReviewThread): boolean {
  return (
    existing.last_seen_updated_at !== thread.updatedAt ||
    existing.last_seen_comment_id !== getLatestCommentId(thread)
  );
}

function reconcileTaskStatus(existing: ReviewTask | undefined, thread: PrReviewThread): ReviewTaskStatus {
  if (thread.isResolved) return 'done';
  if (!existing) return 'needs_review';
  if (existing.internal_state === 'ignored') return existing.status;
  if (existing.status === 'done' && !thread.isResolved) return 'needs_review';
  if (!threadChanged(existing, thread)) return existing.status;

  switch (existing.status) {
    case 'ready_to_post':
    case 'assessed':
    case 'done':
      return 'needs_review';
    case 'in_progress':
    case 'needs_review':
      return existing.status;
  }
}

function reconcileInternalState(
  existing: ReviewTask | undefined,
  thread: PrReviewThread,
  newStatus: ReviewTaskStatus
): ReviewTask['internal_state'] {
  if (thread.isResolved) return null;
  if (!existing) return null;
  if (existing.internal_state === 'ignored') return 'ignored';

  if (newStatus !== existing.status && threadChanged(existing, thread)) {
    if (existing.status === 'ready_to_post' || existing.status === 'assessed') {
      return 'stale';
    }
    if (existing.internal_state === 'failed') return null;
  }

  return existing.internal_state;
}

export function buildAutomationPrompt(context: string): string {
  return [
    '',
    'Please address the following GitHub review feedback.',
    '',
    context,
    '',
    'When you are done, respond using this exact per-thread structure:',
    'THREAD <thread_id>',
    'ACTION: code_only | draft_reply | draft_reply_and_resolve | need_input',
    'SUMMARY: <brief summary>',
    'REPLY: <draft GitHub reply or N/A>',
    '',
  ].join('\n');
}

export function createReviewService(deps: ReviewServiceDeps) {
  function getSessionContext(sessionId: string): ServiceResult<DevSession> {
    const session = deps.devSessions.get(sessionId);
    if (!session) return failure(`Session not found: ${sessionId}`);
    if (!session.pr_number) return failure('No PR associated with this session');
    return success(session);
  }

  function getLinkedSessionsForPr(sessionId: string): ReturnType<IDevSessionRepository['get']>[] {
    const session = deps.devSessions.get(sessionId);
    if (!session?.pr_number) return [];
    return deps.devSessions
      .getByProject(session.project_id)
      .filter((candidate) => candidate.repo_id === session.repo_id && candidate.pr_number === session.pr_number);
  }

  function resolveOwnership(sessionId: string): ReviewOwnership | null {
    const session = deps.devSessions.get(sessionId);
    if (!session?.pr_number) return null;

    const existing = deps.reviewOwnership.get(session.repo_id, session.pr_number);
    if (existing) return existing;

    const linkedSessions = getLinkedSessionsForPr(sessionId);
    if (linkedSessions.length === 1) {
      const soleSession = linkedSessions[0];
      if (!soleSession) return null;
      return deps.reviewOwnership.set(session.repo_id, session.pr_number, soleSession.id);
    }

    return null;
  }

  function syncError(repoId: string, prNumber: number, error: string): void {
    deps.reviewSyncState.updateError(repoId, prNumber, error);
  }

  /**
   * @param skipIfUnchanged When true, do a cheap probe first and short-circuit
   *   if nothing has changed since the last successful sync. Used by the
   *   background poller; renderer paths leave it false to always refresh.
   */
  async function syncSessionReviewState(
    sessionId: string,
    options: { skipIfUnchanged?: boolean } = {}
  ): AsyncResult<ReviewInboxSnapshot> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    if (options.skipIfUnchanged) {
      const probeResult = await deps.gitHubService.probePrReviewState(sessionId);
      if (!probeResult.ok) {
        syncError(session.repo_id, session.pr_number!, probeResult.error);
        return probeResult;
      }
      const probe = probeResult.data;
      const stored = deps.reviewSyncState.get(session.repo_id, session.pr_number!);
      if (stored?.probe_digest === probe.digest && stored.last_error == null) {
        const ownership = resolveOwnership(sessionId) ?? deps.reviewOwnership.get(session.repo_id, session.pr_number!) ?? null;
        const updatedSync = deps.reviewSyncState.upsert({
          repo_id: session.repo_id,
          pr_number: session.pr_number!,
          session_id: ownership?.session_id ?? stored.session_id,
          last_fetched_at: new Date().toISOString(),
          last_successful_fetched_at: stored.last_successful_fetched_at,
          last_head_oid: stored.last_head_oid,
          last_review_decision: stored.last_review_decision,
          last_error: null,
          last_pr_updated_at: stored.last_pr_updated_at,
          probe_digest: stored.probe_digest,
        });
        return success({
          session_id: sessionId,
          snapshot: null,
          tasks: deps.reviewTasks.getByRepoPr(session.repo_id, session.pr_number!),
          ownership: ownership,
          sync_state: updatedSync,
          fetched_at: updatedSync.last_fetched_at!,
        });
      }
    }

    const snapshotResult = await deps.gitHubService.getPrReviewSnapshot(sessionId);
    if (!snapshotResult.ok) {
      syncError(session.repo_id, session.pr_number!, snapshotResult.error);
      return snapshotResult;
    }

    const snapshot = snapshotResult.data;
    const ownership = resolveOwnership(sessionId) ?? deps.reviewOwnership.get(session.repo_id, session.pr_number!) ?? null;
    const ownerSessionId = ownership?.session_id ?? null;
    const existingTasks = deps.reviewTasks.getByRepoPr(session.repo_id, session.pr_number!);
    const existingByThreadId = new Map(existingTasks.map((task) => [task.thread_id, task]));

    for (const thread of snapshot.threads) {
      const existing = existingByThreadId.get(thread.id);

      if (thread.isResolved) {
        if (existing) {
          deps.reviewTasks.markResolvedByThread(session.repo_id, session.pr_number!, thread.id);
        }
        continue;
      }

      if (!ownerSessionId) {
        continue;
      }

      if (!isThreadActionable(thread)) {
        if (existing && thread.isOutdated && existing.internal_state !== 'ignored' && existing.status !== 'done') {
        }
        continue;
      }

      const newStatus = reconcileTaskStatus(existing, thread);
      const newInternalState = reconcileInternalState(existing, thread, newStatus);

      deps.reviewTasks.upsertTask({
        id: existing?.id,
        project_id: session.project_id,
        repo_id: session.repo_id,
        session_id: ownerSessionId,
        pr_number: session.pr_number!,
        thread_id: thread.id,
        thread_url: thread.url,
        path: thread.path,
        line: thread.line,
        source: deriveTaskSource(thread),
        status: newStatus,
        internal_state: newInternalState,
        disposition: newStatus === 'needs_review' && existing?.disposition && newInternalState === 'stale'
          ? null : existing?.disposition ?? null,
        rationale: newStatus === 'needs_review' && newInternalState === 'stale'
          ? null : existing?.rationale ?? null,
        draft_reply: newStatus === 'needs_review' && newInternalState === 'stale'
          ? null : existing?.draft_reply ?? null,
        priority: deriveTaskPriority(thread),
        title: buildTaskTitle(thread),
        latest_comment_preview: thread.latestCommentPreview,
        last_seen_comment_id: getLatestCommentId(thread),
        last_seen_updated_at: thread.updatedAt,
        last_agent_run_at: existing?.last_agent_run_at ?? null,
        last_posted_reply_id: existing?.last_posted_reply_id ?? null,
        error: existing?.error ?? null,
        completed_at: existing?.status === 'done' && !thread.isResolved ? null : existing?.completed_at ?? null,
      });
    }

    const probeDigest = [
      snapshot.state,
      snapshot.reviewDecision ?? 'NONE',
      snapshot.headOid,
      snapshot.updatedAt,
      snapshot.threads.length,
      snapshot.topLevelReviews.length,
      snapshot.conversationComments.length,
    ].join('|');

    const syncState = deps.reviewSyncState.upsert({
      repo_id: session.repo_id,
      pr_number: session.pr_number!,
      session_id: ownerSessionId,
      last_fetched_at: snapshot.fetchedAt,
      last_successful_fetched_at: snapshot.fetchedAt,
      last_head_oid: snapshot.headOid,
      last_review_decision: snapshot.reviewDecision,
      last_error: null,
      last_pr_updated_at: snapshot.updatedAt,
      probe_digest: probeDigest,
    });

    return success({
      session_id: sessionId,
      snapshot,
      tasks: deps.reviewTasks.getByRepoPr(session.repo_id, session.pr_number!),
      ownership: ownerSessionId ? (deps.reviewOwnership.get(session.repo_id, session.pr_number!) ?? ownership) : ownership,
      sync_state: syncState,
      fetched_at: snapshot.fetchedAt,
    });
  }

  async function getReviewInbox(sessionId: string): AsyncResult<ReviewInboxSnapshot> {
    return syncSessionReviewState(sessionId);
  }

  function assignOwnership(sessionId: string): ServiceResult<ReviewOwnership> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;
    return success(deps.reviewOwnership.set(session.repo_id, session.pr_number!, session.id));
  }

  function isQueueableReviewTask(task: ReviewTask): boolean {
    if (task.status === 'needs_review') return true;
    if (task.internal_state === 'stale' || task.internal_state === 'failed') return true;
    return task.status === 'assessed' && task.disposition === 'implement';
  }

  function queueReviewTasks(sessionId: string, taskIds?: string[]): ServiceResult<ReviewTask[]> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    const selectedIds = taskIds ? new Set(taskIds) : null;
    const tasks = deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)
      .filter((task) => task.session_id === sessionId)
      .filter((task) => !selectedIds || selectedIds.has(task.id))
      .filter(isQueueableReviewTask);

    const queued = tasks
      .map((task) => deps.reviewTasks.updateStatus(task.id, 'in_progress', {
        internal_state: 'implementation_queued',
        completed_at: null,
      }))
      .filter((task): task is ReviewTask => task != null);

    return success(queued);
  }

  function getQueuedReviewTasks(sessionId: string): ServiceResult<ReviewTask[]> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    return success(deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)
      .filter((task) =>
        task.session_id === sessionId
        && task.status === 'in_progress'
        && task.internal_state === 'implementation_queued'
      ));
  }

  async function sendQueuedReviewTasks(
    sessionId: string,
    queuedTasks: ReviewTask[]
  ): AsyncResult<TriggerReviewAutomationResult> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    if (queuedTasks.length === 0) {
      const inboxResult = await syncSessionReviewState(sessionId);
      if (!inboxResult.ok) return inboxResult;
      return success({ inbox: inboxResult.data, taskIds: [], context: '' });
    }

    const threadIds = queuedTasks.map((task) => task.thread_id);
    const contextResult = await deps.gitHubService.buildAddressReviewContext(sessionId, { threadIds });
    if (!contextResult.ok) return contextResult;

    deps.devSessionService.updateAutomationPhase(sessionId, 'addressing_review');

    const followUpResult = await deps.devSessionService.sendAgentFollowUp(
      sessionId,
      buildAutomationPrompt(contextResult.data),
      { restartIfBusy: false }
    );
    if (!followUpResult.ok) {
      return failure(followUpResult.error);
    }

    if (followUpResult.data.deferred) {
      const queuedInbox = await syncSessionReviewState(sessionId);
      if (!queuedInbox.ok) return queuedInbox;
      return success({
        inbox: queuedInbox.data,
        taskIds: queuedTasks.map((task) => task.id),
        context: '',
      });
    }

    const now = new Date().toISOString();
    for (const task of queuedTasks) {
      deps.reviewTasks.updateStatus(task.id, 'in_progress', {
        internal_state: null,
        last_agent_run_at: now,
        completed_at: null,
        error: null,
      });
    }

    const refreshedInbox = await syncSessionReviewState(sessionId);
    if (!refreshedInbox.ok) return refreshedInbox;

    return success({
      inbox: refreshedInbox.data,
      taskIds: queuedTasks.map((task) => task.id),
      context: contextResult.data,
    });
  }

  async function flushQueuedReviewTasks(sessionId: string): AsyncResult<FlushQueuedReviewTasksResult> {
    const queuedResult = getQueuedReviewTasks(sessionId);
    if (!queuedResult.ok) return queuedResult;
    const queuedTasks = queuedResult.data;
    if (queuedTasks.length === 0) {
      return success({ taskIds: [], context: '' });
    }

    const sendResult = await sendQueuedReviewTasks(sessionId, queuedTasks);
    if (!sendResult.ok) return sendResult;

    return success({
      taskIds: sendResult.data.taskIds,
      context: sendResult.data.context,
    });
  }

  async function triggerReviewAutomation(
    sessionId: string,
    taskIds?: string[]
  ): AsyncResult<TriggerReviewAutomationResult> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    const ownership = deps.reviewOwnership.get(session.repo_id, session.pr_number!);
    if (ownership && ownership.session_id !== sessionId) {
      return failure(`Review handling for this PR is owned by session ${ownership.session_id}`);
    }

    const inboxResult = await syncSessionReviewState(sessionId);
    if (!inboxResult.ok) return inboxResult;
    const inbox = inboxResult.data;

    const queueResult = queueReviewTasks(sessionId, taskIds);
    if (!queueResult.ok) return queueResult;
    const queuedTasks = queueResult.data;
    if (queuedTasks.length === 0) {
      return success({ inbox, taskIds: [], context: '' });
    }

    deps.devSessionService.updateAutomationPhase(sessionId, 'addressing_review');

    if (session.status === 'active') {
      const queuedInbox = await syncSessionReviewState(sessionId);
      if (!queuedInbox.ok) return queuedInbox;
      return success({
        inbox: queuedInbox.data,
        taskIds: queuedTasks.map((task) => task.id),
        context: '',
      });
    }

    const sendResult = await sendQueuedReviewTasks(sessionId, queuedTasks);
    if (!sendResult.ok) {
      deps.devSessionService.updateAutomationPhase(sessionId, 'needs_attention');
      return sendResult;
    }
    return sendResult;
  }

  async function replyToThread(
    sessionId: string,
    threadId: string,
    body: string,
    resolve?: boolean
  ): AsyncResult<ReplyToThreadResult> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    const latestSnapshotResult = await deps.gitHubService.getPrReviewSnapshot(sessionId);
    if (!latestSnapshotResult.ok) return latestSnapshotResult;

    const thread = latestSnapshotResult.data.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return failure(`Review thread not found: ${threadId}`);

    const replyResult = await deps.gitHubService.replyToReviewThread(sessionId, threadId, body);
    if (!replyResult.ok) return replyResult;

    const task = deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)
      .find((candidate) => candidate.thread_id === threadId);

    if (task) {
      deps.reviewTasks.updateStatus(task.id, 'done', {
        last_posted_reply_id: replyResult.data.id,
        completed_at: new Date().toISOString(),
        error: null,
      });
    }

    let resolved = false;
    if (resolve && !thread.isResolved) {
      const resolveResult = await deps.gitHubService.resolveReviewThread(sessionId, threadId);
      if (!resolveResult.ok) return resolveResult;
      resolved = resolveResult.data.isResolved;
    }

    const inboxResult = await syncSessionReviewState(sessionId);
    if (!inboxResult.ok) return inboxResult;

    return success({
      inbox: inboxResult.data,
      replyId: replyResult.data.id,
      resolved,
    });
  }

  async function resolveThread(sessionId: string, threadId: string): AsyncResult<ReviewInboxSnapshot> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    const latestSnapshotResult = await deps.gitHubService.getPrReviewSnapshot(sessionId);
    if (!latestSnapshotResult.ok) return latestSnapshotResult;
    const thread = latestSnapshotResult.data.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return failure(`Review thread not found: ${threadId}`);
    if (!thread.isResolved) {
      const result = await deps.gitHubService.resolveReviewThread(sessionId, threadId);
      if (!result.ok) return result;
    }

    const task = deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)
      .find((candidate) => candidate.thread_id === threadId);
    if (task) {
      deps.reviewTasks.updateStatus(task.id, 'done', { completed_at: new Date().toISOString(), error: null });
    }

    return syncSessionReviewState(sessionId);
  }

  async function unresolveThread(sessionId: string, threadId: string): AsyncResult<ReviewInboxSnapshot> {
    const sessionResult = getSessionContext(sessionId);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.data;

    const latestSnapshotResult = await deps.gitHubService.getPrReviewSnapshot(sessionId);
    if (!latestSnapshotResult.ok) return latestSnapshotResult;
    const thread = latestSnapshotResult.data.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return failure(`Review thread not found: ${threadId}`);
    if (thread.isResolved) {
      const result = await deps.gitHubService.unresolveReviewThread(sessionId, threadId);
      if (!result.ok) return result;
    }

    const task = deps.reviewTasks
      .getByRepoPr(session.repo_id, session.pr_number!)
      .find((candidate) => candidate.thread_id === threadId);
    if (task) {
      deps.reviewTasks.updateStatus(task.id, 'needs_review', { internal_state: 'stale', completed_at: null, error: null });
    }

    return syncSessionReviewState(sessionId);
  }

  async function ignoreTask(taskId: string): AsyncResult<ReviewInboxSnapshot> {
    const task = deps.reviewTasks.get(taskId);
    if (!task) return failure(`Review task not found: ${taskId}`);

    deps.reviewTasks.updateStatus(taskId, 'done', {
      internal_state: 'ignored',
      completed_at: new Date().toISOString(),
      error: null,
    });

    return syncSessionReviewState(task.session_id);
  }

  function overrideDisposition(
    taskId: string,
    disposition: ReviewDisposition
  ): ServiceResult<ReviewTask> {
    const task = deps.reviewTasks.get(taskId);
    if (!task) return failure(`Review task not found: ${taskId}`);

    // When switching to push_back and there's no draft reply, keep assessed status
    // When switching to implement, clear draft reply
    const newStatus = disposition === 'push_back' && task.draft_reply
      ? 'ready_to_post' as const
      : 'assessed' as const;

    const updated = deps.reviewTasks.updateStatus(task.id, newStatus, {
      disposition,
      draft_reply: disposition === 'implement' ? null : task.draft_reply,
      internal_state: null,
      error: null,
    });

    if (!updated) return failure(`Failed to update task ${taskId}`);
    return success(updated);
  }

  return {
    syncSessionReviewState,
    getReviewInbox,
    assignOwnership,
    queueReviewTasks,
    flushQueuedReviewTasks,
    triggerReviewAutomation,
    replyToThread,
    resolveThread,
    unresolveThread,
    ignoreTask,
    overrideDisposition,
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
