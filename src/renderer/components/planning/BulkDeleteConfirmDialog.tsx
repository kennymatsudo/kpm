
interface BulkDeleteConfirmDialogProps {
  itemCount: number;
  descendantCount: number;
  onDeleteAll: () => void;
  onCancel: () => void;
}

export function BulkDeleteConfirmDialog({
  itemCount,
  descendantCount,
  onDeleteAll,
  onCancel,
}: BulkDeleteConfirmDialogProps) {
  const hasDescendants = descendantCount > 0;
  const totalToDelete = itemCount + descendantCount;

  );
}
