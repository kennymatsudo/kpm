import { BoardColumn } from './BoardColumn';
import {
  toast,
  usePlanDomainStore,
  useProjectDomainStore,
} from '../../stores';
import { getStatusCategory, STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import { subscribe } from '../../stores/storeEvents';

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
  onEditItem: (id: string) => void;
  onPrepareEditItem?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, ids: Set<string>) => void;
  /** Callback for creating a new item with a given status */
  onCreateItem?: (status: StatusCategory) => void;
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
  onEditItem,
  onPrepareEditItem,
  onContextMenu,
  onCreateItem,
}: BoardViewProps) {
  const updateStatusCategory = usePlanDomainStore((state) => state.updateStatusCategory);
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);

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
  }, []);

  const handleDrop = useCallback(
    (itemId: string, newStatus: StatusCategory) => {
      const item = allItems.find((candidate) => candidate.id === itemId);
      if (!item) {
        setDraggedItemId(null);
        return;
      }

      const previousStatus =
        item.status_category ?? getStatusCategory(item.external_status, item.external_type) ?? 'not_started';
        setDraggedItemId(null);
        return;
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
        {items.length} item{items.length !== 1 ? 's' : ''}
      </span>

      </div>

      {/* Columns container - horizontal scroll if needed */}
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
            onEditItem={onEditItem}
            onPrepareEditItem={onPrepareEditItem}
            onContextMenu={onContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onCreateItem={onCreateItem}
          />
        ))}
      </div>
    </div>
  );
});
