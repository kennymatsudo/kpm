import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { BoardColumn } from './BoardColumn';
import { DetailPane } from './DetailPane';
import { MergeQueuePanel } from './MergeQueuePanel';
import {
  toast,
  usePlanDomainStore,
  useProjectDomainStore,
} from '../../stores';
import { useDevSessionsStore } from '../../stores/devSessions';
import { stopAgentSession } from '../../services/agentSessionService';
import { getStatusCategory, STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import { subscribe } from '../../stores/storeEvents';
import { OPENABLE_SESSION_STATUSES } from '../../../shared/types';
import type { PlanItem, StatusCategory, DevSessionWithPlanItem } from '../../../shared/types';
import type { RangeSelectHandler } from '../../utils/rangeSelection';
import { getBoardDropDecision } from './dropBehavior';

/**
 * A board tree node: a plan item with children that share the same status column.
 * Children whose status differs from the parent appear as top-level nodes in their own column.
 */
export interface BoardTreeNode {
  item: PlanItem;
  children: BoardTreeNode[];
}

// Columns to display
const VISIBLE_COLUMNS: StatusCategory[] = ['not_started', 'in_progress', 'in_review', 'done'];
const CORE_COLUMNS: StatusCategory[] = ['not_started', 'in_progress', 'in_review', 'done'];
const TOGGLE_COLUMNS: StatusCategory[] = [];

interface BoardViewProps {
  items: PlanItem[];
  allItems: PlanItem[];
  selectedIds: Set<string>;
  focusedItemId: string | null;
  searchQuery: string;
  onSelectItem: (id: string | null, addToSelection?: boolean) => void;
  onSelectRange?: RangeSelectHandler;
  onEditItem: (id: string) => void;
  onPrepareEditItem?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, ids: Set<string>) => void;
  /** Callback for creating a new item with a given status */
  onCreateItem?: (status: StatusCategory) => void;
  /** Callback when user wants to start an agent on an item */
  onStartAgent?: (itemId: string) => void;
  detailSessionId: string | null;
  onDetailSessionChange: (sessionId: string | null) => void;
}

/**
 * BoardView - Kanban-style board view for plan items
 *
 * Design: Horizontal columns for each status category, drag-and-drop to change status.
 */
export const BoardView = memo(function BoardView({
  items,
  allItems,
  selectedIds,
  focusedItemId,
  searchQuery,
  onSelectItem,
  onSelectRange,
  onEditItem,
  onPrepareEditItem,
  onContextMenu,
  onCreateItem,
  onStartAgent: onStartAgentProp,
  detailSessionId,
  onDetailSessionChange,
}: BoardViewProps) {
  const updateStatusCategory = usePlanDomainStore((state) => state.updateStatusCategory);
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);


  const boardRef = useRef<HTMLDivElement>(null);

  // Merge queue panel visibility — auto-show when PRs first appear
  const [showMergeQueue, setShowMergeQueue] = useState(false);
  useEffect(() => {

  // Column visibility - persisted per project
  const [columnVisibility, setColumnVisibility] = useState<Record<StatusCategory, boolean>>(() => {
    if (!currentProjectId) {
      return { not_started: true, in_progress: true, in_review: true, done: true, blocked: true, canceled: false };
    }
    const saved = localStorage.getItem(`kpm-board-columns-${currentProjectId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Invalid JSON, use defaults
      }
    }
    return { not_started: true, in_progress: true, in_review: true, done: true, blocked: true, canceled: false };
  });

  // Update column visibility when project changes
  useEffect(() => {
    if (!currentProjectId) return;
    const saved = localStorage.getItem(`kpm-board-columns-${currentProjectId}`);
    if (saved) {
      try {
        setColumnVisibility(JSON.parse(saved));
        return;
      } catch {
        // Invalid JSON, use defaults
      }
    }
    setColumnVisibility({ not_started: true, in_progress: true, in_review: true, done: true, blocked: true, canceled: false });
  }, [currentProjectId]);

  // Listen for reveal-board-column events (from global search)
  useEffect(() => {
    const unsubscribe = subscribe('reveal-board-column', (event) => {
      const { status } = event.payload;
      setColumnVisibility((prev) => {
        if (prev[status]) return prev;
        const next = { ...prev, [status]: true };
        if (currentProjectId) {
          localStorage.setItem(`kpm-board-columns-${currentProjectId}`, JSON.stringify(next));
        }
        return next;
      });
    });
    return unsubscribe;
  }, [currentProjectId]);

  // Persist column visibility changes
  const toggleColumn = useCallback(
    (status: StatusCategory) => {
      setColumnVisibility((prev) => {
        const next = { ...prev, [status]: !prev[status] };
        if (currentProjectId) {
          localStorage.setItem(`kpm-board-columns-${currentProjectId}`, JSON.stringify(next));
        }
        return next;
      });
    },
    [currentProjectId]
  );

  // Drag state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // Build parent map for breadcrumb lookups
  const parentMap = useMemo(() => {
    const map = new Map<string, PlanItem>();
    for (const item of allItems) {
      map.set(item.id, item);
    }
    return map;
  }, [allItems]);

  // Resolve effective status for an item
  const getEffectiveStatus = useCallback(
    (item: PlanItem): StatusCategory =>
      item.status_category ?? getStatusCategory(item.external_status, item.external_type) ?? 'not_started',
    []
  );

  // Group items by status_category, building a tree within each column
  const itemsByStatus = useMemo(() => {
    // First pass: bucket every item by its status
    const flatGroups: Record<StatusCategory, PlanItem[]> = {
      not_started: [],
      in_progress: [],
      in_review: [],
      done: [],
      blocked: [],
      canceled: [],
    };

    const statusOf = new Map<string, StatusCategory>();

    for (const item of items) {
      const status = getEffectiveStatus(item);
      statusOf.set(item.id, status);
      if (status in flatGroups) {
        flatGroups[status].push(item);
      }
    }

    // Second pass: build column-local trees
    // An item is nested under its parent only when both share the same column.
    const treeGroups: Record<StatusCategory, BoardTreeNode[]> = {
      not_started: [],
      in_progress: [],
      in_review: [],
      done: [],
      blocked: [],
      canceled: [],
    };

    for (const status of Object.keys(flatGroups) as StatusCategory[]) {
      const columnItems = flatGroups[status];
      const columnIds = new Set(columnItems.map((i) => i.id));

      // Create nodes
      const nodeMap = new Map<string, BoardTreeNode>();
      for (const item of columnItems) {
        nodeMap.set(item.id, { item, children: [] });
      }

      const roots: BoardTreeNode[] = [];

      for (const item of columnItems) {
        const node = nodeMap.get(item.id)!;
        // Nest under parent only if the parent is in the same column
        if (item.parent_id && columnIds.has(item.parent_id)) {
          nodeMap.get(item.parent_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      // Sort roots and children by item_order
      const sortNodes = (nodes: BoardTreeNode[]) => {
        nodes.sort((a, b) => a.item.item_order - b.item.item_order);
        for (const n of nodes) sortNodes(n.children);
      };
      sortNodes(roots);

      treeGroups[status] = roots;
    }

    return treeGroups;
  }, [items, getEffectiveStatus]);

  // Count items in toggle columns (for showing count even when hidden)
  const toggleColumnCounts = useMemo(() => {
    return {};
  }, []);

  // Agent start handler - delegates to parent
  const handleStartAgent = useCallback((itemId: string) => {
    onStartAgentProp?.(itemId);
  }, [onStartAgentProp]);

  // Agent stop handler
  const handleStopAgent = useCallback(async (devSessionId: string) => {
    await stopAgentSession(devSessionId);
  }, []);

  // Handle drop - update status category with agent lifecycle awareness
  const handleDrop = useCallback(
    (itemId: string, newStatus: StatusCategory) => {
      const item = allItems.find((candidate) => candidate.id === itemId);
      if (!item) {
        setDraggedItemId(null);
        return;
      }

      const previousStatus =
        item.status_category ?? getStatusCategory(item.external_status, item.external_type) ?? 'not_started';
        (s) => s.plan_item_id === itemId && ['pending', 'active'].includes(s.status)
      );
      const decision = getBoardDropDecision(previousStatus, newStatus, !!activeSession);

      if (decision.action === 'noop') {
        setDraggedItemId(null);
        return;
      }

      if (decision.action === 'start_agent') {
        setDraggedItemId(null);
        handleStartAgent(itemId);
        return;
      }

      if (decision.stopActiveSession && activeSession) {
        void stopAgentSession(activeSession.id);
      }

      void updateStatusCategory(itemId, newStatus);
      setDraggedItemId(null);

      toast.info(`Moved "${item.title}" to ${STATUS_CATEGORY_CONFIG[newStatus].label}`, {
        label: 'Undo',
        onClick: () => {
          void updateStatusCategory(itemId, previousStatus);
        },
      });
    },
  );

  const handleSelectQueueSession = useCallback((sessionId: string) => {
    onDetailSessionChange(sessionId);

  const handleDragStart = useCallback((itemId: string) => {
    setDraggedItemId(itemId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItemId(null);
  }, []);

  const handleOpenDetail = useCallback((itemId: string) => {
      (s) => s.plan_item_id === itemId && OPENABLE_SESSION_STATUSES.includes(s.status)
    );
    onDetailSessionChange(session?.id ?? null);

  // Close the detail pane when the underlying session disappears (e.g. archived).
  useEffect(() => {
    if (!detailSessionId) return;
      onDetailSessionChange(null);
    }

  // Determine which columns to show
  const visibleColumns = useMemo(() => {
    return VISIBLE_COLUMNS.filter((status) => {
      if (CORE_COLUMNS.includes(status)) return true;
      return columnVisibility[status];
    });
  }, [columnVisibility]);

  return (
    <div
      ref={boardRef}
    >
      <div className="flex-1 flex flex-col min-w-0">
      {/* Header with column toggles */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-surface-0">
        <span className="text-xs font-mono text-text-tertiary">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </span>

        <div className="ml-auto flex items-center gap-1">
          {/* Merge queue toggle — only shown when there are open PRs */}
            <button
              onClick={() => setShowMergeQueue((v) => !v)}
              className={`
                flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors
                ${showMergeQueue ? 'bg-surface-3 text-text-secondary' : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'}
              `}
              title={showMergeQueue ? 'Hide merge queue' : 'Show merge queue'}
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z" />
              </svg>
              Merge queue
              <span className="tabular-nums opacity-75">({openPrCount})</span>
            </button>
          )}

          {TOGGLE_COLUMNS.map((status) => {
            const config = STATUS_CATEGORY_CONFIG[status];
            const count = toggleColumnCounts[status as keyof typeof toggleColumnCounts];
            const isVisible = columnVisibility[status];

            return (
              <button
                key={status}
                onClick={() => toggleColumn(status)}
                className={`
                  flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors
                  ${isVisible ? 'bg-surface-3 text-text-secondary' : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'}
                `}
                title={`${isVisible ? 'Hide' : 'Show'} ${config.label} column`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.bgClass}`} />
                {config.label}
                {count > 0 && (
                  <span className="text-tiny tabular-nums opacity-60">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Merge queue panel — between header and columns */}
        <MergeQueuePanel onSelectSession={handleSelectQueueSession} />
      )}

      {/* Columns container - horizontal scroll if needed */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto min-w-0">
        {visibleColumns.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            treeNodes={itemsByStatus[status]}
            parentMap={parentMap}
            selectedIds={selectedIds}
            focusedItemId={focusedItemId}
            searchQuery={searchQuery}
            draggedItemId={draggedItemId}
            onSelectRange={onSelectRange}
            onEditItem={onEditItem}
            onPrepareEditItem={onPrepareEditItem}
            onContextMenu={onContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onCreateItem={onCreateItem}
            onStartAgent={handleStartAgent}
            onStopAgent={handleStopAgent}
            onOpenDetail={handleOpenDetail}
          />
        ))}
      </div>

      </div>

      {detailSession && (
      )}

    </div>
  );
});
