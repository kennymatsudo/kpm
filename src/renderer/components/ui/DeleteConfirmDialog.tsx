
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



  return (
  );
}
