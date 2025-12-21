import { Canvas } from './Canvas';
import { BulkDeleteConfirmDialog } from './BulkDeleteConfirmDialog';
import { useShallow } from 'zustand/react/shallow';
import type { ViewMode } from './ViewSwitcher';

interface PlanViewProps {
  viewMode: ViewMode;
  filteredPlannedItems: PlanItem[];
  searchQuery: string;
  selectedItemIds: Set<string>;
  setSelectedItemIds: (ids: Set<string>) => void;
}

export function PlanView({
  viewMode,
  filteredPlannedItems,
  searchQuery,
  selectedItemIds,
  setSelectedItemIds,
}: PlanViewProps) {
  const {
    planItems,
    executePlanActions,
    updateItemPosition,
    useShallow((state) => ({
      planItems: state.planItems,
      executePlanActions: state.executePlanActions,
      updateItemPosition: state.updateItemPosition,
    }))
  );


  // Export store - for queue operations



  // Descendant tracking for bulk operations

  const {
    showBulkDeleteDialog,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    handleBulkDeleteAll,
  } = useBulkActions({
    selectedItemIds,
    descendantIds,
    executePlanActions,
    setSelectedItemIds,
  });

  const handleAutoLayout = useAutoLayout({
    updateItemPosition,
  });

  // Build tree hierarchy for tree view (using filtered items)
  const treeHierarchy = useMemo(() => buildHierarchyTree(filteredPlannedItems), [filteredPlannedItems]);

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-surface-0 text-text-secondary">
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
        <div className="flex-1 overflow-hidden" onContextMenu={handleContextMenu}>
          {viewMode === 'card' ? (
                focusedItemId={focusedItemId}
                searchQuery={searchQuery}
                onSelectItem={handleSelectItem}
                onEditItem={handleEditItem}
              />
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
          onDeleteAll={handleBulkDeleteAll}
          onCancel={closeBulkDeleteDialog}
        />
      )}
    </div>
  );
}
