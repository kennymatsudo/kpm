import { useState, useMemo, memo, useEffect, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useProjectDomainStore,
  usePlanDomainStore,
  useResourceDomainStore,
  toast,
} from '../../stores';
import { useDevSessionsStore } from '../../stores/devSessions';
import { useExportActions } from '../../hooks/useStoreActions';
import type { TreeNode } from '../../utils/planHierarchy';
import { getStyleForDepth, MAX_DEPTH } from '../../constants/planCardStyles';
import { DragSource } from '../../constants/dragSource';
import { DeleteConfirmDialog } from '../ui/DeleteConfirmDialog';
import { getStatusCategory } from '../../constants/statusConfig';
import { isPerfLoggingEnabled, logPerfEvent } from '../../utils/perfLogger';
import { PlanCardMenu, type MenuPosition } from './PlanCardMenu';
import {
  getPlanCardMenuPositionForPoint,
  getPlanCardMenuPositionForRect,
  PlanCardHeader,
  PlanCardMetadataRow,
} from './PlanCardSections';

// Hoisted constant for active session status check (avoids array recreation in selector)
const ACTIVE_SESSION_STATUSES = ['pending', 'active'] as const;
const PLAN_CARD_PERF_FLUSH_MS = 250;

interface PlanCardPerfCounters {
  projectId: string | null;
  rootRenders: number;
  nestedRenders: number;
  rootMounts: number;
  nestedMounts: number;
  depth0Renders: number;
  depth1Renders: number;
  depth2Renders: number;
  depth3PlusRenders: number;
  depth0Mounts: number;
  depth1Mounts: number;
  depth2Mounts: number;
  depth3PlusMounts: number;
}

let pendingPlanCardPerf: PlanCardPerfCounters | null = null;
let planCardPerfTimer: ReturnType<typeof setTimeout> | null = null;

function getDepthBucket(depth: number): 'depth0' | 'depth1' | 'depth2' | 'depth3Plus' {
  if (depth <= 0) return 'depth0';
  if (depth === 1) return 'depth1';
  if (depth === 2) return 'depth2';
  return 'depth3Plus';
}

function schedulePlanCardPerfFlush(): void {
  if (planCardPerfTimer !== null) return;
  planCardPerfTimer = setTimeout(() => {
    planCardPerfTimer = null;
    const counters = pendingPlanCardPerf;
    pendingPlanCardPerf = null;
    if (!counters) return;

    logPerfEvent('plan.canvas.card_commit_batch', {
      projectId: counters.projectId,
      rootRenders: counters.rootRenders,
      nestedRenders: counters.nestedRenders,
      rootMounts: counters.rootMounts,
      nestedMounts: counters.nestedMounts,
      depth0Renders: counters.depth0Renders,
      depth1Renders: counters.depth1Renders,
      depth2Renders: counters.depth2Renders,
      depth3PlusRenders: counters.depth3PlusRenders,
      depth0Mounts: counters.depth0Mounts,
      depth1Mounts: counters.depth1Mounts,
      depth2Mounts: counters.depth2Mounts,
      depth3PlusMounts: counters.depth3PlusMounts,
    });
  }, PLAN_CARD_PERF_FLUSH_MS);
}

function recordPlanCardPerf(
  kind: 'render' | 'mount',
  depth: number,
  projectId: string | undefined,
  variant: 'default' | 'preview'
): void {
  if (variant !== 'default') return;
  if (!isPerfLoggingEnabled()) return;

  if (!pendingPlanCardPerf) {
    pendingPlanCardPerf = {
      projectId: projectId ?? null,
      rootRenders: 0,
      nestedRenders: 0,
      rootMounts: 0,
      nestedMounts: 0,
      depth0Renders: 0,
      depth1Renders: 0,
      depth2Renders: 0,
      depth3PlusRenders: 0,
      depth0Mounts: 0,
      depth1Mounts: 0,
      depth2Mounts: 0,
      depth3PlusMounts: 0,
    };
  } else if (pendingPlanCardPerf.projectId === null && projectId) {
    pendingPlanCardPerf.projectId = projectId;
  }

  const bucket = getDepthBucket(depth);
  if (kind === 'render') {
    if (depth === 0) pendingPlanCardPerf.rootRenders += 1;
    else pendingPlanCardPerf.nestedRenders += 1;
    pendingPlanCardPerf[`${bucket}Renders`] += 1;
  } else {
    if (depth === 0) pendingPlanCardPerf.rootMounts += 1;
    else pendingPlanCardPerf.nestedMounts += 1;
    pendingPlanCardPerf[`${bucket}Mounts`] += 1;
  }

  schedulePlanCardPerfFlush();
}

export type { TreeNode };
export { MAX_DEPTH };

/**
 * Check if a node or any of its descendants match the search query.
 */
function nodeMatchesSearch(node: TreeNode, query: string): boolean {
  if (!query.trim()) return true;

  const q = query.toLowerCase();
  const titleMatch = node.title.toLowerCase().includes(q);
  const keyMatch = node.external_key?.toLowerCase().includes(q) ?? false;

  if (titleMatch || keyMatch) return true;

  // Check children recursively
  return node.children.some(child => nodeMatchesSearch(child, q));
}

/**
 * Check if this specific item (not descendants) matches the search query.
 */
function itemDirectlyMatches(item: TreeNode, query: string): boolean {
  if (!query.trim()) return true;

  const q = query.toLowerCase();
  return item.title.toLowerCase().includes(q) ||
    (item.external_key?.toLowerCase().includes(q) ?? false);
}

interface PlanCardProps {
  item: TreeNode;
  depth: number;
  /** Card variant: 'default' for interactive canvas cards, 'preview' for drag preview */
  variant?: 'default' | 'preview';
  isSelected?: boolean;
  isFocused?: boolean;
  focusedItemId?: string | null;  // For checking child focus
  /** Search query for filtering/highlighting */
  searchQuery?: string;
  /** Comma-joined selection fingerprint for this subtree (used to limit re-renders) */
  selectionSignature: string;
  getSelectionSignature: (id: string) => string;
  getSelectedIds: () => Set<string>;
  /** Set of plan item IDs currently queued for export */
  queuedItemIds?: Set<string>;
  /** Set of recently imported item IDs for temporary highlight */
  recentlyImportedIds?: Set<string>;
  onSelectItem?: (itemId: string, addToSelection: boolean) => void;  // Selection handler
  onEditItem?: (itemId: string) => void;  // For opening edit panel
  onPrepareEditItem?: (itemId: string) => void;  // For warming modal data before open
  onAddToContext?: (itemId: string) => void;  // For adding to chat context
  onDrop?: (itemIds: string[], targetParentId: string) => void;
  onDropFromBacklog?: (itemId: string, parentId: string | null) => void;
  onDragStart?: (item: TreeNode, x: number, y: number, offsetX: number, offsetY: number, depth: number, selectedIds: string[]) => void;
  onDragEnd?: () => void;
  projectId?: string;
  /** Estimated expanded subtree heights, used for browser-level nested canvas culling */
  subtreeHeightMap?: Map<string, number>;
  /** When enabled, allow the browser to skip rendering nested offscreen subtrees */
  enableSubtreeCulling?: boolean;
}

export const PlanCard = memo(function PlanCard({
  item,
  depth,
  variant = 'default',
  isSelected = false,
  isFocused = false,
  focusedItemId,
  searchQuery = '',
  selectionSignature,
  getSelectionSignature,
  getSelectedIds,
  queuedItemIds,
  recentlyImportedIds,
  onSelectItem,
  onEditItem,
  onPrepareEditItem,
  onAddToContext,
  onDrop,
  onDropFromBacklog,
  onDragStart,
  onDragEnd,
  projectId,
  subtreeHeightMap,
  enableSubtreeCulling = false,
}: PlanCardProps) {
  const isPreview = variant === 'preview';
  const selectedIds = getSelectedIds();

  // Search matching logic
  const isSearchActive = searchQuery.trim().length > 0;
  const directMatch = useMemo(
    () => itemDirectlyMatches(item, searchQuery),
    [item, searchQuery]
  );
  const hasMatchingDescendant = useMemo(
    () => !directMatch && nodeMatchesSearch(item, searchQuery),
    [item, searchQuery, directMatch]
  );
  // Dim if search is active and neither this item nor its descendants match
  const isDimmed = isSearchActive && !directMatch && !hasMatchingDescendant;

  // State only needed for interactive cards
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const {
    deletePlanItem,
    deletePlanItemWithDescendants,
    updateStatusCategory,
  } = usePlanDomainStore(
    useShallow((state) => ({
      deletePlanItem: state.deletePlanItem,
      deletePlanItemWithDescendants: state.deletePlanItemWithDescendants,
      updateStatusCategory: state.updateStatusCategory,
    }))
  );
  const { addToQueue } = useExportActions();

  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  // Narrow the sessions subscription to a scalar boolean so this card only
  // re-renders when its own active-session status changes, rather than on any
  // session update anywhere in the store.
  const hasActiveDevSession = useDevSessionsStore((state) => {
    const activeStatuses = ACTIVE_SESSION_STATUSES as readonly string[];
  });
  const isWorktreeLoading = !!worktreeLoadingOp;


  // Derive effective status: use status_category if set, otherwise derive from external_status
  const effectiveStatus = useMemo(
    () => item.status_category ?? getStatusCategory(item.external_status, item.external_type),
    [item.status_category, item.external_status, item.external_type]
  );

  // Queue and sync status indicators
  const isQueued = !isPreview && queuedItemIds?.has(item.id);
  const isRecentlyImported = !isPreview && recentlyImportedIds?.has(item.id);

  // Count total descendants (children, grandchildren, etc.) - compute only when needed for the delete dialog
  const descendantCount = useMemo(() => {
    if (!showDeleteConfirm) return 0;
    const countDescendants = (node: TreeNode): number => {
      return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
    };
    return countDescendants(item);
  }, [item, showDeleteConfirm]);

  const style = getStyleForDepth(depth);

  // Root cards (depth 0) use fixed width; nested cards fill their parent
  const cardWidth = depth === 0 ? style.width : '100%';
  const subtreeHeight = subtreeHeightMap?.get(item.id);

  const cardStyle = useMemo<CSSProperties>(() => {
    const nextStyle: CSSProperties = { width: cardWidth };

    // Root cards are already JS-culled by the canvas. This optimization is for
    // nested descendants inside visible roots, where full recursive rendering
    // would otherwise stay on the hot path during pan/zoom.
    if (
      enableSubtreeCulling &&
      !isPreview &&
      depth > 0 &&
      subtreeHeight !== undefined
    ) {
      nextStyle.contentVisibility = 'auto';
      nextStyle.containIntrinsicSize = `${Math.ceil(subtreeHeight)}px`;
    }

    return nextStyle;
  }, [cardWidth, depth, enableSubtreeCulling, isPreview, subtreeHeight]);

  // Preview mode styling (plan-card CSS handles default bg; preview gets explicit bg)
  const previewClasses = isPreview
    ? 'bg-surface-2/95 border border-border-strong'
    : '';

  // CSS class-based indicators (replace ring-based approach)
  const sessionClass = hasActiveDevSession ? 'plan-card-active-session' : '';
  const importClass = isRecentlyImported && !hasActiveDevSession ? 'plan-card-imported' : '';

  const interactiveClasses = isPreview
    ? ''
    : `${isDragOver ? 'drop-target' : ''} ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${sessionClass} ${importClass} ${isDragging ? 'opacity-50' : isDimmed ? 'opacity-30' : ''} cursor-pointer group`;

  useEffect(() => {
    recordPlanCardPerf('render', depth, projectId, variant);
  });

  useEffect(() => {
    recordPlanCardPerf('mount', depth, projectId, variant);
  }, [depth, projectId, variant]);

  return (
    <div
      data-plan-item-id={!isPreview ? item.id : undefined}
      data-plan-card={!isPreview ? true : undefined}
      data-testid={!isPreview ? 'plan-card' : 'plan-card-preview'}
      role="article"
      aria-label={item.title}
      className={`
        plan-card plan-card-depth-${Math.min(depth, 4)}
        rounded ${style.borderWidth} ${style.padding}
        ${previewClasses}
        ${interactiveClasses}
        transition-[colors,opacity] duration-150 relative
      `}
      data-selection-key={selectionSignature}
      style={cardStyle}
      draggable={!isPreview}
      onClick={isPreview ? undefined : (e) => {
        e.stopPropagation();
        onSelectItem?.(item.id, e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={isPreview ? undefined : (e) => {
        e.stopPropagation();
        onPrepareEditItem?.(item.id);
        onEditItem?.(item.id);
      }}
      onContextMenu={isPreview ? undefined : (e) => {
        // Check if a child card already handled this
        const nativeEvent = e.nativeEvent as Event & { _contextMenuHandled?: boolean };
        if (nativeEvent._contextMenuHandled) return;

        e.preventDefault();
        e.stopPropagation();

        // Select this card if not already selected
        if (!isSelected) {
          onSelectItem?.(item.id, false);
        }

        setMenuPosition(getPlanCardMenuPositionForPoint(e.clientX, e.clientY));
        setShowMenu(true);

        // Mark as handled so parent cards don't also open menus
        nativeEvent._contextMenuHandled = true;
      }}
      onDragStart={isPreview ? undefined : (e) => {
        e.stopPropagation();
        setIsDragging(true);

        // Hide the default drag ghost by setting it off-screen
        const emptyDiv = document.createElement('div');
        emptyDiv.style.width = '1px';
        emptyDiv.style.height = '1px';
        emptyDiv.style.position = 'fixed';
        emptyDiv.style.top = '-1000px';
        document.body.appendChild(emptyDiv);
        e.dataTransfer.setDragImage(emptyDiv, 0, 0);
        requestAnimationFrame(() => document.body.removeChild(emptyDiv));

        // Calculate where on the card the user clicked (offset from top-left)
        const cardRect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - cardRect.left;
        const offsetY = e.clientY - cardRect.top;

        e.dataTransfer.setData('item-id', item.id);
        e.dataTransfer.setData('source', DragSource.CANVAS);
        // Store the item's original canvas position
        e.dataTransfer.setData('start-x', (item.position_x ?? 0).toString());
        e.dataTransfer.setData('start-y', (item.position_y ?? 0).toString());
        // Store the cursor's screen position at drag start
        e.dataTransfer.setData('drag-start-screen-x', e.clientX.toString());
        e.dataTransfer.setData('drag-start-screen-y', e.clientY.toString());
        // Store click offset within the card
        e.dataTransfer.setData('offset-x', offsetX.toString());
        e.dataTransfer.setData('offset-y', offsetY.toString());

        // Store all selected item IDs for batch moves
        // If dragging an unselected item, only move that item
        const idsToMove = selectedIds.has(item.id)
          ? Array.from(selectedIds)
          : [item.id];
        e.dataTransfer.setData('selected-ids', JSON.stringify(idsToMove));

        // Collect all descendant IDs to prevent dropping parent onto child (cycle prevention)
        const collectDescendantIds = (node: TreeNode): string[] => {
          return [node.id, ...node.children.flatMap(child => collectDescendantIds(child))];
        };
        const allDescendantIds = collectDescendantIds(item);
        e.dataTransfer.setData('descendant-ids', JSON.stringify(allDescendantIds));

        // Notify parent with position for drag preview (pass offset for accurate preview positioning)
        onDragStart?.(item, e.clientX, e.clientY, offsetX, offsetY, depth, idsToMove);
      }}
      onDragEnd={isPreview ? undefined : () => {
        setIsDragging(false);
        onDragEnd?.();
      }}
      onDragOver={isPreview ? undefined : (e) => {
        e.preventDefault();
        // Don't allow nesting beyond max depth
        if (depth >= MAX_DEPTH) return;
        // Don't show drop indicator on the card being dragged
        if (isDragging) return;
        // Don't stopPropagation - allow dragOver to bubble so canvas can receive drops
        setIsDragOver(true);
      }}
      onDragLeave={isPreview ? undefined : (e) => {
        // Only set dragOver to false if we're actually leaving this card
        // (not just moving to a child element within the card)
        const relatedTarget = e.relatedTarget as Node | null;
        if (!e.currentTarget.contains(relatedTarget)) {
          setIsDragOver(false);
        }
      }}
      onDrop={isPreview ? undefined : (e) => {
        e.preventDefault();
        setIsDragOver(false);

        const droppedItemId = e.dataTransfer.getData('item-id');
        const selectedIdsJson = e.dataTransfer.getData('selected-ids');
        const descendantIdsJson = e.dataTransfer.getData('descendant-ids');
        if (!droppedItemId) return;

        // Don't allow nesting beyond max depth
        if (depth >= MAX_DEPTH) return;

        // Get all items being dragged
        const selectedIds: string[] = selectedIdsJson ? JSON.parse(selectedIdsJson) : [droppedItemId];

        // If this card is part of the multi-selection being dragged,
        // let the event bubble to canvas for a position-only move
        if (selectedIds.includes(item.id)) {
          return; // Don't stop propagation - let canvas handle it
        }

        // Check if this drop target is a descendant of the dragged item
        // This prevents creating circular references (parent dropped onto child)
        const descendantIds: string[] = descendantIdsJson ? JSON.parse(descendantIdsJson) : [];
        if (descendantIds.includes(item.id)) {
          e.stopPropagation();
          return; // Can't drop parent onto its own descendant
        }

        // Filter out items that can't be reparented here:
        // - The target card itself
        // - Items that are already direct children
        const validItems = selectedIds.filter(id => {
          // Can't drop on self
          if (id === item.id) return false;
          // Already a child
          if (item.children.some(child => child.id === id)) return false;
          return true;
        });

        // Nothing valid to drop
        if (validItems.length === 0) {
          e.stopPropagation();
          return;
        }

        // Reparent all valid items under this card in a single batch
        e.stopPropagation();
        onDrop?.(validItems, item.id);
      }}
    >
      <PlanCardHeader
        item={item}
        titleSizeClass={style.titleSize}
        isPreview={isPreview}
        isSearchActive={isSearchActive}
        directMatch={directMatch}
        searchQuery={searchQuery}
        hasActiveDevSession={hasActiveDevSession}
        isWorktreeLoading={isWorktreeLoading}
        worktreeLoadingOp={worktreeLoadingOp}
        showMenu={showMenu}
        onEdit={() => {
          onPrepareEditItem?.(item.id);
          onEditItem?.(item.id);
        }}
        onPrepareEdit={() => onPrepareEditItem?.(item.id)}
        onToggleMenu={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuPosition(getPlanCardMenuPositionForRect(rect));
          setShowMenu((current) => !current);
        }}
      />

      <PlanCardMetadataRow
        item={item}
        isPreview={isPreview}
        isSearchActive={isSearchActive}
        directMatch={directMatch}
        searchQuery={searchQuery}
        effectiveStatus={effectiveStatus}
        isQueued={!!isQueued}
        onStatusChange={(status) => updateStatusCategory(item.id, status)}
      />

      {/* Description (collapsed for deeper levels, space always reserved at depth 0-1) */}
      {depth <= 1 && (
        <p className={`text-xs mt-1.5 line-clamp-1 ${item.description ? 'text-text-secondary' : 'invisible'}`}>
          {item.description || '\u00A0'}
        </p>
      )}

      {/* Children with inline toggle */}
      {item.children.length > 0 && (
        <div className="mt-1.5">
          {/* Expand/collapse toggle */}
          {!isPreview ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="flex items-center gap-1 text-tiny text-text-muted hover:text-text-secondary transition-colors mb-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-tiny text-text-muted mb-1">
              <svg className="w-3 h-3 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
          {(isPreview || isExpanded) && (
            <div className="space-y-2">
              {item.children.map(child => (
                <PlanCard
                  key={child.id}
                  item={child}
                  depth={depth + 1}
                  variant={variant}
                  isSelected={selectedIds.has(child.id)}
                  isFocused={focusedItemId === child.id}
                  focusedItemId={focusedItemId}
                  searchQuery={searchQuery}
                  selectionSignature={getSelectionSignature(child.id)}
                  getSelectionSignature={getSelectionSignature}
                  getSelectedIds={getSelectedIds}
                  queuedItemIds={queuedItemIds}
                  recentlyImportedIds={recentlyImportedIds}
                  onSelectItem={onSelectItem}
                  onEditItem={onEditItem}
                  onPrepareEditItem={onPrepareEditItem}
                  onAddToContext={onAddToContext}
                  onDrop={onDrop}
                  onDropFromBacklog={onDropFromBacklog}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  projectId={projectId}
                  subtreeHeightMap={subtreeHeightMap}
                  enableSubtreeCulling={enableSubtreeCulling}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Context menu */}
        <PlanCardMenu
          itemId={item.id}
          isOpen={showMenu}
          position={menuPosition}
          onClose={() => setShowMenu(false)}
          onEditItem={() => {
            onPrepareEditItem?.(item.id);
            onEditItem?.(item.id);
          }}
          onDelete={() => setShowDeleteConfirm(true)}
          onAddToContext={() => onAddToContext?.(item.id)}
            if (currentProjectId) {
              const result = await addToQueue(currentProjectId, [item.id]);
              if (!result.success && result.error) {
                toast.error(result.error);
              }
            }
          }}
        />
      )}

      {/* Delete confirmation dialog - not rendered in preview mode */}
      {!isPreview && showDeleteConfirm && (
        <DeleteConfirmDialog
          itemTitle={item.title}
          descendantCount={descendantCount}
          onDeleteMoveToBacklog={async () => {
            await deletePlanItem(item.id);
            setShowDeleteConfirm(false);
          }}
          onDeleteAll={async () => {
            await deletePlanItemWithDescendants(item.id);
            setShowDeleteConfirm(false);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

    </div>
  );
});
