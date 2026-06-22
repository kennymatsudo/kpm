import { memo, Fragment, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { HighlightedText } from '../planning/HighlightedText';
import { useDevSessionsStore } from '../../stores/devSessions';
import { CardActivityLine } from './CardActivityLine';
import type { PlanItem, AgentSessionState } from '../../../shared/types';
import { toReviewSessionId } from '../../../shared/agent-types';
import { openExternalUrl } from '../../services/shellService';
import { TrackerIcon, trackerLabelFor } from '../tracker/shared/trackerDisplay';
import { Tooltip } from '../ui';

const STALE_ACTIVITY_MS = 5 * 60 * 1000;

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

/** Map agent states to visual categories for border/indicator styling */
function getAgentVisualState(
  agentState: AgentSessionState | undefined,
  isSessionStale: boolean,
): 'idle' | 'active' | 'attention' | 'complete' | 'error' | 'stale' {
  if (!agentState) return 'idle';
  if (isSessionStale && (agentState === 'starting' || agentState === 'working' || agentState === 'waiting_for_input')) {
    return 'stale';
  }
  switch (agentState) {
    case 'starting':
    case 'working':
      return 'active';
    case 'waiting_for_input':
      return 'attention';
    case 'complete':
      return 'complete';
    case 'failed':
    case 'stopped':
      return 'error';
    default:
      return 'idle';
  }
}

function isLiveAgentState(state: AgentSessionState | undefined): boolean {
  return state === 'starting' || state === 'working' || state === 'waiting_for_input';
}

type CardPhaseTone = 'neutral' | 'accent' | 'info' | 'warning' | 'danger' | 'success';

interface CardPhaseIndicator {
  label: string;
  tone: CardPhaseTone;
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
  } = useDevSessionsStore(
    useShallow((state) => {
      const itemSessions = state.sessionsByPlanItemId.get(item.id) ?? [];
      const activeCount = itemSessions.filter((s) => ACTIVE_SESSION_STATUSES.includes(s.status)).length;
      const openable = itemSessions.some((s) => OPENABLE_SESSION_STATUSES.includes(s.status));
      const pr = itemSessions
        .filter((s) => s.pr_url)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

      const reviewId = active ? toReviewSessionId(active.id) : undefined;

      let mergeBlocked = false;
      if (pr?.pr_url && pr.pr_state !== 'MERGED') {
        const entry = state.mergeOrderBySessionId.get(pr.id);
        if (entry && entry.blockedBy.length > 0) {
          mergeBlocked = entry.blockedBy.some((blockerId) => {
            const blocker = state.sessionById.get(blockerId);
            return blocker?.pr_state !== 'MERGED';
          });
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
        reviewActionable: actionableSummary,
      };
    })
  );

  const automationPhase = activeSession?.automation_phase;
  const reviewSessionId = activeSession ? toReviewSessionId(activeSession.id) : undefined;
  const isReviewVisible =
    reviewState === 'starting'
    || reviewState === 'working'
    || reviewState === 'waiting_for_input'
    || reviewState === 'failed'
    || reviewState === 'stopped';
  const effectiveAgentState = isReviewVisible ? reviewState : agentState;
  const effectiveLatestActivity = isReviewVisible ? latestReviewActivity : latestActivity;
  const isSessionStale =
    !!effectiveLatestActivity &&
    effectiveLatestActivity.status !== 'running' &&
    isLiveAgentState(effectiveAgentState) &&
    Date.now() - effectiveLatestActivity.timestamp > STALE_ACTIVITY_MS;
  const visualState = getAgentVisualState(effectiveAgentState, isSessionStale);
  const phaseIndicator: CardPhaseIndicator | null = (() => {
    if (automationPhase === 'needs_attention' || reviewActionable?.hasActionable) {
      return { label: 'Needs attention', tone: 'warning' };
    }
    if (isSessionStale) {
      return { label: 'Stale', tone: 'warning' };
    }
    if (effectiveAgentState === 'waiting_for_input') {
      return { label: 'Needs input', tone: 'warning' };
    }
    if (isReviewVisible || automationPhase === 'reviewing') {
      if (reviewState === 'failed') {
        return { label: 'Review failed', tone: 'danger' };
      }
      if (reviewState === 'stopped') {
        return { label: 'Review stopped', tone: 'neutral' };
      }
      return { label: 'Reviewing', tone: 'info', busy: true };
    }
    if (isCommitHookRepairPhase(automationPhase)) {
      return { label: 'Fixing checks', tone: 'warning', busy: isLiveAgentState(agentState) };
    }
    if (automationPhase === 'addressing_review') {
      return { label: 'Addressing review', tone: 'accent', busy: isLiveAgentState(agentState) };
    }
    if (activeSession?.status === 'pending') {
      return { label: 'Pending', tone: 'neutral' };
    }
    if (agentState === 'starting') {
      return { label: 'Starting', tone: 'accent', busy: true };
    }
    if (agentState === 'working') {
      return { label: 'Building', tone: 'accent', busy: true };
    }
    if (activeSession?.status === 'active' && !agentState) {
      return { label: 'Starting', tone: 'accent', busy: true };
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
