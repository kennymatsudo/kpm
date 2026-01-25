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
  onCopyFullPath: () => void;
  onCopyRelativePath: () => void;
  onView?: () => void;
  onDelete: () => void;
  onLinkToConfluence?: () => void;
  onSyncConfluence?: () => void;
  isLinkedToConfluence?: boolean;
}

export function FileContextMenu({
  x,
  y,
  path: _path,
  node,
  isFocused,
  onClose,
  onToggleFocus,
  onRename,
  onRevealInFinder,
  onCopyFullPath,
  onCopyRelativePath,
  onView,
  onDelete,
  onLinkToConfluence,
  onSyncConfluence,
  isLinkedToConfluence,
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

      {/* Confluence sync options (markdown files) */}
      {isMarkdown && (
        <>
          {isLinkedToConfluence ? (
          ) : (
              onClick={() => {
                onLinkToConfluence?.();
                onClose();
              }}
            >
              Link to Confluence
          )}
        </>
      )}


      {/* Rename */}
        onClick={onRename}
        disabled={isClaudeMd}
      >
        Rename

      {/* Reveal in Finder */}
        Reveal in Finder

      {/* Copy Full Path */}
        Copy Full Path

      {/* Copy Relative Path */}
        Copy Relative Path


      {/* Delete */}
        onClick={onDelete}
        disabled={isClaudeMd}
      >
        Delete
  );
}
