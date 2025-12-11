import { Canvas } from './Canvas';
import { BulkDeleteConfirmDialog } from './BulkDeleteConfirmDialog';
import { useShallow } from 'zustand/react/shallow';

interface PlanViewProps {
}

export function PlanView({
}: PlanViewProps) {
  const {
    planItems,
    executePlanActions,
    updateItemPosition,


  // Export store - for queue operations

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

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-surface-0 text-text-secondary">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 shadow-sm flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            </svg>
          </div>
          <p className="text-lg font-medium text-text-primary whitespace-nowrap">Select or create a project</p>
          <p className="text-sm mt-2 text-text-muted leading-relaxed whitespace-normal">
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-0 flex">
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
