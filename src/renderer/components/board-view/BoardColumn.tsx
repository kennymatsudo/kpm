import { memo, useCallback, useMemo, useState } from 'react';
import { BoardCard, type Breadcrumb } from './BoardCard';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import { useLatestRef } from '../../hooks/useLatestRef';
import type { BoardTreeNode } from './BoardView';
import type { PlanItem, StatusCategory } from '../../../shared/types';
import type { OrderedIdsGetter, RangeSelectHandler } from '../../utils/rangeSelection';

function getVisibleBoardSelectionOrder(
  nodes: readonly BoardTreeNode[],
  expandedIds: ReadonlySet<string>,
): string[] {
  const orderedIds: string[] = [];

  const walk = (currentNodes: readonly BoardTreeNode[]) => {
    for (const node of currentNodes) {
      orderedIds.push(node.item.id);
      if (expandedIds.has(node.item.id) && node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return orderedIds;
}

interface BoardColumnProps {
  status: StatusCategory;
  treeNodes: BoardTreeNode[];
  parentMap: Map<string, PlanItem>;
  selectedIds: Set<string>;
  focusedItemId: string | null;
  searchQuery: string;
  draggedItemId: string | null;
  onSelectItem: (id: string | null, addToSelection?: boolean) => void;
  onSelectRange?: RangeSelectHandler;
  onEditItem: (id: string) => void;
  onPrepareEditItem?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, ids: Set<string>) => void;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDrop: (itemId: string, newStatus: StatusCategory) => void;
  onCreateItem?: (status: StatusCategory) => void;
  onStartAgent?: (itemId: string) => void;
  onStopAgent?: (devSessionId: string) => void;
  onOpenDetail?: (itemId: string) => void;
}

/**
 * BoardColumn - Single column representing a status category
 *
 * Design: Rounded container with colored header dot, scrollable cards area.
 * Handles drag-and-drop for status changes.
 */
export const BoardColumn = memo(function BoardColumn({
  status,
  treeNodes,
  parentMap,
  selectedIds,
  focusedItemId,
  searchQuery,
  draggedItemId,
  onSelectItem,
  onSelectRange,
  onEditItem,
  onPrepareEditItem,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDrop,
  onCreateItem,
  onStartAgent,
  onStopAgent,
  onOpenDetail,
}: BoardColumnProps) {
  const config = STATUS_CATEGORY_CONFIG[status];
  const [isDragOver, setIsDragOver] = useState(false);

  // Track which parent nodes are expanded (default: collapsed)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const treeNodesRef = useLatestRef(treeNodes);
  const expandedIdsRef = useLatestRef(expandedIds);
  const getOrderedColumnIds = useCallback(
    () => getVisibleBoardSelectionOrder(treeNodesRef.current, expandedIdsRef.current),
    [expandedIdsRef, treeNodesRef],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Count total items (including nested children) for the column header
  const totalItemCount = useMemo(() => {
    const count = (nodes: BoardTreeNode[]): number =>
      nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    return count(treeNodes);
  }, [treeNodes]);

  // Build breadcrumb for an item (walks up parent chain outside this column)
  const buildBreadcrumb = useCallback(
    (item: PlanItem): Breadcrumb[] => {
      const chain: Breadcrumb[] = [];
      let currentId = item.parent_id;

      while (currentId && chain.length < 3) {
        const parent = parentMap.get(currentId);
        if (!parent) break;
        chain.unshift({
          title: parent.title,
          externalKey: parent.external_key ?? undefined,
        });
        currentId = parent.parent_id;
      }

      return chain;
    },
    [parentMap]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set to false if we're leaving the column entirely
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const itemId = e.dataTransfer.getData('board-item-id');
      if (itemId) {
        onDrop(itemId, status);
      }
    },
    [status, onDrop]
  );

  const handleCardContextMenu = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      // If item not selected, select it first
      if (!selectedIds.has(itemId)) {
        onSelectItem(itemId, false);
      }
      const newSelection = selectedIds.has(itemId) ? selectedIds : new Set([itemId]);
      onContextMenu(e, newSelection);
    },
    [selectedIds, onSelectItem, onContextMenu]
  );

  // Click on empty area clears selection
  const handleColumnClick = useCallback(
    (e: React.MouseEvent) => {
      // Only clear if clicking directly on the column, not on a card
      if (e.target === e.currentTarget) {
        onSelectItem(null);
      }
    },
    [onSelectItem]
  );

  return (
    <div
      className={`
        transition-[background-color,box-shadow] duration-150
        ${isDragOver && draggedItemId ? 'ring-2 ring-accent ring-inset bg-accent/5' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`w-2 h-2 rounded-full ${config.bgClass}`} />
        <span className="text-xs font-medium text-text-primary">{config.label}</span>
        <span className="text-[11px] font-mono text-text-tertiary ml-auto tabular-nums">{totalItemCount}</span>
      </div>

      {/* Scrollable cards container */}
      <div
        onClick={handleColumnClick}
      >
        {treeNodes.map((node) => (
          <BoardTreeNodeRenderer
            key={node.item.id}
            node={node}
            depth={0}
            breadcrumb={buildBreadcrumb(node.item)}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            selectedIds={selectedIds}
            focusedItemId={focusedItemId}
            searchQuery={searchQuery}
            onSelectItem={onSelectItem}
            onSelectRange={onSelectRange}
            getOrderedIds={getOrderedColumnIds}
            onEditItem={onEditItem}
            onPrepareEditItem={onPrepareEditItem}
            onContextMenu={handleCardContextMenu}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onStartAgent={onStartAgent}
            onStopAgent={onStopAgent}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {/* Add card button */}
        {onCreateItem && (
          <button
            onClick={() => onCreateItem(status)}
            className="w-full mt-1 px-3 py-2 text-left text-sm text-text-muted hover:text-text-secondary
                       hover:bg-surface-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add card
          </button>
        )}
      </div>
    </div>
  );
});

// --- Recursive tree node renderer ---

interface BoardTreeNodeRendererProps {
  node: BoardTreeNode;
  depth: number;
  breadcrumb: Breadcrumb[];
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  selectedIds: Set<string>;
  focusedItemId: string | null;
  searchQuery: string;
  onSelectItem: (id: string | null, addToSelection?: boolean) => void;
  onSelectRange?: RangeSelectHandler;
  getOrderedIds?: OrderedIdsGetter;
  onEditItem: (id: string) => void;
  onPrepareEditItem?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, itemId: string) => void;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onStartAgent?: (itemId: string) => void;
  onStopAgent?: (devSessionId: string) => void;
  onOpenDetail?: (itemId: string) => void;
}

const BoardTreeNodeRenderer = memo(function BoardTreeNodeRenderer({
  node,
  depth,
  breadcrumb,
  expandedIds,
  toggleExpanded,
  selectedIds,
  focusedItemId,
  searchQuery,
  onSelectItem,
  onSelectRange,
  getOrderedIds,
  onEditItem,
  onPrepareEditItem,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onStartAgent,
  onStopAgent,
  onOpenDetail,
}: BoardTreeNodeRendererProps) {
  const { item, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(item.id);

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-border-subtle pl-1.5' : ''}>
      <BoardCard
        item={item}
        breadcrumb={breadcrumb}
        isSelected={selectedIds.has(item.id)}
        isFocused={focusedItemId === item.id}
        searchQuery={searchQuery}
        childCount={children.length}
        isExpanded={isExpanded}
        onToggleExpand={hasChildren ? () => toggleExpanded(item.id) : undefined}
        onSelect={(addToSelection) => onSelectItem(item.id, addToSelection)}
        onSelectRange={
          onSelectRange && getOrderedIds
            ? () => onSelectRange(item.id, getOrderedIds())
            : undefined
        }
        onEdit={() => onEditItem(item.id)}
        onPrepareEdit={() => onPrepareEditItem?.(item.id)}
        onContextMenu={(e) => onContextMenu(e, item.id)}
        onDragStart={() => onDragStart(item.id)}
        onDragEnd={onDragEnd}
        onStartAgent={onStartAgent}
        onStopAgent={onStopAgent}
        onOpenDetail={onOpenDetail}
      />
      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <BoardTreeNodeRenderer
              key={child.item.id}
              node={child}
              depth={depth + 1}
              breadcrumb={[]} // Children nested in-column don't need breadcrumbs
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              selectedIds={selectedIds}
              focusedItemId={focusedItemId}
              searchQuery={searchQuery}
              onSelectItem={onSelectItem}
              onSelectRange={onSelectRange}
              getOrderedIds={getOrderedIds}
              onEditItem={onEditItem}
              onPrepareEditItem={onPrepareEditItem}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onStartAgent={onStartAgent}
              onStopAgent={onStopAgent}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
});
