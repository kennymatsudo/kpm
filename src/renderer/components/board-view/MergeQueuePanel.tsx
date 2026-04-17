/**
 * MergeQueuePanel — shows sessions with open PRs in merge order.
 *
 * Renders a compact horizontal strip between the board header and columns.
 * Drag-to-reorder sets explicit merge_order overrides on each session.
 * Sessions without explicit overrides derive order from the plan dependency graph.
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useDevSessionsStore } from '../../stores/devSessions';
import { updateDevSessionMergeOrder } from '../../services/devSessionService';
import { openExternalUrl } from '../../services/shellService';
import type { DevSessionWithPlanItem } from '../../../shared/types';

interface QueueItem {
  session: DevSessionWithPlanItem;
  layer: number | null;
  blockedBy: string[];
  /** Computed from blockedBy: are any blockers still unmerged? */
  isBlocked: boolean;
}

function prReviewLabel(
  reviewState: string | null,
): { label: string; className: string } | null {
  switch (reviewState) {
    case 'APPROVED':
      return { label: 'Approved', className: 'text-emerald-500 bg-emerald-500/10' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes requested', className: 'text-red-400 bg-red-400/10' };
    case 'REVIEW_REQUIRED':
      return { label: 'Needs review', className: 'text-text-muted bg-surface-2' };
    case null:
    default:
      return null;
  }
}

interface MergeQueuePanelProps {
  onSelectSession: (sessionId: string) => void;
}

export const MergeQueuePanel = memo(function MergeQueuePanel({
  onSelectSession,
}: MergeQueuePanelProps) {
  const sessions = useDevSessionsStore((s) => s.sessions);
  const mergeOrderMap = useDevSessionsStore((s) => s.mergeOrderBySessionId);

  // Sessions with open (non-merged) PRs
  const queueItems = useMemo((): QueueItem[] => {
    const withPrs = sessions.filter(
      (s) => s.pr_url && s.pr_state !== 'MERGED',
    );

    return withPrs
      .map((session): QueueItem => {
        const entry = mergeOrderMap.get(session.id);
        const blockedBy = entry?.blockedBy ?? [];
        const isBlocked = blockedBy.some((blockerId) => {
          const blocker = sessions.find((s) => s.id === blockerId);
          return blocker?.pr_state !== 'MERGED';
        });
        return { session, layer: entry?.layer ?? null, blockedBy, isBlocked };
      })
      .sort((a, b) => {
        // Items with no layer go last
        if (a.layer === null && b.layer === null) return 0;
        if (a.layer === null) return 1;
        if (b.layer === null) return -1;
        return a.layer - b.layer;
      });
  }, [sessions, mergeOrderMap]);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number, sessionId: string) => {
      e.dataTransfer.effectAllowed = 'move';
      setDragIndex(index);
      draggedIdRef.current = sessionId;
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      const sourceIndex = dragIndex;
      setDragIndex(null);
      setDropIndex(null);
      draggedIdRef.current = null;

      if (sourceIndex === null || sourceIndex === targetIndex) return;

      // Reorder the list
      const reordered = [...queueItems];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      // Assign explicit merge_order to every item based on new positions
      await Promise.all(
        reordered.map((item, idx) =>
          updateDevSessionMergeOrder(item.session.id, idx),
        ),
      );
    },
    [dragIndex, queueItems],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
    draggedIdRef.current = null;
  }, []);

  if (queueItems.length === 0) return null;

  return (
    <div className="border-b border-border-subtle bg-surface-1 px-4 py-2">
      <div className="flex items-center gap-3 overflow-x-auto">
        <span className="text-tiny text-text-muted whitespace-nowrap shrink-0">Merge queue</span>

        <div className="flex items-center gap-2 min-w-0">
          {queueItems.map((item, index) => {
            const { session, isBlocked } = item;
            const reviewBadge = prReviewLabel(session.review_state);
            const name = session.plan_item?.title ?? session.name ?? 'Session';
            const isDragging = dragIndex === index;
            const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

            return (
              <div
                key={session.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index, session.id)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => void handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`
                  flex items-center gap-1.5 px-2 py-1 rounded-md
                  border cursor-grab active:cursor-grabbing shrink-0
                  transition-all duration-100 select-none
                  ${isDragging ? 'opacity-40' : 'opacity-100'}
                  ${isDropTarget ? 'border-accent bg-accent/5' : 'border-border-subtle bg-surface-0'}
                  hover:border-border-default
                `}
                title={`${name}${isBlocked ? ' — blocked by dependency' : ''}`}
              >
                {/* Position badge */}
                <span className="text-tiny tabular-nums text-text-muted w-4 text-center shrink-0">
                  {index + 1}
                </span>

                {/* Drag handle */}
                <svg
                  className="w-3 h-3 text-text-muted shrink-0"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="4" r="1.2" />
                  <circle cx="11" cy="4" r="1.2" />
                  <circle cx="5" cy="8" r="1.2" />
                  <circle cx="11" cy="8" r="1.2" />
                  <circle cx="5" cy="12" r="1.2" />
                  <circle cx="11" cy="12" r="1.2" />
                </svg>

                {/* Session name — clicking opens detail pane */}
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="text-tiny text-text-secondary hover:text-text-primary transition-colors max-w-[140px] truncate"
                >
                  {name}
                </button>

                {/* PR link */}
                {session.pr_number != null && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (session.pr_url) openExternalUrl(session.pr_url);
                    }}
                    className="text-tiny font-mono text-accent hover:underline shrink-0"
                    title={`Open PR #${session.pr_number}`}
                  >
                    #{session.pr_number}
                  </button>
                )}

                {/* Status badge */}
                {isBlocked ? (
                  <span className="text-tiny px-1.5 py-0.5 rounded font-medium text-amber-500 bg-amber-500/10 shrink-0">
                    Blocked
                  </span>
                ) : reviewBadge ? (
                  <span className={`text-tiny px-1.5 py-0.5 rounded font-medium shrink-0 ${reviewBadge.className}`}>
                    {reviewBadge.label}
                  </span>
                ) : (
                  <span className="text-tiny px-1.5 py-0.5 rounded text-text-muted bg-surface-2 shrink-0">
                    Open
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
