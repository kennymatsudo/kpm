/**
 * ReviewTab - GitHub review queue for task execution.
 *
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Markdown } from 'markdown-to-jsx';
import type {
  DevSessionWithPlanItem,
  PrConversationComment,
  PrReviewThread,
  PrReviewThreadComment,
  PrTopLevelReview,
  ReviewDisposition,
  ReviewTask,
  ReviewTaskStatus,
} from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { useApprovalQueueStore } from '../../stores/approvalQueueStore';
import { toast } from '../../stores/toastStore';
import { openExternalUrl } from '../../services/shellService';
import {
  CheckIcon,
  ChevronRightIcon,
  MessageCircleIcon,
} from '../icons';

const STATUS_LABEL: Record<ReviewTaskStatus, string> = {
  assessed: 'Assessed',
  done: 'Done',
};

const DISPOSITION_LABEL: Record<ReviewDisposition, string> = {
  implement: 'Implement',
  push_back: 'Push back',
};

  implement: 'accent',
  push_back: 'warning',
  needs_user_input: 'info',
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const THREAD_STATUS_ORDER: Record<ReviewTaskStatus, number> = {
  needs_review: 0,
  assessed: 1,
  in_progress: 2,
  ready_to_post: 3,
  done: 4,
};

const ACTION_BUTTON_BASE =
  'inline-flex h-7 items-center justify-center gap-1.5 rounded border px-2.5 text-xxs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const ACTION_BUTTON_PRIMARY = `${ACTION_BUTTON_BASE} border-accent bg-accent text-white hover:bg-accent/90`;
const ACTION_BUTTON_SECONDARY = `${ACTION_BUTTON_BASE} border-border-subtle bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary`;
const ACTION_BUTTON_GHOST =
  'inline-flex h-7 items-center justify-center gap-1.5 rounded px-2.5 text-xxs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50';
const LONG_MARKDOWN_CHAR_THRESHOLD = 900;
const LONG_MARKDOWN_LINE_THRESHOLD = 16;

type ThreadView = 'queue' | 'open' | 'closed';

interface ReviewTabProps {
  session: DevSessionWithPlanItem;
}

interface ReviewActionState {
  sessionId: string;
  key: string;
}

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getThreadLocation(thread: PrReviewThread): string {
  if (thread.path && thread.line != null) return `${thread.path}:${thread.line}`;
  if (thread.path) return thread.path;
  return 'General';
}

function getLatestComment(thread: PrReviewThread): PrReviewThreadComment | null {
  return thread.comments.length > 0 ? thread.comments[thread.comments.length - 1] : null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatReviewDecision(value: string | null): string {
  if (value === 'APPROVED') return 'Approved';
  if (value === 'CHANGES_REQUESTED') return 'Changes requested';
  if (value === 'REVIEW_REQUIRED') return 'Review required';
  return 'No decision';
}

function sanitizeGitHubMarkdown(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function isLongMarkdown(value: string): boolean {
  return value.length > LONG_MARKDOWN_CHAR_THRESHOLD
    || value.split('\n').length > LONG_MARKDOWN_LINE_THRESHOLD;
}

function sortThreads(a: PrReviewThread, b: PrReviewThread, taskMap: Map<string, ReviewTask>): number {
  const ta = taskMap.get(a.id);
  const tb = taskMap.get(b.id);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  if (ta && tb) {
    const statusDelta = THREAD_STATUS_ORDER[ta.status] - THREAD_STATUS_ORDER[tb.status];
    if (statusDelta !== 0) return statusDelta;

    const priorityDelta = (PRIORITY_ORDER[ta.priority] ?? 2) - (PRIORITY_ORDER[tb.priority] ?? 2);
    if (priorityDelta !== 0) return priorityDelta;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function getThreadRailClass(task: ReviewTask | undefined, thread: PrReviewThread): string {
  if (thread.isResolved) return 'bg-success/55';
  if (thread.isOutdated) return 'bg-text-tertiary/50';
  if (!task) return 'bg-border-default';
  if (task.error || task.internal_state === 'failed') return 'bg-danger';
  if (task.internal_state === 'stale') return 'bg-warning';
  if (task.disposition === 'needs_user_input') return 'bg-info';
  if (task.status === 'ready_to_post') return 'bg-accent';
  if (task.disposition === 'implement') return 'bg-accent';
  if (task.disposition === 'push_back') return 'bg-warning';
  return 'bg-border-default';
}

function getViewEmptyCopy(view: ThreadView): { title: string; description: string } {
  if (view === 'queue') {
    return {
    };
  }
  if (view === 'closed') {
    return {
      title: 'No closed threads',
    };
  }
  return {
    title: 'No open threads',
    description: 'This PR has no unresolved review threads.',
  };
}

  const toneClass = {

  return (
      )}
  );
}

}: {
}) {
  return (
          >
    </div>
  );
}

function CommentExcerpt({
  label,
  body,
  meta,
  tone = 'default',
  defaultExpanded = false,
}: {
  label: string;
  body: string;
  meta?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sanitizedBody = sanitizeGitHubMarkdown(body);
  const shouldClamp = !defaultExpanded && isLongMarkdown(sanitizedBody);

  if (!sanitizedBody) return null;

  return (
      <div className={cx(
        'flex items-center gap-2 text-xxs font-medium uppercase tracking-wide',
      )}>
        <span>{label}</span>
        {meta && <span className="truncate normal-case tracking-normal text-text-muted">{meta}</span>}
      </div>
      <div className="relative mt-1">
        <div className={cx(
          'review-markdown prose-themed break-words',
          shouldClamp && !expanded && 'max-h-72 overflow-hidden',
        )}>
            {transformPlanRefs(sanitizedBody)}
          </Markdown>
        </div>
        {shouldClamp && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1 to-transparent" />
        )}
      </div>
      {shouldClamp && (
        <button
          type="button"
          className="mt-1.5 text-xxs font-medium text-accent transition-colors hover:text-accent-hover"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show full comment'}
        </button>
      )}
    </div>
  );
}

  thread,
  task,
  isOwner,
  ownerTitle,
  isReplyOpen,
  replyBody,
  actionKey,
  isAssessing,
  onToggleReply,
  onChangeReply,
  onAddressThread,
  onPostReply,
  onResolve,
  onUnresolve,
}: {
  thread: PrReviewThread;
  task?: ReviewTask;
  isOwner: boolean;
  ownerTitle: string | undefined;
  isReplyOpen: boolean;
  replyBody: string;
  actionKey: string | null;
  isAssessing: boolean;
  onToggleReply: (threadId: string) => void;
  onChangeReply: (value: string) => void;
  onAddressThread: (taskId: string) => void;
  onPostReply: (threadId: string, resolve: boolean) => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (threadId: string) => void;
}) {
  const latestComment = getLatestComment(thread);
  const latestCommentBody = latestComment?.body ?? thread.latestCommentPreview;
  const taskIsAssessing = isAssessing || task?.internal_state === 'assessment_running';
  const hasAttention = taskIsAssessing || (task ? isTaskActionable(task) : !isThreadClosed(thread));

  return (
    <article className={cx(
    )}>
      <div className="flex min-w-0">

              )}
                </div>

              )}
              )}
              )}
              )}

              )}
              )}

                  <button
                    type="button"
                  >
                  </button>
                <button
                  type="button"
                >
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

  return (
  );
}

function ConversationCommentCard({ comment }: { comment: PrConversationComment }) {
  return (
    <article className="rounded-md border border-border-subtle bg-surface-1 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-text-primary">@{comment.author}</div>
          <div className="mt-1 text-xxs text-text-muted">{formatDateTime(comment.createdAt)}</div>
        </div>
        <button type="button" className={ACTION_BUTTON_GHOST} onClick={() => openExternalUrl(comment.url)}>
          GitHub
        </button>
      </div>
      <div className="review-markdown prose-themed mt-2 break-words">
          {transformPlanRefs(sanitizeGitHubMarkdown(comment.body))}
        </Markdown>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ReviewTab
// ---------------------------------------------------------------------------

export function ReviewTab({ session }: ReviewTabProps) {
  const hasPr = session.pr_number != null;

  const inbox = useDevSessionsStore((state) => state.reviewInboxBySessionId.get(session.id) ?? null);
  const isLoading = useDevSessionsStore((state) => state.reviewLoadingIds.has(session.id));
  const error = useDevSessionsStore((state) => state.reviewErrorBySessionId.get(session.id) ?? null);
  const assessmentPending = useDevSessionsStore((state) => state.reviewAssessmentPendingBySessionId.get(session.id) ?? null);
  const loadReviewInbox = useDevSessionsStore((state) => state.loadReviewInbox);
  const refreshReviewInbox = useDevSessionsStore((state) => state.refreshReviewInbox);
  const assignReviewOwnership = useDevSessionsStore((state) => state.assignReviewOwnership);
  const assessReviewThreads = useDevSessionsStore((state) => state.assessReviewThreads);
  const draftPostImplReplies = useDevSessionsStore((state) => state.draftPostImplReplies);
  const triggerReviewAutomation = useDevSessionsStore((state) => state.triggerReviewAutomation);
  const resolveReviewThread = useDevSessionsStore((state) => state.resolveReviewThread);
  const unresolveReviewThread = useDevSessionsStore((state) => state.unresolveReviewThread);
  const ignoreReviewTask = useDevSessionsStore((state) => state.ignoreReviewTask);
  const overrideReviewDisposition = useDevSessionsStore((state) => state.overrideReviewDisposition);
  const processReviewReplyDraft = useApprovalQueueStore((state) => state.processReviewReplyDraft);

  const [actionState, setActionState] = useState<ReviewActionState | null>(null);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [threadView, setThreadView] = useState<ThreadView>('queue');

  useEffect(() => {
    if (!hasPr) return;
    void loadReviewInbox(session.id);
  }, [hasPr, loadReviewInbox, session.id]);

  useEffect(() => {
    if (inbox && !inbox.ownership && hasPr) {
      void assignReviewOwnership(session.id);
    }
  }, [inbox, hasPr, assignReviewOwnership, session.id]);

  const snapshot = inbox?.snapshot ?? null;
  const sessionTasks = useMemo(
    () => (inbox?.tasks ?? []).filter((task) => task.session_id === session.id),
    [inbox?.tasks, session.id],
  );
  const taskMap = useMemo(
    () => new Map(sessionTasks.map((task) => [task.thread_id, task])),
    [sessionTasks],
  );
  const pendingAssessmentTaskIds = useMemo(
    () => new Set(assessmentPending?.taskIds ?? []),
    [assessmentPending],
  );
  const pendingAssessmentCount = assessmentPending?.taskIds.length ?? 0;
  const isAssessmentPending = assessmentPending != null;
  const stats = useMemo(() => getStats(inbox, session.id), [inbox, session.id]);
  const isOwner = inbox?.ownership?.session_id === session.id;
  const ownerTitle = isOwner ? undefined : 'Only the agent session that owns this review can act on it';
  const actionKey = actionState?.sessionId === session.id ? actionState.key : null;

  const visibleThreads = useMemo(() => {
    const threads = snapshot?.threads ?? [];
    const selected = threads.filter((thread) => {
      if (threadView === 'queue') {
        const task = taskMap.get(thread.id);
        return !!task && isTaskActionable(task) && !isThreadClosed(thread);
      }
      if (threadView === 'closed') return isThreadClosed(thread);
      return !isThreadClosed(thread);
    });

    return selected.sort((a, b) => sortThreads(a, b, taskMap));
  }, [snapshot?.threads, taskMap, threadView]);

  async function withAction(key: string, fn: () => boolean | Promise<boolean>): Promise<void> {
    const actionSessionId = session.id;
    setActionState({ sessionId: actionSessionId, key });
    try {
      await fn();
    } finally {
      setActionState((current) =>
        current?.sessionId === actionSessionId && current.key === key ? null : current
      );
    }
  }

  async function handleRefresh(): Promise<void> {
    await withAction('refresh', async () => {
      const result = await refreshReviewInbox(session.id);
      if (!result.success) {
        toast.error(result.error || 'Refresh failed');
        return false;
      }
      return true;
    });
  }

  async function handleAssess(options?: ReviewAssessmentOptions, action = 'assess'): Promise<void> {
    await withAction(action, async () => {
      const result = await assessReviewThreads(session.id, options);
      if (!result.success) {
        toast.error(result.error || 'Assessment failed');
        return false;
      }
      toast.success(options?.taskIds?.length || options?.reassessAll ? 'Reassessment complete' : 'Assessment complete');
      return true;
    });
  }

  async function handleAddress(): Promise<void> {
    const taskIds = sessionTasks
      .filter((task) =>
        task.disposition === 'implement' && (task.status === 'assessed' || task.status === 'needs_review')
      )
      .map((task) => task.id);

    await withAction('address', async () => {
      const result = await triggerReviewAutomation(session.id, taskIds);
      if (!result.success) {
        toast.error(result.error || 'Failed');
        return false;
      }
      return true;
    });
  }

  async function handleDraftReplies(): Promise<void> {
    await withAction('draft', async () => {
      const result = await draftPostImplReplies(session.id);
      if (!result.success) {
        toast.error(result.error || 'Drafting failed');
        return false;
      }
      toast.success('Replies drafted');
      return true;
    });
  }

  function handleApproveAll(): void {
    for (const task of stats.readyToPostTasks) {
      if (!task.draft_reply) continue;
      const thread = snapshot?.threads.find((item) => item.id === task.thread_id);
      if (!thread) continue;
      processReviewReplyDraft({
        sessionId: session.id,
        threadId: task.thread_id,
        threadUrl: thread.url,
        threadTitle: task.title,
        threadLocation: getThreadLocation(thread),
        latestCommentPreview: thread.latestCommentPreview,
        body: task.draft_reply,
        resolve: true,
      });
    }
    toast.success(`Queued ${stats.readyToPostTasks.length} replies for approval`);
  }

  async function handlePostReply(threadId: string, resolve: boolean): Promise<void> {
    const thread = snapshot?.threads.find((item) => item.id === threadId);
    if (!thread) return;

    const task = taskMap.get(threadId);
    const body = task?.draft_reply || replyBody.trim();
    if (!body) {
      toast.error('Reply body is required');
      return;
    }

    await withAction(`reply:${threadId}`, () => {
      processReviewReplyDraft({
        sessionId: session.id,
        threadId,
        threadUrl: thread.url,
        threadTitle: task?.title ?? getThreadLocation(thread),
        threadLocation: getThreadLocation(thread),
        latestCommentPreview: thread.latestCommentPreview,
        body,
        resolve,
      });
      setReplyThreadId(null);
      setReplyBody('');
      return true;
    });
  }

  async function handleResolve(threadId: string): Promise<void> {
    await withAction(`resolve:${threadId}`, async () => {
      const result = await resolveReviewThread(session.id, threadId);
      if (!result.success) {
        toast.error(result.error || 'Failed');
        return false;
      }
      return true;
    });
  }

  async function handleUnresolve(threadId: string): Promise<void> {
    await withAction(`unresolve:${threadId}`, async () => {
      const result = await unresolveReviewThread(session.id, threadId);
      if (!result.success) {
        toast.error(result.error || 'Failed');
        return false;
      }
      return true;
    });
  }

  async function handleIgnore(taskId: string): Promise<void> {
    await withAction(`ignore:${taskId}`, async () => {
      const result = await ignoreReviewTask(session.id, taskId);
      if (!result.success) {
        toast.error(result.error || 'Failed');
        return false;
      }
      return true;
    });
  }

  async function handleOverrideDisposition(taskId: string, disposition: ReviewDisposition): Promise<void> {
    await withAction(`override:${taskId}`, async () => {
      const result = await overrideReviewDisposition(session.id, taskId, disposition);
      if (!result.success) {
        toast.error(result.error || 'Failed');
        return false;
      }
      return true;
    });
  }

  if (!hasPr) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <MessageCircleIcon className="h-8 w-8 text-text-tertiary" />
        <p className="text-sm font-medium text-text-secondary">No pull request linked</p>
        <p className="max-w-xs text-xs text-text-tertiary">Link a pull request before reviewing GitHub threads for this task.</p>
      </div>
    );
  }

  const emptyCopy = getViewEmptyCopy(threadView);
  const reassessAllTitle = !isOwner
    ? ownerTitle
    : isAssessmentPending
      ? 'Assessment already running'

  return (
      <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-0/95 backdrop-blur">
        <div className="space-y-3 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                    {formatReviewDecision(snapshot.reviewDecision)}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {stats.assessableCount > 0 && (
                <LoadingButton
                  size="sm"
                  variant="secondary"
                  title={reassessAllTitle}
                  isLoading={actionKey === 'reassess-all' || assessmentPending?.scope === 'all'}
                  loadingText="Reassessing"
                  onClick={() => void handleAssess({ reassessAll: true }, 'reassess-all')}
                >
                  Reassess all
                </LoadingButton>
              )}
              <LoadingButton
                size="sm"
                variant="secondary"
                isLoading={actionKey === 'refresh' || isLoading}
                onClick={() => void handleRefresh()}
              >
                Refresh
              </LoadingButton>
            </div>
          </div>


          )}

          {error && <p className="text-xxs text-danger">{error}</p>}
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        {isLoading && !inbox ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-tertiary border-t-accent" aria-hidden="true" />
            Loading review state...
          </div>
        ) : !snapshot ? (
          <EmptyState
            title="No review data"
            description={error || 'Could not load review state.'}
            action={(
              <LoadingButton size="sm" variant="secondary" isLoading={actionKey === 'refresh'} onClick={() => void handleRefresh()}>
                Retry
              </LoadingButton>
            )}
            size="sm"
          />
        ) : (
          <>
            {!isOwner && inbox?.ownership && (
              <div className="rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-xs text-text-muted">
                Another agent session owns review automation for this PR. You can still inspect, reply, and resolve GitHub threads here.
              </div>
            )}

            {visibleThreads.length === 0 ? (
            ) : (
              <div className="space-y-2">
              </div>
            )}

            )}
          </>
        )}
      </div>
    </div>
  );
}
