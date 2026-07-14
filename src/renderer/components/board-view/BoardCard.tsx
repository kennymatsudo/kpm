import { memo, Fragment, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { HighlightedText } from '../planning/HighlightedText';
import { useDevSessionsStore } from '../../stores/devSessions';
import { CardActivityLine } from './CardActivityLine';
import { derivePanelStatus, type PanelPhase, type NextAction } from './panelStatus';
import { toReviewPhaseStats } from './usePanelStatus';
import { getStats } from '../development/reviewStats';
import { resolveStatusCategory } from '../../constants/statusConfig';
import { ACTIVE_SESSION_STATUSES, isLiveAutomationPhase, OPENABLE_SESSION_STATUSES } from '../../../shared/types';
import type { PlanItem } from '../../../shared/types';
import { toReviewSessionId } from '../../../shared/agent-types';
import { openExternalUrl } from '../../services/shellService';
import { TrackerIcon, trackerLabelFor } from '../tracker/shared/trackerDisplay';
import { Tooltip } from '../ui';

const STALE_ACTIVITY_MS = 5 * 60 * 1000;

/** Phases that read as "an agent process is actively running" for card border/pulse styling. */
const LIVE_PANEL_PHASES: ReadonlySet<PanelPhase> = new Set([
  'committing', 'fixing_hooks', 'implementing', 'reviewing', 'addressing',
]);

export interface Breadcrumb {
  title: string;
  externalKey?: string;
}

interface BoardCardProps {
  item: PlanItem;
  breadcrumb: Breadcrumb[];
  isSelected: boolean;
  isFocused: boolean;
  searchQuery: string;
  childCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect: (addToSelection: boolean) => void;
  onSelectRange?: () => void;
  onEdit: () => void;
  onPrepareEdit?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStartAgent?: (itemId: string) => void;
  onStopAgent?: (devSessionId: string) => void;
  onOpenDetail?: (itemId: string) => void;
}

function buildReviewActionableTooltip(
  counts: { needsInput: number; failed: number; stale: number; errored: number },
  alsoAutomationInterrupted: boolean,
): string {
  const parts: string[] = [];
  if (counts.needsInput > 0) parts.push(`${counts.needsInput} need your input`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.stale > 0) parts.push(`${counts.stale} stale`);
  if (counts.errored > 0) parts.push(`${counts.errored} errored`);
  const head = parts.length > 0
    ? `Review: ${parts.join(', ')}`
    : 'Review requires attention';
  return alsoAutomationInterrupted
    ? `${head} · Automation interrupted`
    : `${head} — open Review tab`;
}

/**
 * Map a canonical PanelPhase (derivePanelStatus's output — see panelStatus.ts)
 * to the card's border/indicator visual category. `stale` has no PanelPhase
 * counterpart by design (panelStatus models the deterministic agent lifecycle
 * with no stuck/stale state) — the card layers its own 5-minute heuristic on top.
 */
type CardVisualState = 'idle' | 'active' | 'attention' | 'complete' | 'error';

// needs_attention gets its own dedicated orange dot elsewhere on the card
// (not the amber attention state) — kept as 'idle' here so it doesn't also
// pick up the attention-only styling (shadow, stop-button eligibility).
const PHASE_TO_VISUAL_STATE: Record<PanelPhase, CardVisualState> = {
  committing: 'active',
  fixing_hooks: 'active',
  implementing: 'active',
  reviewing: 'active',
  addressing: 'active',
  awaiting_input: 'attention',
  implemented: 'complete',
  failed: 'error',
  stopped: 'error',
  paused: 'attention',
  needs_attention: 'idle',
  review_open: 'idle',
  ready: 'idle',
  merged: 'idle',
  idle: 'idle',
};

function getCardVisualState(
  phase: PanelPhase,
  isSessionStale: boolean,
): CardVisualState | 'stale' {
  if (isSessionStale && LIVE_PANEL_PHASES.has(phase)) return 'stale';
  return PHASE_TO_VISUAL_STATE[phase];
}

interface CardPhaseIndicator {
  label: string;
  tone: NextAction['tone'];
  busy?: boolean;
}

/**
 * BoardCard - Individual card within a Kanban column
 *
 * Shows parent breadcrumb, title, external key badge,
 * and agent session status with play/stop controls.
 */
export const BoardCard = memo(function BoardCard({
  item,
  breadcrumb,
  isSelected,
  isFocused,
  searchQuery,
  childCount = 0,
  isExpanded = false,
  onToggleExpand,
  onSelect,
  onSelectRange,
  onEdit,
  onPrepareEdit,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onStartAgent,
  onStopAgent,
  onOpenDetail,
}: BoardCardProps) {
  // Single consolidated selector: re-renders only when this item's derived
  // session state actually changes, not on every store update. Using useShallow
  // lets us return a handful of scalars/refs keyed by item.id so 50 cards don't
  // all re-render when one unrelated session ticks.
  const {
    activeSession,
    activeSessionCount,
    hasOpenableSession,
    prSession,
    agentState,
    latestActivity,
    reviewState,
    latestReviewActivity,
    isMergeBlocked,
    reviewActionable,
    repoSession,
    commitStatus,
    reviewInbox,
    reviewAssessmentRunning,
    completionStats,
    mergeBlockedByNamesKey,
  } = useDevSessionsStore(
    useShallow((state) => {
      const itemSessions = state.sessionsByPlanItemId.get(item.id) ?? [];
      // Prefer a running session, but fall back to one mid-automation: when
      // auto-review (or commit-hook repair / addressing review) is underway the
      // impl session is already `inactive`, yet the card must still surface the
      // phase. Without this fallback `active` is undefined during review and the
      // card goes blank even though the detail pane shows live progress.
      const active =
        itemSessions.find((s) => ACTIVE_SESSION_STATUSES.includes(s.status))
        ?? itemSessions.find((s) => isLiveAutomationPhase(s.automation_phase));
      const sessionWithWorktree =
        active?.worktree_path
          ? active
          : itemSessions.find((s) => OPENABLE_SESSION_STATUSES.includes(s.status) && s.worktree_path);
      const activeCount = itemSessions.filter((s) => ACTIVE_SESSION_STATUSES.includes(s.status)).length;
      const openable = itemSessions.some((s) => OPENABLE_SESSION_STATUSES.includes(s.status));
      const pr = itemSessions
        .filter((s) => s.pr_url)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

      const reviewId = active ? toReviewSessionId(active.id) : undefined;

      let mergeBlocked = false;
      let blockedByNames: string[] = [];
      if (pr?.pr_url && pr.pr_state !== 'MERGED') {
        const entry = state.mergeOrderBySessionId.get(pr.id);
        if (entry && entry.blockedBy.length > 0) {
          blockedByNames = entry.blockedBy
            .map((blockerId) => state.sessionById.get(blockerId))
            .filter((blocker) => blocker && blocker.pr_state !== 'MERGED')
            .map((blocker) => blocker?.plan_item?.title ?? blocker?.name ?? 'Session');
          mergeBlocked = blockedByNames.length > 0;
        }
      }

      let actionableSummary: { hasActionable: boolean; counts: { needsInput: number; failed: number; stale: number; errored: number } } | undefined;
      for (const session of itemSessions) {
        const summary = state.reviewActionableBySessionId.get(session.id);
        if (summary?.hasActionable) {
          actionableSummary = summary;
          break;
        }
      }

      const inbox = active ? state.reviewInboxBySessionId.get(active.id) ?? null : null;
      const assessmentRunning = active
        ? state.reviewAssessmentPendingBySessionId.get(active.id) != null
        : false;

      return {
        activeSession: active,
        activeSessionCount: activeCount,
        hasOpenableSession: openable,
        prSession: pr,
        agentState: active ? state.agentStateBySessionId.get(active.id) : undefined,
        latestActivity: active ? state.latestActivityBySessionId.get(active.id) : undefined,
        reviewState: reviewId ? state.agentStateBySessionId.get(reviewId) : undefined,
        latestReviewActivity: reviewId ? state.latestActivityBySessionId.get(reviewId) : undefined,
        isMergeBlocked: mergeBlocked,
        // Return stable primitives/refs only: useShallow compares one level
        // deep, so a freshly-built array/object here would never compare equal
        // and would re-fire the store subscription every render. The names
        // array and reviewStats object are rebuilt from these in useMemo below.
        mergeBlockedByNamesKey: JSON.stringify(blockedByNames),
        reviewActionable: actionableSummary,
        repoSession: sessionWithWorktree,
        commitStatus: active ? state.commitStateBySessionId.get(active.id)?.status ?? null : null,
        reviewInbox: inbox,
        reviewAssessmentRunning: assessmentRunning,
        completionStats: active ? state.completionBySessionId.get(active.id) : undefined,
      };
    })
  );

  const reviewStats = useMemo(
    () =>
      reviewInbox && activeSession
        ? toReviewPhaseStats(getStats(reviewInbox, activeSession.id), reviewAssessmentRunning)
        : null,
    [reviewInbox, activeSession, reviewAssessmentRunning],
  );
  const mergeBlockedByNames = useMemo(
    () => JSON.parse(mergeBlockedByNamesKey) as string[],
    [mergeBlockedByNamesKey],
  );

  const itemStatus = resolveStatusCategory(item) ?? 'not_started';

  const repoName = repoSession?.repo_name ?? null;
  const automationPhase = activeSession?.automation_phase;
  const reviewSessionId = activeSession ? toReviewSessionId(activeSession.id) : undefined;
  const isReviewVisible =
    reviewState === 'starting'
    || reviewState === 'working'
    || reviewState === 'waiting_for_input'
    || reviewState === 'failed'
    || reviewState === 'stopped';

  const panelStatus = derivePanelStatus({
    implAgentState: agentState,
    reviewAgentState: reviewState,
    automationPhase: automationPhase ?? null,
    pausedReason: activeSession?.paused_reason,
    hasPr: prSession?.pr_number != null,
    prState: prSession?.pr_state ?? null,
    reviewState: prSession?.review_state ?? null,
    itemStatus,
    commitStatus,
    reviewStats,
    // Mirrors usePanelStatus.ts's reviewActive check exactly (starting/working
    // only, narrower than isReviewVisible below) so the "current step" text
    // agrees with the detail panel while the review agent is running.
    latestActivitySummary: (
      reviewState === 'starting' || reviewState === 'working' ? latestReviewActivity : latestActivity
    )?.summary ?? null,
    terminalReason: completionStats?.terminalReason ?? null,
    elapsedMs: null,
    diffStats: completionStats
      ? { files: completionStats.filesChanged, additions: completionStats.additions, deletions: completionStats.deletions }
      : null,
    mergeBlockedBy: mergeBlockedByNames,
  });

  // Card-specific staleness: derivePanelStatus models the deterministic agent
  // lifecycle with no "stuck" state by design (see panelStatus.ts) — the card
  // layers its own 5-minute no-activity heuristic on top for a slow poller tick.
  const effectiveAgentState = isReviewVisible ? reviewState : agentState;
  const effectiveLatestActivity = isReviewVisible ? latestReviewActivity : latestActivity;
  const isSessionStale =
    !!effectiveLatestActivity &&
    effectiveLatestActivity.status !== 'running' &&
    (effectiveAgentState === 'starting' || effectiveAgentState === 'working' || effectiveAgentState === 'waiting_for_input') &&
    Date.now() - effectiveLatestActivity.timestamp > STALE_ACTIVITY_MS;
  const visualState = getCardVisualState(panelStatus.phase, isSessionStale);

  // Two BoardCard-specific overrides ahead of derivePanelStatus's own ladder:
  // 1. needs_attention/reviewActionable must win even if a fresh Play click
  //    left a new run 'starting' while automation_phase hasn't cleared yet —
  //    derivePanelStatus checks live-running states first, which would
  //    otherwise flash "Starting" over an unacknowledged interruption.
  // 2. session.status ('pending' / 'active' with no agentState yet) has no
  //    derivePanelStatus equivalent — it isn't one of panelStatus's inputs —
  //    so a session created moments ago, before any agent-state broadcast
  //    arrives, needs its own label rather than falling through to idle.
  const phaseIndicator: CardPhaseIndicator | null = (() => {
    if (automationPhase === 'needs_attention' || reviewActionable?.hasActionable) {
      return { label: 'Needs attention', tone: 'warning' };
    }
    if (activeSession?.status === 'pending') {
      return { label: 'Pending', tone: 'neutral' };
    }
    if (activeSession?.status === 'active' && !agentState && panelStatus.phase === 'idle') {
      return { label: 'Starting', tone: 'accent', busy: true };
    }
    if (panelStatus.nextAction) {
      return {
        label: panelStatus.nextAction.text,
        tone: panelStatus.nextAction.tone,
        busy: panelStatus.nextAction.busy,
      };
    }
    return null;
  })();

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStartAgent?.(item.id);
  }, [item.id, onStartAgent]);

  const handleOpenDetailClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenDetail?.(item.id);
  }, [item.id, onOpenDetail]);

  const handleStopClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (reviewSessionId && isReviewVisible) {
      onStopAgent?.(reviewSessionId);
      return;
    }
    if (activeSession) {
      onStopAgent?.(activeSession.id);
    }
  }, [activeSession, isReviewVisible, onStopAgent, reviewSessionId]);

  const handleOpenPrClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (prSession?.pr_url) {
      openExternalUrl(prSession.pr_url);
    }
  }, [prSession?.pr_url]);

  // Search match detection
  const isSearchActive = searchQuery.trim().length > 0;
  const titleMatches = isSearchActive && item.title.toLowerCase().includes(searchQuery.toLowerCase());
  const keyMatches = isSearchActive && item.external_key?.toLowerCase().includes(searchQuery.toLowerCase());
  const isMatch = titleMatches || keyMatches;
  const isDimmed = isSearchActive && !isMatch;

  // Border color based on agent state
  const borderClass = (() => {
    if (isSelected) return 'border-accent';
    switch (visualState) {
      case 'active': return 'border-accent/40';
      case 'attention': return 'border-amber-500/60';
      case 'complete': return 'border-emerald-500/40';
      case 'error': return 'border-red-500/30';
      case 'stale': return 'border-amber-500/50';
      case 'idle': return activeSessionCount > 0 ? 'border-emerald-500/40' : 'border-border-subtle';
    }
  })();

  return (
    <div
      data-plan-item-id={item.id}
      draggable
      className={`
        min-w-0 overflow-hidden p-2.5 bg-surface-0 rounded-lg border cursor-grab active:cursor-grabbing
        transition-[border-color,box-shadow,opacity] duration-150 ease-out
        ${borderClass}
        ${isFocused && !isSelected ? 'ring-1 ring-accent/50' : ''}
        ${isDimmed ? 'opacity-40' : ''}
        ${visualState === 'attention' || visualState === 'stale' ? 'shadow-sm shadow-amber-500/10' : ''}
        ${visualState === 'active' ? 'animate-pulse-subtle' : ''}
        hover:shadow-sm ${isSelected ? '' : 'hover:border-border-default'}
        group
      `}
      onClick={(e) => {
        e.stopPropagation();
        if (e.shiftKey && onSelectRange) {
          onSelectRange();
          return;
        }
        onSelect(e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onPrepareEdit?.();
        onEdit();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      onDragStart={(e) => {
        // Chromium/Electron can ignore drags that only carry custom MIME types.
        // Keep a standard payload so native HTML5 drag starts reliably.
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.setData('board-item-id', item.id);
        e.dataTransfer.effectAllowed = 'move';

        const dragImage = document.createElement('div');
        dragImage.className =
          'px-3 py-2 bg-surface-elevated rounded-xl text-sm font-medium text-text-primary max-w-[220px] truncate';
        dragImage.style.cssText = `
          position: absolute;
          top: -1000px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.1);
          border: 1px solid var(--color-border-default);
          transform: rotate(-2deg);
        `;
        dragImage.textContent = item.title;
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 10, 10);
        requestAnimationFrame(() => document.body.removeChild(dragImage));

        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {/* Breadcrumb (parent hierarchy) */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-tiny text-text-muted mb-1.5 overflow-hidden">
          {breadcrumb.map((crumb, index) => (
            <Fragment key={index}>
              {index > 0 && <span className="flex-shrink-0 text-text-muted/50">/</span>}
              <span className="truncate min-w-0" title={crumb.title}>
                {crumb.externalKey || truncateTitle(crumb.title)}
              </span>
            </Fragment>
          ))}
        </div>
      )}

      {/* Title row with indicators */}
      <div className="flex items-start gap-1.5">
        <div className="text-sm font-medium text-text-primary line-clamp-2 min-w-0 flex-1">
          {isSearchActive && titleMatches ? (
            <HighlightedText text={item.title} query={searchQuery} />
          ) : (
            item.title
          )}
        </div>

        {/* Attention indicator (waiting for input) */}
        {visualState === 'attention' && (
          <Tooltip content="Agent needs your attention" side="top">
            <span
              className="flex-shrink-0 mt-1 w-2 h-2 rounded-full bg-amber-500"
              aria-label="Agent needs your attention"
            />
          </Tooltip>
        )}

        {visualState === 'stale' && (
          <Tooltip content="Session state is stale" side="top">
            <span
              className="flex-shrink-0 mt-1 w-2 h-2 rounded-full bg-amber-500"
              aria-label="Session state is stale"
            />
          </Tooltip>
        )}

        {/* Needs attention indicator: automation interrupted OR review items need user action */}
        {(automationPhase === 'needs_attention' || reviewActionable?.hasActionable) && visualState !== 'active' && visualState !== 'attention' && (
          <Tooltip
            content={
              reviewActionable?.hasActionable
                ? buildReviewActionableTooltip(reviewActionable.counts, automationPhase === 'needs_attention')
                : 'Automation interrupted — click Play to continue'
            }
            side="top"
          >
            <span
              className="flex-shrink-0 mt-1 w-2 h-2 rounded-full bg-orange-500"
              aria-label="Needs attention"
            />
          </Tooltip>
        )}

        {/* Active session indicator (legacy green dot) */}
        {visualState === 'idle' && activeSessionCount > 0 && !phaseIndicator && (
          <Tooltip content={activeSessionCount === 1 ? 'Agent running' : `${activeSessionCount} agents running`} side="top">
            <span
              className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500"
              aria-label={activeSessionCount === 1 ? 'Agent running' : `${activeSessionCount} agents running`}
            />
          </Tooltip>
        )}

        {/* Merge blocked indicator — PR open but a dependency hasn't merged yet */}
        {isMergeBlocked && (
          <Tooltip content="Merge blocked — a dependency PR hasn't merged yet" side="top">
            <span
              className="flex-shrink-0 mt-1 w-2 h-2 rounded-full bg-amber-400"
              aria-label="Merge blocked"
            />
          </Tooltip>
        )}
      </div>

      {/* Agent activity line */}
      {(effectiveAgentState || activeSessionCount > 0 || phaseIndicator) && (
        <CardActivityLine
          activity={effectiveLatestActivity}
          agentState={effectiveAgentState}
          isSessionStale={isSessionStale}
          phaseLabel={phaseIndicator?.label}
          phaseTone={phaseIndicator?.tone}
          phaseBusy={phaseIndicator?.busy}
        />
      )}

      {/* Footer: metadata tags + play/stop/edit */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <div className="flex flex-1 min-w-0 items-center gap-2">
          {childCount > 0 && onToggleExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="
                flex-shrink-0 text-tiny px-1.5 py-0.5 rounded
                text-text-muted hover:text-text-secondary hover:bg-surface-2
                transition-colors flex items-center gap-1
              "
            >
              <svg
                className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {childCount} sub
            </button>
          )}

          {(repoName || item.external_key || (prSession?.pr_url && prSession.pr_number != null) || item.external_assignee_name) && (
            <div className="flex min-w-0 items-center gap-1.5 text-tiny text-text-muted">
              {repoName && repoSession && (
                <Tooltip
                  content={
                    <div className="max-w-[280px]">
                      <div>Repository: {repoName}</div>
                      <div className="truncate text-text-tertiary">{repoSession.worktree_path}</div>
                    </div>
                  }
                  side="top"
                >
                  <span
                    className="
                      inline-flex min-w-0 max-w-[120px] shrink items-center gap-1 rounded
                      border border-border-subtle bg-surface-1 px-1.5 py-0.5
                      text-text-tertiary
                    "
                    aria-label={`Repository ${repoName}`}
                  >
                    <svg
                      className="h-3 w-3 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12-6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm0 0v2a4 4 0 0 1-4 4H9"
                      />
                    </svg>
                    <span className="min-w-0 truncate">{repoName}</span>
                  </span>
                </Tooltip>
              )}

              {item.external_key && (
                <Tooltip content={`Open ${item.external_key} in ${trackerLabelFor(item.external_type)}`} side="top">
                  <a
                    href={item.external_url ?? '#'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.external_url) {
                        e.preventDefault();
                        window.open(item.external_url, '_blank');
                      }
                    }}
                    className="flex min-w-0 max-w-[150px] items-center gap-1 hover:text-info transition-colors"
                  >
                    <TrackerIcon trackerType={item.external_type} className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                      {isSearchActive && keyMatches ? (
                        <HighlightedText text={item.external_key} query={searchQuery} />
                      ) : (
                        item.external_key
                      )}
                    </span>
                  </a>
                </Tooltip>
              )}

              {prSession?.pr_url && prSession.pr_number != null && (
                <>
                  {(repoName || item.external_key) && <span className="flex-shrink-0 text-text-tertiary">·</span>}
                  <Tooltip content={`Open PR #${prSession.pr_number}`} side="top">
                    <button
                      onClick={handleOpenPrClick}
                      className="flex flex-shrink-0 items-center gap-1 font-mono hover:text-accent transition-colors"
                      aria-label={`Open PR #${prSession.pr_number}`}
                    >
                      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
                      </svg>
                      #{prSession.pr_number}
                    </button>
                  </Tooltip>
                </>
              )}

              {item.external_assignee_name && (
                <>
                  {(repoName || item.external_key || (prSession?.pr_url && prSession.pr_number != null)) && (
                    <span className="flex-shrink-0 text-text-tertiary">·</span>
                  )}
                  <Tooltip content={`Assigned to ${item.external_assignee_name}`} side="top">
                    <span className="max-w-[140px] truncate text-text-tertiary">
                      {item.external_assignee_name}
                    </span>
                  </Tooltip>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {/* Stop button — visible when agent is active */}
          {(visualState === 'active' || visualState === 'attention') && onStopAgent && (
            <Tooltip content="Stop agent" side="top">
              <button
                onClick={handleStopClick}
                className="p-1 hover:bg-red-500/10 rounded transition-colors"
                aria-label="Stop agent"
              >
                <svg className="w-3 h-3 text-red-400" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            </Tooltip>
          )}

          {!hasOpenableSession && onStartAgent && (
            <Tooltip content="Start agent" side="top">
              <button
                onClick={handlePlayClick}
                className="
                  p-1 hover:bg-accent/10 rounded transition-all duration-150
                  opacity-0 group-hover:opacity-100
                "
                aria-label="Start agent"
              >
                <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.5 2.5a.5.5 0 0 1 .765-.424l8 5a.5.5 0 0 1 0 .848l-8 5A.5.5 0 0 1 4.5 12.5v-10Z" />
                </svg>
              </button>
            </Tooltip>
          )}

          {hasOpenableSession && onOpenDetail && (
            <Tooltip content="Open details" side="top">
              <button
                onClick={handleOpenDetailClick}
                className="
                  p-1 hover:bg-accent/10 rounded transition-all duration-150
                  opacity-0 group-hover:opacity-100
                "
                aria-label="Open details"
              >
                <svg
                  className="w-3.5 h-3.5 text-accent"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M15 3v18" />
                  <path d="m8 9 3 3-3 3" />
                </svg>
              </button>
            </Tooltip>
          )}

          {/* Edit button — appears on hover */}
          <Tooltip content="Edit item" side="top">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrepareEdit?.();
                onEdit();
              }}
              onMouseEnter={onPrepareEdit}
              onFocus={onPrepareEdit}
              className="
                opacity-0 group-hover:opacity-100
                p-1 hover:bg-surface-3 rounded
                transition-all duration-150
              "
              aria-label="Edit item"
            >
              <svg className="w-3 h-3 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

/**
 * Truncate title to a reasonable length for breadcrumb display
 */
function truncateTitle(title: string, maxLength = 18): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 2) + '...';
}
