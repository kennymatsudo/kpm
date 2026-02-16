import { useShallow } from 'zustand/react/shallow';
import {
  useProjectDomainStore,
  usePlanDomainStore,
  useResourceDomainStore,
  toast,
} from '../../stores';
import { useExportActions } from '../../hooks/useStoreActions';
import type { TreeNode } from '../../utils/planHierarchy';
import { getStyleForDepth, MAX_DEPTH } from '../../constants/planCardStyles';
import { DragSource } from '../../constants/dragSource';
import { DeleteConfirmDialog } from '../ui/DeleteConfirmDialog';
import { getStatusCategory } from '../../constants/statusConfig';

// Hoisted constant for active session status check (avoids array recreation in selector)
const ACTIVE_SESSION_STATUSES = ['pending', 'active'] as const;

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
  onAddToContext?: (itemId: string) => void;  // For adding to chat context
  onDrop?: (itemIds: string[], targetParentId: string) => void;
  onDropFromBacklog?: (itemId: string, parentId: string | null) => void;
  onDragStart?: (item: TreeNode, x: number, y: number, offsetX: number, offsetY: number, depth: number, selectedIds: string[]) => void;
  onDragEnd?: () => void;
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
  onAddToContext,
  onDrop,
  onDropFromBacklog,
  onDragStart,
  onDragEnd,
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
    const activeStatuses = ACTIVE_SESSION_STATUSES as readonly string[];
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
      draggable={!isPreview}
      onClick={isPreview ? undefined : (e) => {
        e.stopPropagation();
        onSelectItem?.(item.id, e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={isPreview ? undefined : (e) => {
        e.stopPropagation();
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

      {/* Description (collapsed for deeper levels, space always reserved at depth 0-1) */}
      {depth <= 1 && (
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
                  onAddToContext={onAddToContext}
                  onDrop={onDrop}
                  onDropFromBacklog={onDropFromBacklog}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Context menu */}
        <PlanCardMenu
          isOpen={showMenu}
          position={menuPosition}
          onClose={() => setShowMenu(false)}
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
