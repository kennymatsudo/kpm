import { ConfirmActionDialog } from './ConfirmActionDialog';
import { trackerDeletionWarning } from '../tracker/shared/trackerDisplay';

interface DeleteConfirmDialogProps {
  itemTitle: string;
  descendantCount: number;
  /** Set when the item is linked to a tracker issue, to warn it'll be deleted there too. */
  trackerType?: string | null;
  onDeleteMoveToBacklog: () => void | Promise<void>;
  onDeleteAll: () => void | Promise<void>;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  itemTitle,
  descendantCount,
  trackerType,
  onDeleteMoveToBacklog,
  onDeleteAll,
  onCancel,
}: DeleteConfirmDialogProps) {
  const hasChildren = descendantCount > 0;

  const trackerWarning = trackerType ? (
    <div className="text-warning mt-2">The linked tracker issue {trackerDeletionWarning(trackerType)}</div>
  ) : null;

  const message = hasChildren ? (
    <>
      <span className="text-text-primary font-medium">"{itemTitle}"</span> has{' '}
      <span className="text-warning">
        {descendantCount} child item{descendantCount > 1 ? 's' : ''}
      </span>
      . Choose how to handle {descendantCount > 1 ? 'them' : 'it'}:
      {trackerWarning}
    </>
  ) : (
    <>
      Are you sure you want to delete{' '}
      <span className="text-text-primary font-medium">"{itemTitle}"</span>?
      {trackerWarning}
    </>
  );

  if (hasChildren) {
    return (
      <ConfirmActionDialog
        title="Delete Item?"
        message={message}
        dialogId="delete-dialog"
        onCancel={onCancel}
        dualActions={[
          {
            label: 'Keep children in the plan',
            description: 'Delete this item only, children become root items',
            loadingText: 'Deleting...',
            variant: 'primary',
            onClick: onDeleteMoveToBacklog,
            ariaLabel: 'Delete this item only and keep children in the plan',
          },
          {
            label: 'Delete all',
            description: `Delete this item and all ${descendantCount} child item${descendantCount > 1 ? 's' : ''}`,
            loadingText: 'Deleting...',
            variant: 'danger',
            onClick: onDeleteAll,
            ariaLabel: `Delete this item and all ${descendantCount} child items permanently`,
          },
        ]}
      />
    );
  }

  return (
    <ConfirmActionDialog
      title="Delete Item?"
      message={message}
      dialogId="delete-dialog"
      onCancel={onCancel}
      action={{
        label: 'Delete',
        loadingText: 'Deleting...',
        variant: 'danger',
        onClick: onDeleteMoveToBacklog,
        ariaLabel: 'Delete this item permanently',
      }}
    />
  );
}
