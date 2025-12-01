
interface DeleteConfirmDialogProps {
  itemTitle: string;
  descendantCount: number;
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
  );
}
