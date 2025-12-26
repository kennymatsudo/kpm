import { ConfirmActionDialog } from './ConfirmActionDialog';

interface DeleteConfirmDialogProps {
  itemTitle: string;
  descendantCount: number;
  onDeleteMoveToBacklog: () => void | Promise<void>;
  onDeleteAll: () => void | Promise<void>;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  itemTitle,
  descendantCount,
  onDeleteMoveToBacklog,
  onDeleteAll,
  onCancel,
}: DeleteConfirmDialogProps) {
  const hasChildren = descendantCount > 0;

  const message = hasChildren ? (
    <>
      <span className="text-text-primary font-medium">"{itemTitle}"</span> has{' '}
      <span className="text-warning">
        {descendantCount} child item{descendantCount > 1 ? 's' : ''}
      </span>
      . Choose how to handle {descendantCount > 1 ? 'them' : 'it'}:
    </>
  ) : (
    <>
      Are you sure you want to delete{' '}
      <span className="text-text-primary font-medium">"{itemTitle}"</span>?
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
            label: 'Move children to backlog',
            description: 'Delete this item only, children become backlog items',
            loadingText: 'Moving to backlog...',
            variant: 'primary',
            onClick: onDeleteMoveToBacklog,
            ariaLabel: 'Delete this item only and move children to backlog',
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
