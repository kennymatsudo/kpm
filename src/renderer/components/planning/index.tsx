import { Canvas } from './Canvas';
import { BulkDeleteConfirmDialog } from './BulkDeleteConfirmDialog';

interface PlanViewProps {
}

  const {
    planItems,
    executePlanActions,
    updateItemPosition,



  if (!currentProjectId) {
    return (
            </svg>
          </div>
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
        />

      {/* Bulk Delete Confirmation Dialog */}
      {showBulkDeleteDialog && (
        <BulkDeleteConfirmDialog
          itemCount={selectedItemIds.size}
          descendantCount={descendantIds.size}
          onDeleteAll={handleBulkDeleteAll}
        />
      )}
    </div>
  );
}
