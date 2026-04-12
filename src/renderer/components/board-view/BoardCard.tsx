import { HighlightedText } from '../planning/HighlightedText';
import { CardActivityLine } from './CardActivityLine';
import type { PlanItem, AgentSessionState } from '../../../shared/types';
import { toReviewSessionId } from '../../../shared/agent-types';
import { openExternalUrl } from '../../services/shellService';

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
  onEdit: () => void;
  onPrepareEdit?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStartAgent?: (itemId: string) => void;
  onStopAgent?: (devSessionId: string) => void;
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
  onEdit,
  onPrepareEdit,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onStartAgent,
  onStopAgent,
}: BoardCardProps) {




  const automationPhase = activeSession?.automation_phase;
  const reviewSessionId = activeSession ? toReviewSessionId(activeSession.id) : undefined;
  const isReviewVisible =
    reviewState === 'starting'
    || reviewState === 'working'
    || reviewState === 'waiting_for_input'
    || reviewState === 'failed'
    || reviewState === 'stopped';
  const effectiveAgentState = isReviewVisible ? reviewState : agentState;
  const isSessionStale =
    !!effectiveLatestActivity &&
    Date.now() - effectiveLatestActivity.timestamp > STALE_ACTIVITY_MS;
  const visualState = getAgentVisualState(effectiveAgentState, isSessionStale);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStartAgent?.(item.id);
  }, [item.id, onStartAgent]);

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
        ${borderClass}
        ${isFocused && !isSelected ? 'ring-1 ring-accent/50' : ''}
        ${isDimmed ? 'opacity-40' : ''}
        ${visualState === 'attention' || visualState === 'stale' ? 'shadow-sm shadow-amber-500/10' : ''}
        ${visualState === 'active' ? 'animate-pulse-subtle' : ''}
        group
      `}
      onClick={(e) => {
        e.stopPropagation();
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
        )}

        {visualState === 'stale' && (
        )}

        )}

        {/* Active session indicator (legacy green dot) */}
        )}

        {/* Merge blocked indicator — PR open but a dependency hasn't merged yet */}
        {isMergeBlocked && (
        )}
      </div>

      {/* Agent activity line */}
        <CardActivityLine
          activity={effectiveLatestActivity}
          agentState={effectiveAgentState}
          isSessionStale={isSessionStale}
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
          )}

            <button
              className="
                opacity-0 group-hover:opacity-100
              "
            >
              </svg>
            </button>
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
