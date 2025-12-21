import { BoardColumn } from './BoardColumn';
import { getStatusCategory, STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';


interface BoardViewProps {
  items: PlanItem[];
  allItems: PlanItem[];
  selectedIds: Set<string>;
  focusedItemId: string | null;
  searchQuery: string;
  onSelectItem: (id: string | null, addToSelection?: boolean) => void;
  onEditItem: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, ids: Set<string>) => void;
}

/**
 * BoardView - Kanban-style board view for plan items
 *
 * Design: Horizontal columns for each status category, drag-and-drop to change status.
 */
  items,
  allItems,
  selectedIds,
  focusedItemId,
  searchQuery,
  onSelectItem,
  onEditItem,
  onContextMenu,
}: BoardViewProps) {

  // Column visibility - persisted per project
  const [columnVisibility, setColumnVisibility] = useState<Record<StatusCategory, boolean>>(() => {
    if (!currentProjectId) {
    }
    const saved = localStorage.getItem(`kpm-board-columns-${currentProjectId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Invalid JSON, use defaults
      }
    }
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

  const itemsByStatus = useMemo(() => {
      not_started: [],
      in_progress: [],
      done: [],
      blocked: [],
      canceled: [],
    };

    for (const item of items) {
    }


  // Count items in toggle columns (for showing count even when hidden)
  const toggleColumnCounts = useMemo(() => {

  const handleDrop = useCallback(
    (itemId: string, newStatus: StatusCategory) => {
      setDraggedItemId(null);
    },
  );

  const handleDragStart = useCallback((itemId: string) => {
    setDraggedItemId(itemId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItemId(null);
  }, []);

  // Determine which columns to show
  const visibleColumns = useMemo(() => {
    return VISIBLE_COLUMNS.filter((status) => {
      if (CORE_COLUMNS.includes(status)) return true;
      return columnVisibility[status];
    });
  }, [columnVisibility]);

  return (
      {/* Header with column toggles */}

      </div>

      {/* Columns container - horizontal scroll if needed */}
        {visibleColumns.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            parentMap={parentMap}
            selectedIds={selectedIds}
            focusedItemId={focusedItemId}
            searchQuery={searchQuery}
            draggedItemId={draggedItemId}
            onEditItem={onEditItem}
            onContextMenu={onContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  );
