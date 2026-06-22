/**
 * DetailPane - Slide-in panel showing agent session details.
 *
 * Lifecycle-driven: a phase stepper + a single phase-aware "Next" strip
 * (SessionNextActionBar) sit above tabbed detail (Activity / Changes / Review).
 * The bottom region follows state — live progress while the agent works, a
 * free-text input once it's terminal.
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DetailPaneHeader } from './DetailPaneHeader';
import { PhaseStepper } from './PhaseStepper';
import { SessionNextActionBar } from './SessionNextActionBar';
import { LiveProgressFooter } from './LiveProgressFooter';
import { ActivityTab } from './ActivityTab';
import { ChangesTab } from './ChangesTab';
import { DetailChatInput, type DetailChatInputHandle } from './DetailChatInput';
import { usePanelStatus } from './usePanelStatus';
import type { PanelActionId } from './panelStatus';
import { CreatePrModal } from '../development/CreatePrModal';
import { GeneratePrContentModal } from '../development/GeneratePrContentModal';
import { LinkPrDialog } from '../development/LinkPrDialog';
import { ReviewTab } from '../development/ReviewTab';
import { useAgentSession } from '../../hooks/useAgentSession';
import { useDevSessionsStore } from '../../stores/devSessions';
import { openDevSessionInEditor } from '../../services/devSessionService';
import { openExternalUrl } from '../../services/shellService';
import { usePlanDomainStore, useProjectUiDomainStore, toast } from '../../stores';
import { copyToClipboard } from '../../utils/clipboard';
import { isCommitHookRepairPhase, type DevSessionWithPlanItem } from '../../../shared/types';
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
  // Whether the inline commit composer is open in the Changes tab. Both entry
  // points ("Ready for Review" in the Next strip, "Commit" in the Changes tab)
  // open the same inline composer rather than a floating popover.
  const [commitComposerOpen, setCommitComposerOpen] = useState(false);
  const [showCreatePr, setShowCreatePr] = useState(false);
  const [showGeneratePrContent, setShowGeneratePrContent] = useState(false);
  const [showLinkPr, setShowLinkPr] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  const [changesRefreshToken, setChangesRefreshToken] = useState(0);
  // When true, committing also transitions the card to in_review (Ready for Review path).
  // When false, committing is standalone — no status change (Changes tab path).
  const [commitTransitionsToReview, setCommitTransitionsToReview] = useState(false);
  const chatInputRef = useRef<DetailChatInputHandle>(null);

  const { commitState, diff } = useDevSessionsStore(
    useShallow((s) => ({
      commitState: s.commitStateBySessionId.get(session.id),
      diff: s.diffBySessionId.get(session.id),
    }))
  );
  const setCommitState = useDevSessionsStore((s) => s.setCommitState);
  const loadDiff = useDevSessionsStore((s) => s.loadDiff);

  const status = usePanelStatus(session);

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
    && !isCommitHookRepairPhase(session.automation_phase)
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

  const handleStop = useCallback(() => {
    void stopAgentSession(session.id);
  }, [session.id]);

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

  const handleReadyForReview = useCallback(() => {
    if (commitState?.status === 'running') {
      toast.info('Commit already in progress');
      return;
    }

    if (typeof diff === 'string' && diff.trim().length > 0) {
      setCommitTransitionsToReview(true);
      setActiveTab('changes');
      setCommitComposerOpen(true);
    } else {
      moveToReview();
    }
  }, [commitState?.status, diff, moveToReview]);

  const handleChangesTabCommit = useCallback(() => {
    if (commitState?.status === 'running') {
      toast.info('Commit already in progress');
      return;
    }

    setCommitTransitionsToReview(false);
    setCommitComposerOpen(true);
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

  const handleOpenEditor = useCallback(() => {
    if (isOpeningEditor) return;

    setIsOpeningEditor(true);
    void (async () => {
      try {
        const result = await openDevSessionInEditor(session.id);
        if (!result.success) {
          toast.error(result.error || 'Failed to open editor');
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to open editor');
      } finally {
        if (isMountedRef.current) {
          setIsOpeningEditor(false);
        }
      }
    })();
  }, [isOpeningEditor, session.id]);

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

  // Map the strip's semantic action ids to handlers. Review-queue ids route to
  // the Review tab (where ReviewTab's own next-action bar performs them with
  // full context); everything else acts directly.
  const handlePanelAction = useCallback((id: PanelActionId) => {
    switch (id) {
      case 'stop':
        handleStop();
        break;
      case 'ready_for_review':
        handleReadyForReview();
        break;
      case 'run_review':
        handleRunReview();
        break;
      case 'create_pr':
        setShowCreatePr(true);
        break;
      case 'open_pr':
        handleOpenPr();
        break;
      case 'view_changes':
        setActiveTab('changes');
        break;
      case 'focus_input':
      case 'follow_up':
      case 'retry':
        chatInputRef.current?.focus();
        break;
      case 'assess':
      case 'reassess_attention':
      case 'address_all':
      case 'draft_replies':
      case 'post_all_replies':
        setActiveTab('review');
        break;
    }

  const detailSession = {
    ...session,
    sessionType: 'dev' as const,
  };

  const handleCommitSubmit = useCallback((message: string) => {
    const shouldMoveToReview = commitTransitionsToReview;
    setCommitComposerOpen(false);
    setCommitState(session.id, {
      status: 'running',
      message,
      startedAt: Date.now(),
      moveToReviewOnSuccess: shouldMoveToReview,
    });
    toast.info('Committing…');

    void (async () => {
      try {
        const result = await commitAgentSession(session.id, message, { repairOnFailure: true });
        if (!result.success) {
          const errMsg = result.error ?? 'Commit failed';
          if (result.repairStarted) {
            setCommitState(session.id, null);
            setActiveTab('activity');
            toast.info('Agent is fixing commit checks');
            return;
          }

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
          toast.error('Commit checks failed', {
            label: 'View',
            onClick: () => setActiveTab('changes'),
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
        toast.error('Commit failed', {
          label: 'View',
          onClick: () => setActiveTab('changes'),
        });
      }
    })();
  }, [commitTransitionsToReview, loadDiff, moveToReview, session.id, setCommitState]);

  const showStrip = !!status.nextAction && activeTab !== 'review' && !status.progress;

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
        onOpenEditor={session.worktree_path ? handleOpenEditor : undefined}
        isOpeningEditor={isOpeningEditor}
        onCopyWorktree={handleCopyWorktree}
        onAddToContext={handleAddToContext}
      />

      <PhaseStepper stepIndex={status.stepIndex} />

      {/* Tab bar — kept directly under the stepper so its position never shifts;
          the Next strip lives below it so toggling the strip can't move tabs. */}
      <div className="flex border-b border-border-subtle bg-surface-1">
        {(['activity', 'changes', ...(session.pr_number != null ? (['review'] as const) : [])] as const).map((tabId) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={`
              px-4 py-2 text-xs font-medium transition-colors relative
              ${activeTab === tabId
                ? 'text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
          >
            {tabId === 'activity' ? 'Activity' : tabId === 'changes' ? 'Changes' : 'Review'}
            {activeTab === tabId && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {showStrip && status.nextAction && (
        <div className="px-3 py-2">
        </div>
      )}

      {/* Tab content — flex-1 so it fills remaining space */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'activity' && (
          <ActivityTab
            activities={effectiveActivities}
            agentState={effectiveAgentState}
            sessionLabel={showReviewSession ? 'Auto-review' : undefined}
            emptyActiveLabel={status.progress?.label ?? status.nextAction?.text}
          />
        )}
        {activeTab === 'changes' && (
          <ChangesTab
            session={session}
            sessionId={session.id}
            commitState={commitState}
            refreshToken={changesRefreshToken}
            commitComposerOpen={commitComposerOpen}
            commitSubmitLabel={commitTransitionsToReview ? 'Commit & Ready for Review' : 'Commit'}
            showCommitSkip={commitTransitionsToReview}
            onCommitOpen={handleChangesTabCommit}
            onCommitSubmit={handleCommitSubmit}
            onCommitCancel={() => setCommitComposerOpen(false)}
            onCommitComplete={() => {
              setCommitComposerOpen(false);
              if (commitTransitionsToReview) {
                moveToReview();
              }
            }}
          />
        )}
        {activeTab === 'review' && session.pr_number != null && (
          <ReviewTab key={detailSession.id} session={detailSession} />
        )}
      </div>

      {/* Bottom region follows state: live progress while working, input once terminal. */}
      {status.progress ? (
        <LiveProgressFooter
          progress={status.progress}
          startedAt={commitState?.status === 'running' ? commitState.startedAt : session.updated_at}
          onStop={status.phase === 'implementing' ? handleStop : undefined}
        />
      ) : (
        <DetailChatInput
          ref={chatInputRef}
          devSessionId={session.id}
          agentState={effectiveAgentState}
        />
      )}
    </div>
    </>
  );
});
