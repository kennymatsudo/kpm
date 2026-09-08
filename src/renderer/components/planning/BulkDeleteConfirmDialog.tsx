import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { trackerDeletionWarning } from '../tracker/shared/trackerDisplay';

interface BulkDeleteConfirmDialogProps {
  itemCount: number;
  descendantCount: number;
  /** Count of selected/descendant items linked to a tracker issue. */
  trackerLinkedCount: number;
  /** Single tracker type if the linked items share one; null/mixed falls back to generic copy. */
  trackerType?: string | null;
  onDeleteOrphan: () => void;
  onDeleteAll: () => void;
  onCancel: () => void;
}

export function BulkDeleteConfirmDialog({
  itemCount,
  descendantCount,
  trackerLinkedCount,
  trackerType,
  onDeleteOrphan,
  onDeleteAll,
  onCancel,
}: BulkDeleteConfirmDialogProps) {
  const hasDescendants = descendantCount > 0;
  const totalToDelete = itemCount + descendantCount;

  const trackerWarning = trackerLinkedCount > 0 ? (
    <div className="text-warning mt-2">
      {trackerLinkedCount} linked tracker issue{trackerLinkedCount > 1 ? 's' : ''} {trackerDeletionWarning(trackerType)}
    </div>
  ) : null;

  const message = hasDescendants ? (
    <>
      The selected items have{' '}
      <span className="text-warning">
        {descendantCount} child item{descendantCount > 1 ? 's' : ''}
      </span>
      . Choose how to handle them:
      {trackerWarning}
    </>
  ) : (
    <>
      Are you sure you want to delete{' '}
      <span className="text-text-primary font-medium">
        {itemCount} item{itemCount > 1 ? 's' : ''}
      </span>
      ?
      {trackerWarning}
    </>
  );

  if (hasDescendants) {
    return (
      <ConfirmActionDialog
        title={`Delete ${itemCount} Item${itemCount > 1 ? 's' : ''}?`}
        message={message}
        dialogId="bulk-delete"
        onCancel={onCancel}
        dualActions={[
          {
            label: 'Keep children on canvas',
            description: `Delete ${itemCount} selected item${itemCount > 1 ? 's' : ''}, children become root items`,
            loadingText: 'Deleting...',
            variant: 'primary',
            onClick: onDeleteOrphan,
          },
          {
            label: 'Delete all',
            description: `Delete all ${totalToDelete} items (selected + children)`,
            loadingText: 'Deleting...',
            variant: 'danger',
            onClick: onDeleteAll,
          },
        ]}
      />
    );
  }

  return (
    <ConfirmActionDialog
      title={`Delete ${itemCount} Item${itemCount > 1 ? 's' : ''}?`}
      message={message}
      dialogId="bulk-delete"
      onCancel={onCancel}
      action={{
        label: `Delete ${itemCount} Item${itemCount > 1 ? 's' : ''}`,
        loadingText: 'Deleting...',
        variant: 'danger',
        onClick: onDeleteOrphan,
      }}
    />
  );
}
