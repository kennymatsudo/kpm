/**
 *
 */

import type {
  DevSessionWithPlanItem,
  PrReviewThread,
  ReviewDisposition,
  ReviewTask,
  ReviewTaskStatus,
} from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { useApprovalQueueStore } from '../../stores/approvalQueueStore';
import { toast } from '../../stores/toastStore';
import { openExternalUrl } from '../../services/shellService';

const DISPOSITION_LABEL: Record<ReviewDisposition, string> = {
  implement: 'Implement',
  push_back: 'Push back',
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface ReviewTabProps {
  session: DevSessionWithPlanItem;
}

}

function getThreadLocation(thread: PrReviewThread): string {
  if (thread.path && thread.line != null) return `${thread.path}:${thread.line}`;
  if (thread.path) return thread.path;
  return 'General';
}

function sortThreads(a: PrReviewThread, b: PrReviewThread, taskMap: Map<string, ReviewTask>): number {
  const ta = taskMap.get(a.id);
  const tb = taskMap.get(b.id);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  if (ta && tb) {
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}


  thread,
  task,
  isOwner,
  isReplyOpen,
  replyBody,
  actionKey,
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
  isReplyOpen: boolean;
  replyBody: string;
  actionKey: string | null;
  onToggleReply: (threadId: string) => void;
  onChangeReply: (value: string) => void;
  onAddressThread: (taskId: string) => void;
  onPostReply: (threadId: string, resolve: boolean) => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (threadId: string) => void;
}) {
  return (

  );
}

// ---------------------------------------------------------------------------
// ReviewTab
// ---------------------------------------------------------------------------

export function ReviewTab({ session }: ReviewTabProps) {
  const hasPr = session.pr_number != null;

  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

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
  const isOwner = inbox?.ownership?.session_id === session.id;
  const ownerTitle = isOwner ? undefined : 'Only the agent session that owns this review can act on it';



  async function withAction(key: string, fn: () => boolean | Promise<boolean>): Promise<void> {
  }

  async function handleRefresh(): Promise<void> {
    await withAction('refresh', async () => {
      return true;
    });
  }

      return true;
    });
  }

  async function handleAddress(): Promise<void> {
    await withAction('address', async () => {
      return true;
    });
  }

  async function handleDraftReplies(): Promise<void> {
    await withAction('draft', async () => {
      toast.success('Replies drafted');
      return true;
    });
  }

  function handleApproveAll(): void {
      if (!task.draft_reply) continue;
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
  }

  async function handlePostReply(threadId: string, resolve: boolean): Promise<void> {
    if (!thread) return;
    const task = taskMap.get(threadId);
    const body = task?.draft_reply || replyBody.trim();
    await withAction(`reply:${threadId}`, () => {
      processReviewReplyDraft({
        threadUrl: thread.url,
        threadTitle: task?.title ?? getThreadLocation(thread),
        threadLocation: getThreadLocation(thread),
        latestCommentPreview: thread.latestCommentPreview,
      });
      setReplyThreadId(null);
      setReplyBody('');
      return true;
    });
  }

  async function handleResolve(threadId: string): Promise<void> {
    await withAction(`resolve:${threadId}`, async () => {
      return true;
    });
  }

  async function handleUnresolve(threadId: string): Promise<void> {
    await withAction(`unresolve:${threadId}`, async () => {
      return true;
    });
  }

  async function handleIgnore(taskId: string): Promise<void> {
    await withAction(`ignore:${taskId}`, async () => {
      return true;
    });
  }

  async function handleOverrideDisposition(taskId: string, disposition: ReviewDisposition): Promise<void> {
    await withAction(`override:${taskId}`, async () => {
      return true;
    });
  }

  return (

              </LoadingButton>
          </div>

      </div>

        {isLoading && !inbox ? (
          </div>
        ) : !snapshot ? (
          <EmptyState
            title="No review data"
            description={error || 'Could not load review state.'}
            size="sm"
          />
        ) : (
        )}
      </div>
    </div>
  );
}
