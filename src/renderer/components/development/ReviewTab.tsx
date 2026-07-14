/**
 * ReviewTab - GitHub review queue for task execution.
 *
 * Presents review work as a focused decision queue: a single status line, one
 * "next action" prompt, and an accordion of threads where the active one is
 * expanded and the rest collapse to a scannable row. Workflow operations are
 * unchanged — only the presentation is.
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
} from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { useProposedChangeDisposal } from '../../stores/proposedChangeDisposal';
import { toast } from '../../stores/toastStore';
import { openExternalUrl } from '../../services/shellService';
import type { ReviewAssessmentOptions } from '../../stores/devSessions/helpers';
import { githubMarkdownOptions, transformPlanRefs } from '../../utils/markdown';
import { Badge, DropdownMenu, EmptyState, LoadingButton } from '../ui';
import {
  CheckIcon,
  ChevronRightIcon,
  MessageCircleIcon,
} from '../icons';
import {
  getStats,
  isTaskActionable,
  isThreadClosed,
  isReviewTaskQueuedForCode,
  isReviewTaskUpdatingCode,
} from './reviewStats';
import {
  buildReviewReplyProposal,
  canReassessTask,
  deriveNextAction,
  DISPOSITION_LABEL,
  formatReviewerVerdict,
  getThreadLocation,
  getThreadPill,
  getThreadRailClass,
  isAddressingReview,
  sortThreads,
  summarizeReviewers,
  type NextActionDecision,
  type NextActionKind,
  type ReviewerVerdict,
} from './reviewActions';

/** Excerpt accent tone per disposition. */
const DISPOSITION_TONE: Record<ReviewDisposition, ExcerptTone> = {
  implement: 'accent',
  push_back: 'warning',
  needs_user_input: 'info',
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
type ExcerptTone = 'default' | 'accent' | 'warning' | 'info';

interface ReviewTabProps {
  session: DevSessionWithPlanItem;
}

interface ReviewActionState {
  sessionId: string;
  key: string;
}

interface ReviewMenuState {
  threadId: string;
  x: number;
  y: number;
}

interface NextActionButton {
  label: string;
  onClick: () => void;
  actionKey: string;
  variant?: 'secondary';
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
}

interface NextAction {
  tone: 'accent' | 'danger' | 'warning' | 'info' | 'neutral';
  text: string;
  busy?: boolean;
  button?: NextActionButton;
}

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getLatestComment(thread: PrReviewThread): PrReviewThreadComment | null {
  return thread.comments.length > 0 ? thread.comments[thread.comments.length - 1] : null;
}

function getThreadAuthor(thread: PrReviewThread): string | null {
  return getLatestComment(thread)?.author ?? thread.participants[0] ?? null;
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

function reviewerVerdictTone(state: PrTopLevelReview['state']): string {
  if (state === 'APPROVED') return 'text-success';
  if (state === 'CHANGES_REQUESTED') return 'text-danger';
  return 'text-text-tertiary';
}

function formatRelativeShort(iso: string | null): string {
  if (!iso) return 'pending';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.round(days / 30)}mo`;
}

function sanitizeGitHubMarkdown(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function isLongMarkdown(value: string): boolean {
  return value.length > LONG_MARKDOWN_CHAR_THRESHOLD
    || value.split('\n').length > LONG_MARKDOWN_LINE_THRESHOLD;
}

function getViewEmptyCopy(view: ThreadView): { title: string; description: string } {
  if (view === 'queue') {
    return {
      title: 'Your queue is clear',
      description: 'New or unresolved reviewer threads land here after a refresh.',
    };
  }
  if (view === 'closed') {
    return {
      title: 'No closed threads',
      description: 'Resolved and outdated threads appear here.',
    };
  }
  return {
    title: 'No open threads',
    description: 'This PR has no unresolved review threads.',
  };
}

// ---------------------------------------------------------------------------
// Header pieces
// ---------------------------------------------------------------------------

function NextActionBar({ action, actionKey }: { action: NextAction; actionKey: string | null }) {
  const toneClass = {
    accent: 'border-accent/30 bg-accent/8',
    danger: 'border-danger/30 bg-danger/8',
    warning: 'border-warning/30 bg-warning/8',
    info: 'border-info/30 bg-info/8',
    neutral: 'border-border-subtle bg-surface-1',
  }[action.tone];
  const textClass = action.tone === 'danger' ? 'text-danger' : 'text-text-primary';

  return (
    <div className={cx('flex items-center justify-between gap-3 rounded-md border px-3 py-2', toneClass)}>
      <div className="flex min-w-0 items-center gap-2">
        {action.busy && (
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
            aria-hidden="true"
          />
        )}
        <span className="truncate text-xs">
          {!action.busy && <span className="text-text-muted">Next&nbsp;&middot;&nbsp;</span>}
          <span className={cx('font-medium', textClass)}>{action.text}</span>
        </span>
      </div>
      {action.button && (
        <LoadingButton
          size="sm"
          variant={action.button.variant}
          disabled={action.button.disabled}
          title={action.button.title}
          isLoading={actionKey === action.button.actionKey}
          onClick={action.button.onClick}
        >
          {action.button.icon}
          {action.button.label}
        </LoadingButton>
      )}
    </div>
  );
}

function ViewTabs({
  view,
  counts,
  onChange,
}: {
  view: ThreadView;
  counts: Record<ThreadView, number>;
  onChange: (view: ThreadView) => void;
}) {
  const tabs: { id: ThreadView; label: string }[] = [
    { id: 'queue', label: 'Needs me' },
    { id: 'open', label: 'Open' },
    { id: 'closed', label: 'Closed' },
  ];
  return (
    <div className="inline-flex rounded-md border border-border-subtle bg-surface-1 p-0.5">
      {tabs.map((tab) => {
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            className={cx(
              'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
              active
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary',
            )}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            <span className={cx(
              'text-xxs tabular-nums',
              active ? 'text-text-secondary' : 'text-text-tertiary',
            )}>
              {counts[tab.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread content
// ---------------------------------------------------------------------------

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
  tone?: ExcerptTone;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sanitizedBody = sanitizeGitHubMarkdown(body);
  const shouldClamp = !defaultExpanded && isLongMarkdown(sanitizedBody);

  if (!sanitizedBody) return null;

  const borderClass = {
    default: 'border-border-default',
    accent: 'border-accent',
    warning: 'border-warning',
    info: 'border-info',
  }[tone];
  const labelClass = {
    default: 'text-text-tertiary',
    accent: 'text-accent',
    warning: 'text-warning',
    info: 'text-info',
  }[tone];

  return (
    <div className={cx('border-l-2 pl-3', borderClass)}>
      <div className={cx(
        'flex items-center gap-2 text-xxs font-medium uppercase tracking-wide',
        labelClass,
      )}>
        <span>{label}</span>
        {meta && <span className="truncate normal-case tracking-normal text-text-muted">{meta}</span>}
      </div>
      <div className="relative mt-1">
        <div className={cx(
          'prose prose-review break-words',
          shouldClamp && !expanded && 'max-h-72 overflow-hidden',
        )}>
          <Markdown options={githubMarkdownOptions}>
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

function ThreadRow({
  thread,
  task,
  expanded,
  isOwner,
  ownerTitle,
  isReplyOpen,
  replyBody,
  actionKey,
  isAssessing,
  isAddressingReview,
  onToggleExpand,
  onToggleReply,
  onChangeReply,
  onAddressThread,
  onPostReply,
  onResolve,
  onUnresolve,
  onOpenMenu,
}: {
  thread: PrReviewThread;
  task?: ReviewTask;
  expanded: boolean;
  isOwner: boolean;
  ownerTitle: string | undefined;
  isReplyOpen: boolean;
  replyBody: string;
  actionKey: string | null;
  isAssessing: boolean;
  isAddressingReview: boolean;
  onToggleExpand: (threadId: string) => void;
  onToggleReply: (threadId: string) => void;
  onChangeReply: (value: string) => void;
  onAddressThread: (taskId: string) => void;
  onPostReply: (threadId: string, resolve: boolean) => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (threadId: string) => void;
  onOpenMenu: (threadId: string, x: number, y: number) => void;
}) {
  const latestComment = getLatestComment(thread);
  const latestCommentBody = latestComment?.body ?? thread.latestCommentPreview;
  const author = getThreadAuthor(thread);
  const taskIsAssessing = isAssessing || task?.internal_state === 'assessment_running';
  const taskQueuedForCode = task ? isReviewTaskQueuedForCode(task) : false;
  const taskUpdatingCode = task ? isReviewTaskUpdatingCode(task) && !taskQueuedForCode : false;
  const hasAttention = taskIsAssessing || (task ? isTaskActionable(task) : !isThreadClosed(thread));
  const pill = getThreadPill(task, thread);

  const canPostDraft = !!task?.draft_reply && task.status !== 'done';
  const canAddress = task?.disposition === 'implement'
    && (task.status === 'needs_review' || task.status === 'assessed');

  return (
    <article className={cx(
      'overflow-hidden rounded-md border bg-surface-1 transition-colors',
      expanded ? 'border-border-default shadow-sm' : hasAttention ? 'border-border-subtle' : 'border-border-subtle/60',
    )}>
      <div className="flex min-w-0">
        <div className={cx('w-0.5 shrink-0', getThreadRailClass(task, thread))} />
        <div className="min-w-0 flex-1">
          {/* Collapsed/expanded header row */}
          <button
            type="button"
            aria-expanded={expanded}
            className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2/60"
            onClick={() => onToggleExpand(thread.id)}
          >
            <ChevronRightIcon className={cx(
              'h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform',
              expanded && 'rotate-90',
            )} />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-text-primary">
              {getThreadLocation(thread)}
              {author && <span className="ml-1.5 font-sans text-text-muted">&middot; @{author}</span>}
            </span>
            {taskIsAssessing && (
              <span
                className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
                aria-hidden="true"
              />
            )}
            {pill && <Badge variant={pill.variant} size="sm">{pill.label}</Badge>}
          </button>

          {expanded && (
            <div className="space-y-3 px-3 pb-3 pt-1">
              {task?.error && (
                <div className="rounded border border-danger/25 bg-danger/10 px-2.5 py-2 text-xs text-danger">
                  {task.error}
                </div>
              )}

              {!task?.error && task?.internal_state === 'stale' && (
                <div className="rounded border border-warning/25 bg-warning/10 px-2.5 py-2 text-xs text-warning">
                  This task was marked stale after the thread changed. Reassess before acting on it.
                </div>
              )}

              {taskIsAssessing && (
                <div className="flex items-center gap-2 rounded border border-accent/25 bg-accent/10 px-2.5 py-2 text-xs text-text-secondary">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden="true" />
                  Reassessment running
                </div>
              )}

              {(taskQueuedForCode || taskUpdatingCode) && (
                <div className="flex items-center gap-2 rounded border border-accent/25 bg-accent/10 px-2.5 py-2 text-xs text-text-secondary">
                  <span className={cx(
                    'h-3.5 w-3.5 rounded-full border-2 border-accent/30',
                    taskUpdatingCode ? 'animate-spin border-t-accent' : 'border-accent/70 bg-accent/20',
                  )} aria-hidden="true" />
                  {taskQueuedForCode ? 'Queued for code update' : 'Updating code'}
                </div>
              )}

              {latestCommentBody && (
                <CommentExcerpt
                  label="Comment"
                  body={latestCommentBody}
                  meta={latestComment ? `@${latestComment.author} · ${formatDateTime(latestComment.createdAt)}` : undefined}
                />
              )}

              {task?.disposition && task.rationale && (
                <CommentExcerpt
                  label={DISPOSITION_LABEL[task.disposition]}
                  body={task.rationale}
                  tone={DISPOSITION_TONE[task.disposition]}
                />
              )}

              {task?.draft_reply && (
                <CommentExcerpt
                  label="Draft reply"
                  body={task.draft_reply}
                  tone="accent"
                  defaultExpanded
                />
              )}

              {thread.comments.length > 1 && (
                <details className="group/comments">
                  <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xxs text-text-tertiary transition-colors hover:text-text-muted">
                    <ChevronRightIcon className="h-3 w-3 transition-transform group-open/comments:rotate-90" />
                    <span>Full thread ({thread.comments.length})</span>
                    {thread.participants.length > 0 && (
                      <span className="min-w-0 truncate">from {thread.participants.join(', ')}</span>
                    )}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {thread.comments.map((comment) => (
                      <div key={comment.id} className="border-l border-border-subtle pl-3">
                        <div className="text-xxs text-text-muted">
                          @{comment.author} ({comment.authorType.toLowerCase()}) · {formatDateTime(comment.createdAt)}
                        </div>
                        <div className="prose prose-review mt-1 break-words">
                          <Markdown options={githubMarkdownOptions}>
                            {transformPlanRefs(sanitizeGitHubMarkdown(comment.body))}
                          </Markdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Action footer: one primary, two quiet secondaries, overflow menu */}
              <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {canPostDraft && (
                    <button
                      type="button"
                      disabled={!isOwner || taskIsAssessing || actionKey === `reply:${thread.id}`}
                      title={!isOwner ? ownerTitle : undefined}
                      className={ACTION_BUTTON_PRIMARY}
                      onClick={() => onPostReply(thread.id, true)}
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      Post reply
                    </button>
                  )}
                  {!canPostDraft && canAddress && task && (
                    <button
                      type="button"
                      disabled={!isOwner || taskIsAssessing || isAddressingReview || actionKey === `address:${task.id}`}
                      title={!isOwner ? ownerTitle : isAddressingReview ? 'Code update already running' : undefined}
                      className={ACTION_BUTTON_PRIMARY}
                      onClick={() => onAddressThread(task.id)}
                    >
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                      Address
                    </button>
                  )}
                  <button
                    type="button"
                    className={ACTION_BUTTON_GHOST}
                    onClick={() => onToggleReply(thread.id)}
                  >
                    Reply
                  </button>
                  {!thread.isResolved ? (
                    <button
                      type="button"
                      disabled={actionKey === `resolve:${thread.id}`}
                      className={ACTION_BUTTON_GHOST}
                      onClick={() => onResolve(thread.id)}
                    >
                      Resolve
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionKey === `unresolve:${thread.id}`}
                      className={ACTION_BUTTON_GHOST}
                      onClick={() => onUnresolve(thread.id)}
                    >
                      Reopen
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  aria-label="More actions"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                  onClick={(event) => onOpenMenu(thread.id, event.clientX, event.clientY)}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
              </div>

              {isReplyOpen && (
                <div className="space-y-2 border-t border-border-subtle pt-2">
                  <textarea
                    value={replyBody}
                    onChange={(event) => onChangeReply(event.target.value)}
                    placeholder="Write a GitHub reply..."
                    rows={3}
                    className="w-full resize-y rounded border border-border-subtle bg-surface-2 px-2.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!replyBody.trim()}
                      className={ACTION_BUTTON_PRIMARY}
                      onClick={() => onPostReply(thread.id, false)}
                    >
                      Post
                    </button>
                    {!thread.isResolved && (
                      <button
                        type="button"
                        disabled={!replyBody.trim()}
                        className={ACTION_BUTTON_SECONDARY}
                        onClick={() => onPostReply(thread.id, true)}
                      >
                        Post + resolve
                      </button>
                    )}
                    <button
                      type="button"
                      className={ACTION_BUTTON_GHOST}
                      onClick={() => onToggleReply(thread.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ReviewerVerdictStrip({ reviewers }: { reviewers: ReviewerVerdict[] }) {
  return (
    <div>
      <div className="text-xxs font-semibold uppercase tracking-wide text-text-tertiary">Reviewers</div>
      <ul className="mt-1.5 space-y-0.5">
        {reviewers.map((reviewer) => (
          <li key={reviewer.author}>
            <button
              type="button"
              onClick={() => openExternalUrl(reviewer.url)}
              title="Open review on GitHub"
              className="group/rv flex w-full items-center gap-2 text-left text-xxs"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-text-secondary group-hover/rv:text-text-primary">
                @{reviewer.author}
              </span>
              <span className={cx('shrink-0', reviewerVerdictTone(reviewer.state))}>
                {formatReviewerVerdict(reviewer.state)}
              </span>
              <span className="shrink-0 tabular-nums text-text-muted">{formatRelativeShort(reviewer.submittedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
      <div className="prose prose-review mt-2 break-words">
        <Markdown options={githubMarkdownOptions}>
          {transformPlanRefs(sanitizeGitHubMarkdown(comment.body))}
        </Markdown>
      </div>
    </article>
  );
}

/** Quiet, collapsed-by-default disclosure for PR-level reference content. */
function ReferenceSection({
  icon,
  label,
  count,
  children,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <details className="group/ref rounded-md border border-border-subtle bg-surface-0">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xxs font-semibold uppercase tracking-wide text-text-tertiary transition-colors hover:text-text-secondary">
        <ChevronRightIcon className="h-3 w-3 transition-transform group-open/ref:rotate-90" />
        {icon}
        <span>{label}</span>
        <span className="tabular-nums text-text-muted">{count}</span>
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}

interface NextActionHandlers {
  onAssessAttention: () => void;
  onPostAll: () => void;
  onAddressAll: () => void;
  onDraftReplies: () => void;
  onAssessNew: () => void;
}

const NEXT_ACTION_ICON: Partial<Record<NextActionKind, ReactNode>> = {
  'post-drafted-replies': <CheckIcon className="h-3.5 w-3.5" />,
  'fixes-ready': <ChevronRightIcon className="h-3.5 w-3.5" />,
  'draft-replies': <MessageCircleIcon className="h-3.5 w-3.5" />,
};

function getNextActionHandler(kind: NextActionKind, handlers: NextActionHandlers): (() => void) | undefined {
  switch (kind) {
    case 'needs-attention':
      return handlers.onAssessAttention;
    case 'post-drafted-replies':
      return handlers.onPostAll;
    case 'fixes-ready':
      return handlers.onAddressAll;
    case 'draft-replies':
      return handlers.onDraftReplies;
    case 'assess-new':
      return handlers.onAssessNew;
    case 'assessment-running':
    case 'updating-code':
    case 'decisions-need-you':
      return undefined;
  }
}

/** Attaches click handlers and icons to a presentation-free next-action decision. */
function buildNextAction(decision: NextActionDecision | null, handlers: NextActionHandlers): NextAction | null {
  if (!decision) return null;
  const onClick = getNextActionHandler(decision.kind, handlers);
  return {
    tone: decision.tone,
    text: decision.text,
    busy: decision.busy,
    button: decision.button && onClick
      ? {
          label: decision.button.label,
          onClick,
          actionKey: decision.button.actionKey,
          variant: decision.button.variant,
          disabled: decision.button.disabled,
          title: decision.button.title,
          icon: NEXT_ACTION_ICON[decision.kind],
        }
      : undefined,
  };
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
  const proposeChange = useProposedChangeDisposal((state) => state.propose);

  const [actionState, setActionState] = useState<ReviewActionState | null>(null);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [threadView, setThreadView] = useState<ThreadView>('queue');
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<ReviewMenuState | null>(null);

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
  const isAssessmentPending = assessmentPending != null;
  const stats = useMemo(() => getStats(inbox, session.id), [inbox, session.id]);
  const addressingReview = isAddressingReview(stats, session.automation_phase, session.status);
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

  // Reviews surface only as a deduped per-reviewer verdict strip; each row links
  // to the full review on GitHub. The line comments a review wraps already live
  // in the thread queue, so review bodies aren't re-shown in the cockpit.
  const reviewers = useMemo(
    () => summarizeReviewers(snapshot?.topLevelReviews ?? []),
    [snapshot?.topLevelReviews],
  );

  // Auto-expand the first thread in the active view; keep the user's choice
  // while it stays visible, otherwise fall back to the top of the list.
  useEffect(() => {
    setExpandedThreadId((current) => {
      if (current && visibleThreads.some((thread) => thread.id === current)) return current;
      return visibleThreads[0]?.id ?? null;
    });
  }, [visibleThreads]);

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
      const count = result.taskIds?.length ?? 0;
      toast.success(result.context
        ? `Sent ${count} thread${count === 1 ? '' : 's'} to dev session`
        : `Queued ${count} thread${count === 1 ? '' : 's'} for the current code update`);
      return true;
    });
  }

  async function handleAddressTask(taskId: string): Promise<void> {
    await withAction(`address:${taskId}`, async () => {
      const result = await triggerReviewAutomation(session.id, [taskId]);
      if (!result.success) {
        toast.error(result.error || 'Failed');
        return false;
      }
      toast.success(result.context ? 'Sent thread to dev session' : 'Queued thread for the current code update');
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
      proposeChange(buildReviewReplyProposal({
        session,
        thread,
        threadId: task.thread_id,
        title: task.title,
        body: task.draft_reply,
        resolve: true,
      }));
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
      proposeChange(buildReviewReplyProposal({
        session,
        thread,
        threadId,
        title: task?.title ?? getThreadLocation(thread),
        body,
        resolve,
      }));
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
      : addressingReview
        ? 'Code update already running'
        : undefined;

  // Status line under the title: how much work is waiting, plainly.
  const summaryMain = stats.queueCount > 0
    ? `${stats.queueCount} in your queue`
    : stats.openThreadCount > 0
      ? 'Queue clear'
      : stats.closedThreadCount > 0
        ? 'All threads resolved'
        : 'No review threads yet';
  const summaryMuted = stats.closedThreadCount > 0 ? `${stats.closedThreadCount} closed` : null;

  // The single most important next step. Mirrors the workflow state machine.
  const nextActionDecision = deriveNextAction({ stats, assessmentPending, addressingReview, isOwner, ownerTitle });
  const nextAction = buildNextAction(nextActionDecision, {
    onAssessAttention: () => void handleAssess({ taskIds: stats.retryableAttentionTaskIds }, 'assess-attention'),
    onPostAll: handleApproveAll,
    onAddressAll: () => void handleAddress(),
    onDraftReplies: () => void handleDraftReplies(),
    onAssessNew: () => void handleAssess(),
  });

  const menuThread = menuState ? snapshot?.threads.find((thread) => thread.id === menuState.threadId) : undefined;
  const menuTask = menuState ? taskMap.get(menuState.threadId) : undefined;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-surface-0 [scrollbar-gutter:stable]">
      <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-0/95 backdrop-blur">
        <div className="space-y-3 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-xs font-semibold text-text-primary">Review</span>
                {snapshot && <span className="text-xs tabular-nums text-text-muted">#{snapshot.prNumber}</span>}
                {snapshot?.reviewDecision && snapshot.reviewDecision !== 'APPROVED' && (
                  <Badge variant={snapshot.reviewDecision === 'CHANGES_REQUESTED' ? 'danger' : 'warning'} size="sm">
                    {formatReviewDecision(snapshot.reviewDecision)}
                  </Badge>
                )}
              </div>
              {snapshot && (
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xxs">
                  <span className={cx('font-medium', stats.queueCount > 0 ? 'text-text-secondary' : 'text-text-muted')}>
                    {summaryMain}
                  </span>
                  {summaryMuted && <span className="text-text-tertiary">&middot; {summaryMuted}</span>}
                  <span className="text-text-tertiary">&middot; synced {formatDateTime(snapshot.fetchedAt)}</span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {stats.assessableCount > 0 && (
                <LoadingButton
                  size="sm"
                  variant="secondary"
                  disabled={!isOwner || isAssessmentPending || addressingReview}
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

          {snapshot && reviewers.length > 0 && <ReviewerVerdictStrip reviewers={reviewers} />}

          {snapshot && nextAction && <NextActionBar action={nextAction} actionKey={actionKey} />}

          {snapshot && (
            <ViewTabs
              view={threadView}
              counts={{ queue: stats.queueCount, open: stats.openThreadCount, closed: stats.closedThreadCount }}
              onChange={setThreadView}
            />
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
              <div className="rounded-md border border-border-subtle bg-surface-1 px-3 py-2.5">
                <div className="text-xxs font-medium text-text-secondary">{emptyCopy.title}</div>
                <div className="mt-0.5 text-xxs text-text-muted">{emptyCopy.description}</div>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleThreads.map((thread) => {
                  const task = taskMap.get(thread.id);
                  return (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      task={task}
                      expanded={expandedThreadId === thread.id}
                      isOwner={isOwner}
                      ownerTitle={ownerTitle}
                      isReplyOpen={replyThreadId === thread.id}
                      replyBody={replyThreadId === thread.id ? replyBody : ''}
                      actionKey={actionKey}
                      isAssessing={task ? pendingAssessmentTaskIds.has(task.id) : false}
                      isAddressingReview={addressingReview}
                      onToggleExpand={(id) => setExpandedThreadId((current) => (current === id ? null : id))}
                      onToggleReply={(id) => {
                        setReplyThreadId(replyThreadId === id ? null : id);
                        setReplyBody('');
                      }}
                      onChangeReply={setReplyBody}
                      onAddressThread={(taskId) => void handleAddressTask(taskId)}
                      onPostReply={(id, resolve) => void handlePostReply(id, resolve)}
                      onResolve={(id) => void handleResolve(id)}
                      onUnresolve={(id) => void handleUnresolve(id)}
                      onOpenMenu={(id, x, y) => setMenuState({ threadId: id, x, y })}
                    />
                  );
                })}
              </div>
            )}

            {snapshot.conversationComments.length > 0 && (
              <ReferenceSection
                icon={<MessageCircleIcon className="h-3.5 w-3.5" />}
                label="Conversation"
                count={snapshot.conversationComments.length}
              >
                {snapshot.conversationComments.map((comment) => (
                  <ConversationCommentCard key={comment.id} comment={comment} />
                ))}
              </ReferenceSection>
            )}
          </>
        )}
      </div>

      {menuState && menuThread && (
        <DropdownMenu
          isOpen
          onClose={() => setMenuState(null)}
          position={{ type: 'point', x: menuState.x, y: menuState.y }}
          minWidth={180}
        >
          {menuTask && canReassessTask(menuTask, menuThread) && (
            <DropdownMenu.Item
              disabled={!isOwner}
              title={!isOwner ? ownerTitle : undefined}
              onClick={() => void handleAssess({ taskIds: [menuTask.id] }, `reassess:${menuTask.id}`)}
            >
              Reassess
            </DropdownMenu.Item>
          )}
          {menuTask && menuTask.status !== 'done' && menuTask.disposition && !menuThread.isResolved && (
            <DropdownMenu.Submenu trigger="Set disposition">
              {(['implement', 'push_back', 'needs_user_input'] as ReviewDisposition[]).map((disposition) => (
                <DropdownMenu.SubmenuItem
                  key={disposition}
                  selected={menuTask.disposition === disposition}
                  onClick={() => void handleOverrideDisposition(menuTask.id, disposition)}
                >
                  {DISPOSITION_LABEL[disposition]}
                </DropdownMenu.SubmenuItem>
              ))}
            </DropdownMenu.Submenu>
          )}
          {menuTask && menuTask.internal_state !== 'ignored' && !menuThread.isResolved && (
            <DropdownMenu.Item
              disabled={!isOwner}
              title={!isOwner ? ownerTitle : undefined}
              onClick={() => void handleIgnore(menuTask.id)}
            >
              Ignore
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onClick={() => openExternalUrl(menuThread.url)}>
            Open in GitHub
          </DropdownMenu.Item>
        </DropdownMenu>
      )}
    </div>
  );
}
