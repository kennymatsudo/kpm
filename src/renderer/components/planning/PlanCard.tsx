import type { TreeNode } from '../../utils/planHierarchy';
import { getStyleForDepth, MAX_DEPTH } from '../../constants/planCardStyles';
import { DragSource } from '../../constants/dragSource';

export type { TreeNode };
export { MAX_DEPTH };

interface PlanCardProps {
  item: TreeNode;
  depth: number;
  /** Card variant: 'default' for interactive canvas cards, 'preview' for drag preview */
  variant?: 'default' | 'preview';
  isSelected?: boolean;
  isFocused?: boolean;
  focusedItemId?: string | null;  // For checking child focus
  onEditItem?: (itemId: string) => void;  // For opening edit panel
  onDragStart?: (item: TreeNode, x: number, y: number, offsetX: number, offsetY: number, depth: number, selectedIds: string[]) => void;
  onDragEnd?: () => void;
}

  item,
  depth,
  variant = 'default',
  isSelected = false,
  isFocused = false,
  focusedItemId,
  onSelectItem,
  onEditItem,
  onDrop,
  onDragStart,
  onDragEnd,
}: PlanCardProps) {
  const isPreview = variant === 'preview';

  // State only needed for interactive cards
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);



  const style = getStyleForDepth(depth);

  // Root cards (depth 0) use fixed width; nested cards fill their parent
  const cardWidth = depth === 0 ? style.width : '100%';

  const previewClasses = isPreview

  const interactiveClasses = isPreview
    ? ''

  return (
    <div
      data-plan-card={!isPreview ? true : undefined}
      className={`
        plan-card plan-card-depth-${Math.min(depth, 4)}
        ${previewClasses}
        ${interactiveClasses}
      `}
      draggable={!isPreview}
      onClick={isPreview ? undefined : (e) => {
        e.stopPropagation();
      }}
      onContextMenu={isPreview ? undefined : (e) => {
        if (!isSelected) {
        }
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
        // Don't stopPropagation - allow dragOver to bubble so canvas can receive drops
        setIsDragOver(true);
      }}
      onDrop={isPreview ? undefined : (e) => {
        e.preventDefault();
        setIsDragOver(false);

        const droppedItemId = e.dataTransfer.getData('item-id');
        const selectedIdsJson = e.dataTransfer.getData('selected-ids');
        const descendantIdsJson = e.dataTransfer.getData('descendant-ids');
        if (!droppedItemId) return;

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

        e.stopPropagation();
      }}
    >

      )}

        </div>
      )}

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
