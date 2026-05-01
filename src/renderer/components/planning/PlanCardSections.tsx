import type { MouseEvent } from 'react';
import type { StatusCategory, TrackerType } from '../../../shared/types';
import type { TreeNode } from '../../utils/planHierarchy';
import { StatusSelector } from '../ui/StatusSelector';
import { Tooltip } from '../ui/Tooltip';
import { HighlightedText } from './HighlightedText';
import type { MenuPosition } from './PlanCardMenu';

type WorktreeLoadingOperation = string | null;

export function getPlanCardMenuPositionForPoint(x: number, y: number): MenuPosition {
  const menuHeight = 350;
  const spaceBelow = window.innerHeight - y;
  const spaceAbove = y;

  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    return {
      type: 'card',
      bottom: window.innerHeight - y + 4,
      right: window.innerWidth - x,
    };
  }

  return {
    type: 'card',
    top: y + 4,
    right: window.innerWidth - x,
  };
}

export function getPlanCardMenuPositionForRect(rect: DOMRect): MenuPosition {
  const menuHeight = 350;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    return {
      type: 'card',
      bottom: window.innerHeight - rect.top + 4,
      right: window.innerWidth - rect.right,
    };
  }

  return {
    type: 'card',
    top: rect.bottom + 4,
    right: window.innerWidth - rect.right,
  };
}

export function getWorktreeLoadingTitle(operation: WorktreeLoadingOperation): string {
  if (operation === 'launch') return 'Starting agent...';
  if (operation === 'resume') return 'Resuming session...';
  if (operation === 'openEditor') return 'Opening editor...';
  if (operation === 'delete') return 'Removing...';
  return 'Loading...';
}

interface PlanCardHeaderProps {
  item: TreeNode;
  titleSizeClass: string;
  isPreview: boolean;
  isSearchActive: boolean;
  directMatch: boolean;
  searchQuery: string;
  hasActiveDevSession: boolean;
  isWorktreeLoading: boolean;
  worktreeLoadingOp: WorktreeLoadingOperation;
  showMenu: boolean;
  onEdit?: () => void;
  onPrepareEdit?: () => void;
  onToggleMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function PlanCardHeader({
  item,
  titleSizeClass,
  isPreview,
  isSearchActive,
  directMatch,
  searchQuery,
  hasActiveDevSession,
  isWorktreeLoading,
  worktreeLoadingOp,
  showMenu,
  onEdit,
  onPrepareEdit,
  onToggleMenu,
}: PlanCardHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <h3 className={`${titleSizeClass} font-medium text-text-primary min-w-0 truncate flex-1`}>
        {isSearchActive && directMatch ? (
          <HighlightedText text={item.title} query={searchQuery} />
        ) : (
          item.title
        )}
      </h3>
      {hasActiveDevSession && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" title="Agent running" />
      )}
      {item.children.length > 0 && (
        <span className="flex-shrink-0 text-tiny text-text-muted">
          ({item.children.length})
        </span>
      )}
      {isWorktreeLoading && (
        <div className="flex-shrink-0 flex items-center gap-1" title={getWorktreeLoadingTitle(worktreeLoadingOp)}>
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        </div>
      )}
      {!isPreview && (
        <Tooltip content="Edit (E or double-click)" side="top">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.();
            }}
            onMouseEnter={() => onPrepareEdit?.()}
            onFocus={() => onPrepareEdit?.()}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-3 rounded ml-auto transition-all duration-150"
            aria-label="Edit item"
          >
            <svg className="w-3 h-3 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </Tooltip>
      )}
      {!isPreview && (
        <Tooltip content="More actions" side="top">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu?.(event);
            }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-3 rounded transition-all duration-150"
            aria-label="More actions"
            aria-expanded={showMenu}
            aria-haspopup="menu"
          >
            <svg className="w-3 h-3 text-text-tertiary" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface PlanCardMetadataRowProps {
  item: TreeNode;
  isPreview: boolean;
  isSearchActive: boolean;
  directMatch: boolean;
  searchQuery: string;
  effectiveStatus: StatusCategory | null;
  isQueued: boolean;
  activeTrackerType: TrackerType | null;
  onStatusChange: (status: StatusCategory) => void;
}

export function PlanCardMetadataRow({
  item,
  isPreview,
  isSearchActive,
  directMatch,
  searchQuery,
  effectiveStatus,
  isQueued,
  activeTrackerType,
  onStatusChange,
}: PlanCardMetadataRowProps) {
  const itemTrackerType = item.external_type ?? activeTrackerType;
  const trackerLabel = trackerLabelFor(itemTrackerType);

  return (
    <div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
      {isPreview ? (
        effectiveStatus && (
          <div className="flex-shrink-0">
            <StatusSelector
              value={effectiveStatus}
              onChange={() => {}}
              disabled
              size="sm"
            />
          </div>
        )
      ) : (
        <div onClick={(event) => event.stopPropagation()} className="flex-shrink-0">
          <StatusSelector
            value={effectiveStatus}
            onChange={onStatusChange}
            size="sm"
          />
        </div>
      )}

      {item.external_key && item.external_url && (
        isPreview ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-tiny font-medium bg-info-muted text-info rounded max-w-[100px]">
            <TrackerIcon trackerType={itemTrackerType} className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{item.external_key}</span>
          </span>
        ) : (
          <a
            href={item.external_url}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              window.open(item.external_url!, '_blank');
            }}
            className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-tiny font-medium rounded transition-colors max-w-[100px] bg-info-muted text-info hover:bg-info-muted"
            title={`Open ${item.external_key} in ${trackerLabel}`}
          >
            <TrackerIcon trackerType={itemTrackerType} className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {isSearchActive && directMatch ? (
                <HighlightedText text={item.external_key} query={searchQuery} />
              ) : (
                item.external_key
              )}
            </span>
            {isQueued && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" title="Queued for export" />
            )}
          </a>
        )
      )}

      {!item.external_key && isQueued && (
        <span
          className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-tiny font-medium bg-accent/15 text-accent rounded"
          title={`Queued for creation in ${trackerLabel}`}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </span>
      )}
    </div>
  );
}
