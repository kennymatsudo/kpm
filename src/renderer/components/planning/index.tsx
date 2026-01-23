import { Canvas } from './Canvas';
import { BulkDeleteConfirmDialog } from './BulkDeleteConfirmDialog';
import { TreeView } from '../tree-view';
import { BoardView } from '../board-view';
import { useShallow } from 'zustand/react/shallow';
import type { ViewMode } from './ViewSwitcher';

interface PlanViewProps {
  viewMode: ViewMode;
  filteredPlannedItems: PlanItem[];
  searchQuery: string;
  selectedItemIds: Set<string>;
  setSelectedItemIds: (ids: Set<string>) => void;
  /** Register a callback to open create item modal (for Cmd+Shift+I from Layout) */
  registerCreateItemHandler?: (handler: (() => void) | null) => void;
}

export function PlanView({
  viewMode,
  filteredPlannedItems,
  searchQuery,
  selectedItemIds,
  setSelectedItemIds,
  registerCreateItemHandler,
}: PlanViewProps) {
  const {
    planItems,
    executePlanActions,
    updateItemPosition,
    updateItemPositions,
    updatePlanItem,
    useShallow((state) => ({
      planItems: state.planItems,
      executePlanActions: state.executePlanActions,
      updateItemPosition: state.updateItemPosition,
      updateItemPositions: state.updateItemPositions,
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
    }))
  );

  // Derive focusedItemId from focusedResources for backward compatibility with child components


  // Export store - for queue operations

  // Group store - for groups and layout
  const { groups, updateGroupPosition, updateGroupSize } = useGroupStore(
    useShallow((state) => ({
      groups: state.groups,
      updateGroupPosition: state.updateGroupPosition,
      updateGroupSize: state.updateGroupSize,
    }))
  );






  // Descendant tracking for bulk operations

  const {
    showBulkDeleteDialog,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    handleBulkDeleteOrphan,
    handleBulkDeleteAll,
  } = useBulkActions({
    selectedItemIds,
    descendantIds,
    executePlanActions,
    setSelectedItemIds,
  });

  const handleAutoLayout = useAutoLayout({
    plannedItems: filteredPlannedItems, // Use filtered items so new items are placed near visible content
    groups,
    updateItemPosition,
    updateGroupPosition,
    updateGroupSize,
  });

  // Collision resolution for when items are added to groups
  const resolveCollisionsForGroup = useGroupCollisionResolution({
    plannedItems: filteredPlannedItems,
    groups,
    updateGroupPosition,
    updateGroupSize,
  });

  // Track previous group assignments to detect changes (for MCP tool updates)
  const prevGroupAssignmentsRef = useRef<Map<string, string | null>>(new Map());
  const prevGroupCollapsedRef = useRef<Map<string, boolean>>(new Map());

  // Watch for group assignment changes (handles MCP tool updates)
  useEffect(() => {
    const currentAssignments = new Map<string, string | null>();
    const affectedGroupIds = new Set<string>();

    // Build current assignments map and detect changes
      currentAssignments.set(item.id, item.group_id);

      const currentGroupId = item.group_id;

      // If group assignment changed
      if (prevGroupId !== currentGroupId) {
        if (currentGroupId) {
          affectedGroupIds.add(currentGroupId);
        }
        if (prevGroupId) {
          affectedGroupIds.add(prevGroupId);
        }
        if (shouldDebug) {
          console.debug('[group-assignment]', {
            itemId: item.id,
            from: prevGroupId,
            to: currentGroupId,
          });
        }
      }
    }

    // Update ref for next comparison
    prevGroupAssignmentsRef.current = currentAssignments;

    // Resolve collisions for affected groups (skip on initial render)
    if (affectedGroupIds.size > 0 && groups.length > 0) {
      // Resolve collisions for each affected group
      for (const groupId of affectedGroupIds) {
        // Check if group still exists
        if (groups.some(g => g.id === groupId)) {
          void resolveCollisionsForGroup(groupId);
        }
      }
    }

  // When expanding a group, push overlapping groups out of the way
  useEffect(() => {
    const prevCollapsed = prevGroupCollapsedRef.current;
    const currentIds = new Set(groups.map(group => group.id));

    for (const group of groups) {
      const wasCollapsed = prevCollapsed.get(group.id);
      if (wasCollapsed === undefined) {
        prevCollapsed.set(group.id, group.is_collapsed);
        continue;
      }

      if (wasCollapsed && !group.is_collapsed) {
        void resolveCollisionsForGroup(group.id);
      }

      prevCollapsed.set(group.id, group.is_collapsed);
    }

    // Cleanup removed groups
    for (const id of prevCollapsed.keys()) {
      if (!currentIds.has(id)) {
        prevCollapsed.delete(id);
      }
    }
  }, [groups, resolveCollisionsForGroup]);


  // Build tree hierarchy for tree view (using filtered items)
  const treeHierarchy = useMemo(() => buildHierarchyTree(filteredPlannedItems), [filteredPlannedItems]);

  // All filtered items for board view
  const leafItems = useMemo(
    () => filteredPlannedItems,
    [filteredPlannedItems]
  );

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-surface-0 text-text-secondary">
        <div className="text-center w-80">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 shadow-sm flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-text-primary whitespace-nowrap">Select or create a project</p>
          <p className="text-sm mt-2 text-text-muted leading-relaxed whitespace-normal">
            Use File - New Project to create your first project, or select an existing one from the sidebar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-0 flex">
        {/* View area - Canvas, Tree, or Board */}
        <div className="flex-1 overflow-hidden" onContextMenu={handleContextMenu}>
          {viewMode === 'card' ? (
                focusedItemId={focusedItemId}
                searchQuery={searchQuery}
                onSelectItem={handleSelectItem}
                onEditItem={handleEditItem}
              />
          ) : (
          )}
        </div>
      </div>

          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedItemIds.size}
          onEdit={() => {
            const selectedId = Array.from(selectedItemIds)[0];
            if (selectedId) handleEditItem(selectedId);
          }}
          onDelete={openBulkDeleteDialog}
        />

      {/* Bulk Delete Confirmation Dialog */}
      {showBulkDeleteDialog && (
        <BulkDeleteConfirmDialog
          itemCount={selectedItemIds.size}
          descendantCount={descendantIds.size}
          onDeleteOrphan={handleBulkDeleteOrphan}
          onDeleteAll={handleBulkDeleteAll}
          onCancel={closeBulkDeleteDialog}
        />
      )}

      {/* Task Edit Modal */}
      {editingItem && (
      )}

      {/* Create Item Modal */}
      {createItemContext && (
      )}
    </div>
  );
}

// Export the openCreateItemModal function for Layout to use
export { type CreateItemData } from './CreateItemModal';
