import { memo, useCallback, useEffect, useState } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import type { FileNode } from '../../../shared/types';
import { isEditableFile } from '../../stores';
import { getParentPath } from '../../utils/path';
import { FileIcon, FocusIcon } from './FileIcon';
import { Tooltip } from '../ui/Tooltip';

/** FileNode extended with optional phantom fields for inline creation rows. */
export type UIFileNode = FileNode & {
  _phantom?: boolean;
  _phantomType?: 'file' | 'folder';
};

export interface ProjectTreeNodeExtraProps {
  loadingPaths: Set<string>;
  editingPath: string | null;
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

function PhantomCreateRow({
  level,
  type,
  onSubmit,
  onCancel,
}: {
  level: number;
  type: 'file' | 'folder';
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  }, [value, onSubmit, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit();
      else if (e.key === 'Escape') onCancel();
    },
    [handleSubmit, onCancel]
  );

  return (
    <div className="h-full px-2">
      <div className="flex h-full items-center gap-2 px-3 rounded-lg bg-surface-2/40 ring-1 ring-accent/20">
        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          style={{ paddingLeft: `${level * 16}px` }}
        >
          <div className="w-4 h-4 flex-shrink-0" />
          {type === 'folder' ? (
            <svg
              className="w-4 h-4 flex-shrink-0 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 flex-shrink-0 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-surface-2 rounded-md px-2 py-0.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            placeholder={type === 'folder' ? 'Folder name' : 'File name'}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
}

export const ProjectTreeNode = memo(function ProjectTreeNode(props: ProjectTreeNodeProps) {
  if (props.node.data._phantom) {
    return (
      <PhantomCreateRow
        level={props.node.level}
        type={props.node.data._phantomType ?? 'file'}
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
  editingPath,
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
  const isEditingFile = editingPath === node.id;
  const isFocused = isPathFocused(node.id);
  const hasConfluenceLink = isLinkedToConfluence(node.id);
  const isEditable = !node.data.isDirectory && isEditableFile(node.data.name);

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

  return (
    <div className="h-full px-2">
      <div
        ref={dragHandle}
        className={`
          group flex h-full items-center gap-2 px-3 py-1 rounded-lg relative box-border
          transition-all duration-150 ease-out
          ${isEditingFile ? 'bg-accent/10' : node.isSelected ? 'bg-surface-4' : 'hover:bg-surface-2/60'}

          ${node.willReceiveDrop ? 'bg-accent/20 ring-2 ring-inset ring-accent ring-dashed' : ''}
          ${isExternalDragOver ? 'bg-accent/20 ring-2 ring-inset ring-accent ring-dashed' : ''}
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenuClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {(isEditingFile || node.isSelected) && (
          <div
            className={`absolute top-1 bottom-1 w-[2px] rounded-full ${isEditingFile ? 'bg-accent' : 'bg-accent/40'}`}
            style={{ left: `${node.level * 16 + 6}px` }}
          />
        )}

        {node.level > 0 &&
          Array.from({ length: node.level }, (_, index) => (
            <div
              key={index}
              className="absolute top-0 bottom-0 w-px bg-border-default"
              style={{ left: `${20 + index * 16}px` }}
            />
          ))}

        <div className="flex items-center gap-2 flex-1 min-w-0" style={{ paddingLeft: `${node.level * 16}px` }}>
          {node.isInternal ? (
            <button
              onClick={handleChevronClick}
              className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-primary rounded transition-all flex-shrink-0 -ml-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-3 h-3 rounded-full border-[1.5px] border-accent/30 border-t-accent spinner-refined" />
              ) : (
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${node.isOpen ? 'rotate-90' : ''}`}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                </svg>
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
              className="flex-1 bg-surface-2 rounded-md px-2 py-0.5 text-sm text-text-primary
                         focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={`
                flex-1 text-sm truncate transition-colors
                ${isEditable ? 'text-text-primary' : 'text-text-secondary'}
                ${node.isSelected || isEditingFile ? 'text-text-primary' : ''}
              `}
            >
              {node.data.name}
            </span>
          )}

          {hasConfluenceLink && (
            <div
              className="flex-shrink-0 text-blue-400/70 transition-colors"
              title="Linked to Confluence"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
          )}

          <Tooltip content={isFocused ? 'Remove from context' : 'Add to context'} side="top">
            <button
              onClick={handleFocusClick}
              tabIndex={isFocused ? 0 : -1}
              className={`
                ${isFocused
                  ? 'text-accent hover:bg-surface-3'
                  : 'text-text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-accent'
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
