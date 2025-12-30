import type { TreeNode } from '../../utils/planHierarchy';
import { StatusSelector } from '../ui/StatusSelector';
import { getStatusCategory } from '../../constants/statusConfig';
import { MAX_DEPTH } from '../../constants/planCardStyles';

/**
 * TreeView - A compact outline view for plan items with drag-and-drop
 *
 * Purpose: Quick scanning, keyboard navigation, hierarchy comprehension, and reorganization.
 */

// Depth-based styling - subtle left border colors matching card depth colors
const depthColors = [
  'border-l-[var(--color-depth-0)]', // purple - root
  'border-l-[var(--color-depth-1)]', // blue
  'border-l-[var(--color-depth-2)]', // emerald
  'border-l-[var(--color-depth-3)]', // amber
  'border-l-[var(--color-depth-4)]', // pink
] as const;

const depthTextColors = [
  'text-[var(--color-depth-0)]',
  'text-[var(--color-depth-1)]',
  'text-[var(--color-depth-2)]',
  'text-[var(--color-depth-3)]',
  'text-[var(--color-depth-4)]',
] as const;

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  isSelected: boolean;
  isFocused: boolean;
  isExpanded: boolean;
  searchQuery: string;
  isDragging: boolean;
  dropPosition: DropPosition;
  canDrop: boolean;
  onSelect: (id: string, addToSelection: boolean) => void;
  onEdit: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onDragStart: (e: React.DragEvent, node: TreeNode) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, nodeId: string, position: DropPosition) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string, position: DropPosition) => void;
}

const TreeRow = memo(function TreeRow({
  node,
  depth,
  isSelected,
  isFocused,
  isExpanded,
  searchQuery,
  isDragging,
  dropPosition,
  canDrop,
  onSelect,
  onEdit,
  onToggleExpand,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: TreeRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const clampedDepth = Math.min(depth, MAX_DEPTH);
  const hasChildren = node.children.length > 0;

  // Derive effective status
  const effectiveStatus = useMemo(
    () => node.status_category ?? getStatusCategory(node.external_status, node.external_type),
    [node.status_category, node.external_status, node.external_type]
  );

  // Search highlighting
  const isSearchActive = searchQuery.trim().length > 0;
  const titleMatches = isSearchActive && node.title.toLowerCase().includes(searchQuery.toLowerCase());
  const keyMatches = isSearchActive && node.external_key?.toLowerCase().includes(searchQuery.toLowerCase());
  const directMatch = titleMatches || keyMatches;

  // Highlight matching text
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-warning/30 text-warning rounded px-0.5">{part}</mark>
        : part
    );


  // Determine drop position from mouse Y within element
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!rowRef.current) return;

    const rect = rowRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // Divide row into thirds: top = before, middle = inside, bottom = after
    let position: DropPosition;
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    onDragOver(e, node.id, position);
  }, [node.id, onDragOver]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop(e, node.id, dropPosition);
  }, [node.id, dropPosition, onDrop]);

  return (
    <div className="relative">
      {/* Drop indicator - before */}
      {dropPosition === 'before' && canDrop && (
        <div
          className="absolute left-0 right-0 top-0 h-0.5 bg-accent z-10 rounded-full"
          style={{ marginLeft: `${12 + depth * 20}px` }}
        />
      )}

      <div
        ref={rowRef}
        draggable
        className={`
          group flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing
          border-l-2 ${depthColors[clampedDepth]}
          ${isDragging ? 'opacity-40' : ''}
          ${dropPosition === 'inside' && canDrop
            ? 'bg-accent/15 border-l-accent ring-1 ring-inset ring-accent/30'
            : isSelected
              ? 'bg-accent/10 border-l-accent'
              : 'hover:bg-surface-2 border-l-opacity-60 hover:border-l-opacity-100'}
          ${isFocused ? 'ring-1 ring-inset ring-accent/50' : ''}
          ${isSearchActive && !directMatch ? 'opacity-40' : ''}
        `}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id, e.metaKey || e.ctrlKey);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit(node.id);
        }}
        onContextMenu={(e) => onContextMenu(e, node.id)}
        onDragStart={(e) => onDragStart(e, node)}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag handle indicator */}
        <div className="opacity-0 group-hover:opacity-40 transition-opacity -ml-1 mr-0.5">
          <svg className="w-3 h-3 text-text-muted" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.5" />
            <circle cx="11" cy="4" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="11" cy="12" r="1.5" />
          </svg>
        </div>

        {/* Expand/Collapse chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
          className={`
            w-4 h-4 flex items-center justify-center rounded
            transition-all duration-200
            ${hasChildren
              ? 'hover:bg-surface-3 text-text-tertiary hover:text-text-secondary'
              : 'text-transparent'}
          `}
          tabIndex={-1}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Status indicator */}
        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
          <StatusSelector
            value={effectiveStatus}
            onChange={(status) => updateStatusCategory(node.id, status)}
            size="sm"
          />
        </div>

        {/* Title */}
        <span className={`
          ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'}
        `}>
          {isSearchActive && directMatch ? highlightText(node.title, searchQuery) : node.title}
        </span>

        {/* Child count badge */}
        {countableChildren > 0 && (
          <span className={`
            ${depthTextColors[clampedDepth]} bg-surface-3
            opacity-60 group-hover:opacity-100 transition-opacity
          `}>
            {countableChildren}
          </span>
        )}

        {/* External key badge */}
        {node.external_key && (
          <a
            href={node.external_url ?? '#'}
            onClick={(e) => {
              e.stopPropagation();
              if (node.external_url) {
                e.preventDefault();
                window.open(node.external_url, '_blank');
              }
            }}
            className="
              bg-info-muted text-info
              hover:bg-info/20 transition-colors
            "
          >
          </a>
        )}

        {/* Edit button - appears on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(node.id);
          }}
          className="
            p-1 hover:bg-surface-3 rounded
            transition-opacity
          "
        >
          <svg className="w-3 h-3 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>

      {/* Drop indicator - after */}
      {dropPosition === 'after' && canDrop && (
        <div
          className="absolute left-0 right-0 bottom-0 h-0.5 bg-accent z-10 rounded-full"
          style={{ marginLeft: `${12 + depth * 20}px` }}
        />
      )}
    </div>
  );
});

interface TreeBranchProps {
  nodes: TreeNode[];
  depth: number;
  parentId: string | null;
  selectedIds: Set<string>;
  focusedItemId: string | null;
  expandedIds: Set<string>;
  searchQuery: string;
  dragState: DragState | null;
  onSelect: (id: string, addToSelection: boolean) => void;
  onEdit: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onDragStart: (e: React.DragEvent, node: TreeNode) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, nodeId: string, position: DropPosition) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string, position: DropPosition) => void;
}

const TreeBranch = memo(function TreeBranch({
  nodes,
  depth,
  selectedIds,
  focusedItemId,
  expandedIds,
  searchQuery,
  dragState,
  onSelect,
  onEdit,
  onToggleExpand,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: TreeBranchProps) {
  // Check if an ID is a descendant of a node
  const isDescendantOf = useCallback((nodeId: string, ancestorNode: TreeNode): boolean => {
    const checkChildren = (children: TreeNode[]): boolean => {
      for (const child of children) {
        if (child.id === nodeId) return true;
        if (checkChildren(child.children)) return true;
      }
      return false;
    };
    return checkChildren(ancestorNode.children);
  }, []);

  return (
    <div className="tree-branch">
      {nodes.map(node => {
        const isExpanded = expandedIds.has(node.id);
        const hasChildren = node.children.length > 0;
        const isDragging = dragState?.draggedId === node.id;
        const isDropTarget = dragState?.dropTargetId === node.id;
        const dropPosition = isDropTarget ? dragState?.dropPosition ?? null : null;

        // Check if this is a valid drop target
        // Can't drop on self or descendants
        const canDrop = dragState !== null &&
          dragState.draggedId !== node.id &&
          !isDescendantOf(node.id, dragState.draggedNode) &&
          // Can't nest beyond max depth (when dropping inside)
          (dropPosition !== 'inside' || depth < MAX_DEPTH);

        // During search, auto-expand if descendants match
        const isSearchActive = searchQuery.trim().length > 0;
        const shouldShowChildren = hasChildren && (isExpanded || (isSearchActive && hasMatchingDescendant));

        // Hide items that don't match search (and have no matching descendants)
        if (isSearchActive && !hasMatchingDescendant) return null;

        return (
          <div key={node.id} className="tree-node">
            <TreeRow
              node={node}
              depth={depth}
              isSelected={selectedIds.has(node.id)}
              isFocused={focusedItemId === node.id}
              isExpanded={isExpanded || (isSearchActive && hasMatchingDescendant)}
              searchQuery={searchQuery}
              isDragging={isDragging}
              dropPosition={dropPosition}
              canDrop={canDrop}
              onSelect={onSelect}
              onEdit={onEdit}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />

            {/* Children with smooth height animation */}
            <div
              className={`
                overflow-hidden transition-all duration-200 ease-out
                ${shouldShowChildren ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}
              `}
            >
              {hasChildren && (
                <TreeBranch
                  nodes={node.children}
                  depth={depth + 1}
                  parentId={node.id}
                  selectedIds={selectedIds}
                  focusedItemId={focusedItemId}
                  expandedIds={expandedIds}
                  searchQuery={searchQuery}
                  dragState={dragState}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onToggleExpand={onToggleExpand}
                  onContextMenu={onContextMenu}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export interface TreeViewProps {
  items: TreeNode[];
  selectedIds: Set<string>;
  focusedItemId: string | null;
  searchQuery: string;
  onEditItem: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, selectedIds: Set<string>) => void;
  onReparent?: (itemIds: string[], newParentId: string | null) => void;
}

  items,
  selectedIds,
  focusedItemId,
  searchQuery,
  onSelectItem,
  onEditItem,
  onContextMenu,
  onReparent,
}: TreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body) return;

      // E to edit selected item
      if (e.key === 'e' || e.key === 'E') {
        if (selectedIds.size === 1) {
          const selectedId = Array.from(selectedIds)[0];
          onEditItem(selectedId);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, onEditItem]);

  // Empty state
  if (items.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-text-muted"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <p className="text-sm">No items in plan</p>
          <p className="text-xs text-text-muted mt-1">Add items from the backlog to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-surface-0"
    >
      {/* Tree controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-surface-1">
        <button
          onClick={handleExpandAll}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          title="Expand all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          onClick={handleCollapseAll}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          title="Collapse all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5m0 17L9 15m0 0V19.5M9 15H4.5m11 0h4.5m-4.5 0V19.5m0-4.5l5.5 5.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5" />
          </svg>
        </button>
        <span className="text-xs text-text-muted ml-auto">
          {items.length} root item{items.length !== 1 ? 's' : ''}
          {dragState && <span className="ml-2 text-accent">• Drag to reparent</span>}
        </span>
      </div>

      {/* Scrollable tree content */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        <TreeBranch
          nodes={items}
          depth={0}
          parentId={null}
          selectedIds={selectedIds}
          focusedItemId={focusedItemId}
          expandedIds={expandedIds}
          searchQuery={searchQuery}
          dragState={dragState}
          onContextMenu={handleContextMenu}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />

        {/* Drop zone at bottom - for moving to root */}
        {dragState && (
          dragState.isUnderJiraParent ? (
            <div className="h-12 mx-3 mt-2 border-2 border-dashed border-danger/20 rounded-lg flex items-center justify-center text-xs text-danger/50">
            </div>
          ) : (
            <div
              className="h-12 mx-3 mt-2 border-2 border-dashed border-accent/30 rounded-lg flex items-center justify-center text-xs text-accent/60 hover:border-accent/50 hover:bg-accent/5 transition-colors"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onReparent) {
                  onReparent([dragState.draggedId], null);
                }
                setDragState(null);
              }}
            >
              Drop here to move to root level
            </div>
          )
        )}
      </div>
    </div>
  );
