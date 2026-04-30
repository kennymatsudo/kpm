import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Tree, type NodeApi, type TreeApi } from 'react-arborist';
import type { FileNode } from '../../../shared/types';
import { getParentPath } from '../../utils/path';
import { SidebarSection } from './SidebarSection';
import { NewItemInput } from './NewItemInput';
import { areSetsEqual, getOpenPathSet } from './treeUtils';

interface ProjectFilesTreeSectionProps {
  projectNodes: FileNode[];
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  selectedPaths: Set<string>;
  editingPath: string | null;
  renamingPath: string | null;
  creatingItem: { type: 'file' | 'folder'; parentPath: string } | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  addButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleAddMenu: () => void;
  isPathFocused: (path: string) => boolean;
  isLinkedToConfluence: (path: string) => boolean;
  setSelectedPaths: (paths: string[]) => void;
  onOpen: (path: string, node: FileNode) => void | Promise<void>;
  onToggleExpand: (path: string) => void;
  onToggleFocus: (path: string, isDirectory: boolean) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  onRename: (oldPath: string, newPath: string) => Promise<FileNode | null>;
  onEndRename: () => void;
  onExternalDrop: (files: FileList, targetPath: string) => void | Promise<void>;
  onInternalMove: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  onEmptySpaceContextMenu: (e: React.MouseEvent) => void;
  onCreateSubmit: (name: string) => void;
  onCreateCancel: () => void;
}

export const ProjectFilesTreeSection = memo(function ProjectFilesTreeSection({
  projectNodes,
  expandedPaths,
  loadingPaths,
  selectedPaths,
  editingPath,
  renamingPath,
  creatingItem,
  isCollapsed,
  onToggleCollapsed,
  addButtonRef,
  onToggleAddMenu,
  isPathFocused,
  isLinkedToConfluence,
  setSelectedPaths,
  onOpen,
  onToggleExpand,
  onToggleFocus,
  onContextMenu,
  onRename,
  onEndRename,
  onExternalDrop,
  onInternalMove,
  onEmptySpaceContextMenu,
  onCreateSubmit,
  onCreateCancel,
}: ProjectFilesTreeSectionProps) {
  const treeContainerRef = useRef<HTMLDivElement | null>(null);
  const syncingOpenPathsRef = useRef(new Set<string>());
  const [treeHeight, setTreeHeight] = useState(0);
  const [isRootExternalDragActive, setIsRootExternalDragActive] = useState(false);

  const initialOpenState = useMemo(
    () => Object.fromEntries(Array.from(expandedPaths).map((path) => [path, true])),
    [expandedPaths]
  );
  const showEmptyState = projectNodes.length === 0 && !creatingItem;
  const shouldMeasureTree = !isCollapsed && !showEmptyState;

  useLayoutEffect(() => {
    if (!shouldMeasureTree) {
      setTreeHeight(0);
      return;
    }

    const element = treeContainerRef.current;
    if (!element) {
      setTreeHeight(0);
      return;
    }

    const updateSize = () => {
      const next = element.getBoundingClientRect().height;
      if (next > 0) setTreeHeight(next);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldMeasureTree]);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;

    const currentSelection = new Set(tree.selectedIds);
    if (areSetsEqual(currentSelection, selectedPaths)) return;

    const paths = Array.from(selectedPaths);
    tree.setSelection({
      ids: paths,
      anchor: paths[0] ?? null,
      mostRecent: paths[paths.length - 1] ?? null,
    });
  }, [selectedPaths, projectNodes]);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;

    const openIds = getOpenPathSet(tree);

    if (areSetsEqual(openIds, expandedPaths)) return;

    for (const path of expandedPaths) {
      if (!openIds.has(path)) {
        syncingOpenPathsRef.current.add(path);
        tree.open(path);
      }
    }

    for (const path of openIds) {
      if (!expandedPaths.has(path)) {
        syncingOpenPathsRef.current.add(path);
        tree.close(path);
      }
    }

  useEffect(() => {
    if (!renamingPath) return;
    const tree = treeRef.current;
    if (!tree) return;
    void tree.get(renamingPath)?.edit();
  }, [renamingPath, projectNodes]);

  const handleTreeSelect = useCallback(
    (nodes: { id: string }[]) => {
      setSelectedPaths(nodes.map((node) => node.id));
    },
    [setSelectedPaths]
  );

  const handleTreeMove = useCallback(
    async ({
      dragIds,
      parentId,
    }: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      const targetFolderPath = parentId ?? '';
      const rootDragIds = dragIds.filter(
        (dragId) => !dragIds.some((otherId) => otherId !== dragId && dragId.startsWith(otherId + '/'))
      );
      for (const dragId of rootDragIds) {
        await onInternalMove(dragId, targetFolderPath);
      }
    },
    [onInternalMove]
  );

  const handleTreeRename = useCallback(
    async ({ id, name }: { id: string; name: string }) => {
      const parentPath = getParentPath(id);
      const newPath = parentPath ? `${parentPath}/${name}` : name;
      await onRename(id, newPath);
      onEndRename();
    },
    [onRename, onEndRename]
  );

  const handleToggle = useCallback(
    (path: string) => {
      if (syncingOpenPathsRef.current.has(path)) {
        syncingOpenPathsRef.current.delete(path);
        return;
      }
      onToggleExpand(path);
    },
    [onToggleExpand]
  );

  const disableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: NodeApi<FileNode>;
      dragNodes: NodeApi<FileNode>[];
      index: number;
    }) => {
      if (parentNode.isRoot) return false;
      return dragNodes.some(
        (dragNode) => dragNode.id === parentNode.id || dragNode.isAncestorOf(parentNode)
      );
    },
    []
  );

  const handleRootDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setIsRootExternalDragActive(true);
  }, []);

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsRootExternalDragActive(true);
  }, []);

  const handleRootDragLeave = useCallback((e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsRootExternalDragActive(false);
    }
  }, []);

  const handleRootDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setIsRootExternalDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        void onExternalDrop(e.dataTransfer.files, '');
      }
    },
    [onExternalDrop]
  );

  return (
    <SidebarSection
      title="Project Files"
      isCollapsed={isCollapsed}
      onToggleCollapsed={onToggleCollapsed}
      isDropZoneActive={isRootExternalDragActive}
      className="flex-1 min-h-0"
      action={
        <button
          ref={addButtonRef}
          onClick={onToggleAddMenu}
          className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
          title="New file or folder"
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
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      }
    >
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden pb-2"
        onContextMenu={onEmptySpaceContextMenu}
        onDragEnter={handleRootDragEnter}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        {creatingItem?.parentPath === '' && (
          <div className="flex-none">
            <NewItemInput
              type={creatingItem.type}
              onSubmit={onCreateSubmit}
              onCancel={onCreateCancel}
            />
          </div>
        )}

        {showEmptyState ? (
          <div className="flex items-center justify-center h-24 p-6">
            <div className="text-center">
              <p className="text-sm text-text-muted">No project files</p>
            </div>
          </div>
        ) : (
          <div ref={treeContainerRef} className="flex-1 min-h-0">
            {renderTree && (
                ref={treeRef}
                idAccessor={(node) => node.path}
                width="100%"
                height={treeHeight}
                indent={16}
                rowHeight={32}
                openByDefault={false}
                initialOpenState={initialOpenState}
                onSelect={handleTreeSelect}
                onToggle={handleToggle}
                onMove={handleTreeMove}
                onRename={handleTreeRename}
                disableDrop={disableDrop}
                overscanCount={8}
              >
                {(props) => (
                  <ProjectTreeNode
                    {...props}
                    loadingPaths={loadingPaths}
                    editingPath={editingPath}
                    renamingPath={renamingPath}
                    isPathFocused={isPathFocused}
                    isLinkedToConfluence={isLinkedToConfluence}
                    onOpen={onOpen}
                    onToggleFocus={onToggleFocus}
                    onContextMenu={onContextMenu}
                    onRename={onRename}
                    onEndRename={onEndRename}
                    onExternalDrop={onExternalDrop}
                  />
                )}
              </Tree>
            )}
          </div>
        )}
      </div>
    </SidebarSection>
  );
});
