import { memo, useCallback, useEffect, useState } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import type { FileNode } from '../../../shared/types';
import { getParentPath } from '../../utils/path';
import { FileIcon, FocusIcon } from './FileIcon';
import { NewItemInput } from './NewItemInput';
import { ChevronRightIcon, LinkIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';

/** FileNode extended with optional phantom fields for inline creation rows. */
export type UIFileNode = FileNode & {
  _phantom?: boolean;
  _phantomType?: 'file' | 'folder';
};

export interface ProjectTreeNodeExtraProps {
  loadingPaths: Set<string>;
  activePath: string | null;
  openPaths: Set<string>;
  renamingPath: string | null;
  isPathFocused: (path: string) => boolean;
  isLinkedToConfluence: (path: string) => boolean;
  onOpen: (path: string, node: FileNode) => void | Promise<void>;
  onToggleFocus: (path: string, isDirectory: boolean) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  onRename: (oldPath: string, newPath: string) => Promise<FileNode | null>;
  onEndRename: () => void;
  onExternalDrop: (files: FileList, targetPath: string) => void | Promise<void>;
  onCreateSubmit?: (name: string) => void;
  onCreateCancel?: () => void;
}

type ProjectTreeNodeProps = NodeRendererProps<UIFileNode> & ProjectTreeNodeExtraProps;

export const ProjectTreeNode = memo(function ProjectTreeNode(props: ProjectTreeNodeProps) {
  if (props.node.data._phantom) {
    return (
      <NewItemInput
        type={props.node.data._phantomType ?? 'file'}
        indentPx={props.node.level * 16}
        onSubmit={props.onCreateSubmit ?? (() => {})}
        onCancel={props.onCreateCancel ?? (() => {})}
      />
    );
  }
  return <FileTreeRow {...props} />;
});

const FileTreeRow = memo(function FileTreeRow({
  node,
  dragHandle,
  loadingPaths,
  activePath,
  openPaths,
  renamingPath,
  isPathFocused,
  isLinkedToConfluence,
  onOpen,
  onToggleFocus,
  onContextMenu,
  onRename,
  onEndRename,
  onExternalDrop,
}: ProjectTreeNodeProps) {
  const [renameValue, setRenameValue] = useState(node.data.name);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const isLoading = loadingPaths.has(node.id);
  const isActiveFile = activePath === node.id;
  const isOpenFile = openPaths.has(node.id);
  const isFocused = isPathFocused(node.id);
  const hasConfluenceLink = isLinkedToConfluence(node.id);

  useEffect(() => {
    if (node.isEditing || renamingPath === node.id) {
      setRenameValue(node.data.name);
    }
  }, [node.isEditing, node.data.name, renamingPath, node.id]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const tree = node.tree;

      if (e.shiftKey) {
        const anchor = tree.state.nodes.selection.anchor ?? node.id;
        const rangeIds = tree.nodesBetween(anchor, node.id).map((rangeNode) => rangeNode.id);
        tree.setSelection({
          ids: rangeIds,
          anchor,
          mostRecent: node.id,
        });
        tree.focus(node, { scroll: false });
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        const nextIds = new Set(tree.selectedIds);
        if (node.isSelected) nextIds.delete(node.id);
        else nextIds.add(node.id);
        const ids = Array.from(nextIds);
        tree.setSelection({
          ids,
          anchor: tree.state.nodes.selection.anchor ?? node.id,
          mostRecent: node.id,
        });
        tree.focus(node, { scroll: false });
        return;
      }

      tree.setSelection({
        ids: [node.id],
        anchor: node.id,
        mostRecent: node.id,
      });
      tree.focus(node, { scroll: false });
      node.activate();
    },
    [node]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isEditing) return;
      void onOpen(node.id, node.data);
    },
    [node, onOpen]
  );

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      node.toggle();
    },
    [node]
  );

  const handleFocusClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFocus(node.id, node.data.isDirectory);
    },
    [node.id, node.data.isDirectory, onToggleFocus]
  );

  // Names truncate rather than widen the row, so hand the full name back on
  // hover, and only when it actually got cut off — a tooltip on every row would
  // fire the whole way down the tree.
  const handleNameHover = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      const span = e.currentTarget;
      span.title = span.scrollWidth > span.clientWidth ? node.data.name : '';
    },
    [node.data.name]
  );

  const handleContextMenuClick = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu(e, node.id);
    },
    [node.id, onContextMenu]
  );

  const handleRenameSubmit = useCallback(() => {
    if (renameValue && renameValue !== node.data.name) {
      const parentPath = getParentPath(node.id);
      const newPath = parentPath ? `${parentPath}/${renameValue}` : renameValue;
      void onRename(node.id, newPath);
    }
    node.reset();
    onEndRename();
  }, [renameValue, node, onRename, onEndRename]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameSubmit();
      } else if (e.key === 'Escape') {
        setRenameValue(node.data.name);
        node.reset();
        onEndRename();
      }
    },
    [handleRenameSubmit, node, onEndRename]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!node.data.isDirectory) return;
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsExternalDragOver(true);
    },
    [node.data.isDirectory]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!node.data.isDirectory) return;
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsExternalDragOver(true);
    },
    [node.data.isDirectory]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!node.data.isDirectory) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setIsExternalDragOver(false);
      }
    },
    [node.data.isDirectory]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!node.data.isDirectory) return;
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsExternalDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        void onExternalDrop(e.dataTransfer.files, node.id);
      }
    },
    [node.data.isDirectory, node.id, onExternalDrop]
  );

  const isCurrent = isActiveFile || node.isSelected;
  const isDropTarget = node.willReceiveDrop || isExternalDragOver;

  return (
    <div className="h-full px-2">
      <div
        ref={dragHandle}
        className={`
          group flex h-full items-center gap-2 px-3 py-1 rounded-sm relative box-border
          transition-colors duration-150 ease-out
          ${isDropTarget
            ? 'bg-accent-subtle ring-1 ring-inset ring-accent'
            : isCurrent
              ? 'bg-surface-selected'
              : 'hover:bg-surface-3'}
          ${node.isDragging ? 'opacity-50' : ''}
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenuClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* The rail marks a file open in the editor; selection is carried by the
            wash alone, so the two states never rely on the same signal. One
            carrier, two strengths: full accent is the tab you are looking at,
            faded is a tab waiting in the strip. */}
        {isOpenFile && (
          <div
            className={`absolute top-1 bottom-1 w-[2px] rounded-full ${
              isActiveFile ? 'bg-accent' : 'bg-accent/40'
            }`}
            style={{ left: `${node.level * 16 + 6}px` }}
          />
        )}

        {/* One guide per ancestor, each aligned to that ancestor's chevron centre. */}
        {node.level > 0 &&
          Array.from({ length: node.level }, (_, index) => (
            <div
              key={index}
              className="absolute top-0 bottom-0 w-px bg-border-default"
              style={{ left: `${16 + index * 16}px` }}
            />
          ))}

        <div className="flex items-center gap-2 flex-1 min-w-0" style={{ paddingLeft: `${node.level * 16}px` }}>
          {node.isInternal ? (
            <button
              onClick={handleChevronClick}
              className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-primary rounded-sm transition-colors flex-shrink-0 -ml-1"
              disabled={isLoading}
              aria-expanded={node.isOpen}
              aria-label={`${node.isOpen ? 'Collapse' : 'Expand'} ${node.data.name}`}
            >
              {isLoading ? (
                <div className="w-3 h-3 rounded-full border-[1.5px] border-border-default border-t-accent spinner-refined" />
              ) : (
                <ChevronRightIcon
                  className={`w-3 h-3 transition-transform duration-200 ${node.isOpen ? 'rotate-90' : ''}`}
                />
              )}
            </button>
          ) : (
            <div className="w-4 h-4 flex-shrink-0" />
          )}

          <FileIcon node={node.data} isExpanded={node.isOpen} />

          {node.isEditing ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleRenameKeyDown}
              className="flex-1 min-w-0 bg-surface-2 border border-border-default rounded-sm px-2 py-0.5
                         text-sm text-text-primary
                         focus:outline-none focus:border-accent focus:ring-2 focus:ring-focus-ring
                         transition-colors"
              aria-label={`Rename ${node.data.name}`}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onMouseEnter={handleNameHover}
              className={`flex-1 min-w-0 text-sm truncate transition-colors ${
                node.data.isIgnored
                  ? 'text-text-muted'
                  : isCurrent
                    ? 'text-text-primary font-medium'
                    : 'text-text-secondary group-hover:text-text-primary'
              }`}
            >
              {node.data.name}
            </span>
          )}

          {hasConfluenceLink && (
            <span
              className="flex-shrink-0 text-info"
              role="img"
              aria-label="Linked to Confluence"
              title="Linked to Confluence"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </span>
          )}

          <Tooltip content={isFocused ? 'Remove from context' : 'Add to context'} side="top">
            <button
              onClick={handleFocusClick}
              aria-label={`${isFocused ? 'Remove from context' : 'Add to context'}: ${node.data.name}`}
              className={`
                w-6 h-6 flex items-center justify-center rounded-sm flex-shrink-0
                transition-[opacity,color,background-color] duration-150
                ${isFocused
                  ? 'text-accent hover:bg-surface-4'
                  : 'text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-4 hover:text-accent'
                }
              `}
            >
              <FocusIcon isFocused={isFocused} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});
