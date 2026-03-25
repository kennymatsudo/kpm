import { BoardCard, type Breadcrumb } from './BoardCard';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import type { PlanItem, StatusCategory } from '../../../shared/types';

interface BoardColumnProps {
  status: StatusCategory;
  parentMap: Map<string, PlanItem>;
  selectedIds: Set<string>;
  focusedItemId: string | null;
  searchQuery: string;
  draggedItemId: string | null;
  onSelectItem: (id: string | null, addToSelection?: boolean) => void;
  onEditItem: (id: string) => void;
  onPrepareEditItem?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, ids: Set<string>) => void;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDrop: (itemId: string, newStatus: StatusCategory) => void;
  onCreateItem?: (status: StatusCategory) => void;
}

/**
 * BoardColumn - Single column representing a status category
 *
 * Design: Rounded container with colored header dot, scrollable cards area.
 * Handles drag-and-drop for status changes.
 */
export const BoardColumn = memo(function BoardColumn({
  status,
  parentMap,
  selectedIds,
  focusedItemId,
  searchQuery,
  draggedItemId,
  onSelectItem,
  onEditItem,
  onPrepareEditItem,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDrop,
  onCreateItem,
}: BoardColumnProps) {
  const config = STATUS_CATEGORY_CONFIG[status];
  const [isDragOver, setIsDragOver] = useState(false);

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
        ${isDragOver && draggedItemId ? 'ring-2 ring-accent ring-inset bg-accent/5' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
        <span className={`w-2 h-2 rounded-full ${config.bgClass}`} />
      </div>

      {/* Scrollable cards container */}
      <div
        onClick={handleColumnClick}
      >
            searchQuery={searchQuery}
            onDragEnd={onDragEnd}
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
