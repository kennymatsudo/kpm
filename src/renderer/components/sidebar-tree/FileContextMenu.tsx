import type { FileNode } from '../../../shared/types';

interface FileContextMenuProps {
  x: number;
  y: number;
  path: string;
  node: FileNode;
  isFocused: boolean;
  onClose: () => void;
  onToggleFocus: () => void;
  onRename: () => void;
  onRevealInFinder: () => void;
  onView?: () => void;
  onDelete: () => void;
}

export function FileContextMenu({
  x,
  y,
  node,
  isFocused,
  onClose,
  onToggleFocus,
  onRename,
  onRevealInFinder,
  onView,
  onDelete,
}: FileContextMenuProps) {
  const isMarkdown = node.name.endsWith('.md');

  return (
      {/* View/Edit action (for markdown files) */}
      {isMarkdown && onView && (
        <>
            View / Edit
        </>
      )}

      {/* Focus action */}
        onClick={() => {
          onToggleFocus();
          onClose();
        }}
      >
        {isFocused ? 'Remove from context' : 'Add to context'}


      {/* Rename */}
        onClick={onRename}
        disabled={isClaudeMd}
      >
        Rename

      {/* Reveal in Finder */}
        Reveal in Finder


      {/* Delete */}
        onClick={onDelete}
        disabled={isClaudeMd}
      >
        Delete
  );
}
