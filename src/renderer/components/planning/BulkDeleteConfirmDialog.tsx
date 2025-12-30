import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';

interface BulkDeleteConfirmDialogProps {
  itemCount: number;
  descendantCount: number;
  onDeleteOrphan: () => void;
  onDeleteAll: () => void;
  onCancel: () => void;
}

export function BulkDeleteConfirmDialog({
  itemCount,
  descendantCount,
  onDeleteOrphan,
  onDeleteAll,
  onCancel,
}: BulkDeleteConfirmDialogProps) {
  const hasDescendants = descendantCount > 0;
  const totalToDelete = itemCount + descendantCount;

  const message = hasDescendants ? (
    <>
      The selected items have{' '}
      <span className="text-warning">
        {descendantCount} child item{descendantCount > 1 ? 's' : ''}
      </span>
      . Choose how to handle them:
    </>
  ) : (
    <>
      Are you sure you want to delete{' '}
      <span className="text-text-primary font-medium">
        {itemCount} item{itemCount > 1 ? 's' : ''}
      </span>
      ?
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
            variant: 'primary',
            onClick: onDeleteOrphan,
          },
          {
            label: 'Delete all',
            description: `Delete all ${totalToDelete} items (selected + children)`,
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
        variant: 'danger',
        onClick: onDeleteOrphan,
      }}
    />
  );
}
