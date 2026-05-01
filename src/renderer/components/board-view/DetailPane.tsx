/**
 * DetailPane - Slide-in panel showing agent session details.
 *
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ActivityTab } from './ActivityTab';
import { ChangesTab } from './ChangesTab';
import { CreatePrModal } from '../development/CreatePrModal';
import { GeneratePrContentModal } from '../development/GeneratePrContentModal';
import { LinkPrDialog } from '../development/LinkPrDialog';
import { ReviewTab } from '../development/ReviewTab';
import { useAgentSession } from '../../hooks/useAgentSession';
import { useDevSessionsStore } from '../../stores/devSessions';
import { openExternalUrl } from '../../services/shellService';
import { usePlanDomainStore, useProjectUiDomainStore, toast } from '../../stores';
import { copyToClipboard } from '../../utils/clipboard';
import { toReviewSessionId } from '../../../shared/agent-types';

interface DetailPaneProps {
  session: DevSessionWithPlanItem;
  onClose: () => void;
}

type DetailTab = 'activity' | 'changes' | 'review';

export const DetailPane = memo(function DetailPane({
  session,
  onClose,
}: DetailPaneProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('activity');
  const [showCreatePr, setShowCreatePr] = useState(false);
  const [showGeneratePrContent, setShowGeneratePrContent] = useState(false);
  const [showLinkPr, setShowLinkPr] = useState(false);
  const [changesRefreshToken, setChangesRefreshToken] = useState(0);
  // When true, committing also transitions the card to in_review (Ready for Review path).
  // When false, committing is standalone — no status change (Changes tab path).
  const [commitTransitionsToReview, setCommitTransitionsToReview] = useState(false);
    useShallow((s) => ({
      commitState: s.commitStateBySessionId.get(session.id),
      diff: s.diffBySessionId.get(session.id),
    }))
  );
  const setCommitState = useDevSessionsStore((s) => s.setCommitState);
  const loadDiff = useDevSessionsStore((s) => s.loadDiff);
  const implementationSession = useAgentSession(session.id);
  const reviewSessionId = toReviewSessionId(session.id);
  const reviewSession = useAgentSession(reviewSessionId);
  const showReviewSession =
    reviewSession.agentState === 'starting'
    || reviewSession.agentState === 'working'
    || reviewSession.agentState === 'waiting_for_input'
    || reviewSession.agentState === 'failed'
    || reviewSession.agentState === 'stopped';
  const effectiveAgentState = showReviewSession ? reviewSession.agentState : implementationSession.agentState;
  const effectiveActivities = showReviewSession ? reviewSession.activities : implementationSession.activities;

  const updateStatusCategory = usePlanDomainStore((s) => s.updateStatusCategory);
  const planItem = usePlanDomainStore((s) =>
    session.plan_item_id ? s.planItems.find((p) => p.id === session.plan_item_id) : undefined
  );
  const implIsTerminal =
    implementationSession.agentState === 'complete'
    || implementationSession.agentState === 'failed'
    || implementationSession.agentState === 'stopped';
  const reviewIsActive =
    reviewSession.agentState === 'starting'
    || reviewSession.agentState === 'working'
    || reviewSession.agentState === 'waiting_for_input';
  // Manual opposing-agent review can be triggered when the impl is terminal
  // (or the session is inactive) and no review is already in flight. Used when
  // the automated post-impl review was skipped (e.g. Codex unavailable).
  const canRunReview = (implIsTerminal || session.status === 'inactive')
    && !reviewIsActive
    && session.automation_phase !== 'addressing_review'
    && commitState?.status !== 'running';
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'review' && session.pr_number == null) {
      setActiveTab('activity');
    }
  }, [activeTab, session.pr_number]);

    void stopAgentSession(session.id);

  const handleRunReview = useCallback(() => {
    void (async () => {
      const result = await launchAutoReview(session.id);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to start review');
        return;
      }
      if (!result.reviewSessionId) {
        toast.info('Nothing to review — no diff or reviewer available');
        return;
      }
      toast.success('Review started');
    })();
  }, [session.id]);

  const moveToReview = useCallback(() => {
    if (session.plan_item_id) {
      void updateStatusCategory(session.plan_item_id, 'in_review');
      const title = session.plan_item?.title ?? session.name ?? 'Task';
      toast.success(`${title} — moved to review`);
    }
  }, [session.plan_item_id, session.plan_item?.title, session.name, updateStatusCategory]);

    if (commitState?.status === 'running') {
      toast.info('Commit already in progress');
      return;
    }

    if (typeof diff === 'string' && diff.trim().length > 0) {
      setCommitTransitionsToReview(true);
    } else {
      moveToReview();
    }
  }, [commitState?.status, diff, moveToReview]);

    if (commitState?.status === 'running') {
      toast.info('Commit already in progress');
      return;
    }

    setCommitTransitionsToReview(false);
  }, [commitState?.status]);

  const handleOpenPr = useCallback(() => {
    if (!session.pr_url) {
      toast.error('No PR linked to this session');
      return;
    }

    openExternalUrl(session.pr_url);
  }, [session.pr_url]);

  const handleCopyWorktree = useCallback(() => {
    const path = session.worktree_path;
    void copyToClipboard(path ? `"${path}"` : '', 'Worktree path');
  }, [session.worktree_path]);

  const addFocusedResource = useProjectUiDomainStore((s) => s.addFocusedResource);
  const handleAddToContext = useMemo(() => {
    if (!planItem) return undefined;
    return () => {
      const result = addFocusedResource({
        type: 'plan_item',
        id: planItem.id,
        title: planItem.title,
      });
      if (result.added) toast.success(`Added "${planItem.title}" to chat context`);
      else toast.info(`"${planItem.title}" is already in chat context`);
    };
  }, [planItem, addFocusedResource]);

  const detailSession = {
    ...session,
    sessionType: 'dev' as const,
  };

  const handleCommitSubmit = useCallback((message: string) => {
    const shouldMoveToReview = commitTransitionsToReview;
    setCommitState(session.id, {
      status: 'running',
      message,
      startedAt: Date.now(),
      moveToReviewOnSuccess: shouldMoveToReview,
    });
    toast.info('Committing…');

    void (async () => {
      try {
        if (!result.success) {
          const errMsg = result.error ?? 'Commit failed';
          const commitError = errMsg.includes('Nothing to commit') || errMsg.includes('nothing to commit')
            ? 'Worktree is clean — nothing to commit.'
            : errMsg;
          setCommitState(session.id, {
            status: 'failed',
            message,
            startedAt: Date.now(),
            error: commitError,
            moveToReviewOnSuccess: shouldMoveToReview,
          });
          return;
        }

        setCommitState(session.id, null);
        await loadDiff(session.id, { force: true });
        if (isMountedRef.current) {
          setChangesRefreshToken((value) => value + 1);
        }

        toast.success('Commit complete');
        if (shouldMoveToReview) {
          moveToReview();
        }
      } catch (error) {
        const commitError = error instanceof Error ? error.message : 'Commit failed';
        setCommitState(session.id, {
          status: 'failed',
          message,
          startedAt: Date.now(),
          error: commitError,
          moveToReviewOnSuccess: shouldMoveToReview,
        });
      }
    })();
  }, [commitTransitionsToReview, loadDiff, moveToReview, session.id, setCommitState]);

  return (
    <>
    <CreatePrModal
      isOpen={showCreatePr}
      onClose={() => setShowCreatePr(false)}
      session={detailSession}
      onPrCreated={() => undefined}
    />
    <GeneratePrContentModal
      isOpen={showGeneratePrContent}
      onClose={() => setShowGeneratePrContent(false)}
      session={detailSession}
    />
    <LinkPrDialog
      isOpen={showLinkPr}
      onClose={() => setShowLinkPr(false)}
      session={detailSession}
    />
    <div className="flex h-full min-w-0 w-full flex-col border-l border-border-subtle bg-surface-0">
      <DetailPaneHeader
        session={session}
        agentState={effectiveAgentState}
        commitState={commitState}
        canRunReview={canRunReview}
        onClose={onClose}
        onRunReview={handleRunReview}
        onCreatePr={() => setShowCreatePr(true)}
        onGeneratePrContent={() => setShowGeneratePrContent(true)}
        onLinkPr={() => setShowLinkPr(true)}
        onOpenPr={handleOpenPr}
        onCopyWorktree={handleCopyWorktree}
        onAddToContext={handleAddToContext}
      />

            )}

            agentState={effectiveAgentState}
          />
    </div>
    </>
  );
});
