import { m, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import type { PlanItem } from '../../../shared/types';
import { PlanCard } from './PlanCard';
import { GroupContainer } from './GroupContainer';
import { CanvasContextMenu } from './CanvasContextMenu';
import { useGroupStore, useExportStore } from '../../stores';
import { Z_INDEX } from '../../constants/zIndex';

interface CanvasProps {
  projectId: string;
  /** Items to display (may be filtered by search) */
  items: PlanItem[];
  selectedItemIds: Set<string>;
  focusedItemId: string | null;
  /** Search query for filtering/highlighting cards */
  searchQuery?: string;
  onSelectItem: (itemId: string | null, addToSelection?: boolean) => void;
  onEditItem: (itemId: string) => void;
  onAddToContext?: (itemId: string) => void;
  onCreateItem?: (canvasPosition: { x: number; y: number }) => void;
  onReparent: (itemIds: string[], newParentId: string | null) => Promise<void>;
  onUpdatePosition: (itemId: string, x: number, y: number) => void;
  onUpdatePositions?: (updates: { id: string; x: number; y: number }[]) => Promise<void>;
  onAutoLayout: (options?: AutoLayoutOptions) => Promise<void>;
  /** Assign/unassign items to a group (groupId = null to unassign) */
  onAssignToGroup?: (itemIds: string[], groupId: string | null) => Promise<void>;
}

  projectId,
  items,
  selectedItemIds,
  focusedItemId,
  searchQuery = '',
  onSelectItem,
  onEditItem,
  onAddToContext,
  onCreateItem,
  onReparent,
  onUpdatePosition,
  onUpdatePositions,
  onAutoLayout,
  onAssignToGroup,
}: CanvasProps) {
  const {
    groups,
    createGroup,
    updateGroupPosition,
    saveGroupUpdates,
    deleteGroup,

  const { queuedItemIds, recentlyImportedIds } = useExportStore(
    useShallow((state) => ({
      queuedItemIds: state.queuedItemIds,
      recentlyImportedIds: state.recentlyImportedIds,
    }))
  );

  const {
    zoom,
    effectiveZoom,
    setZoom,
    panOffset,
    setPanOffset,
    isPanning,
    containerRef,
    resetView,
    screenToCanvas,
    panHandlers,
  } = useCanvasViewport({ projectId, items, groups });


  const selectionSignaturesRef = useRef<Map<string, string>>(new Map());



  // Apply group layout - items in groups snap to grid positions when not dragging
  useEffect(() => {
    if (draggingGroupId) return;

    const { idealPositions } = groupLayoutInfo;
    if (idealPositions.size === 0) return;

    const itemsToUpdate: { id: string; x: number; y: number }[] = [];

    for (const [itemId, idealPos] of idealPositions) {
      const item = itemMap.get(itemId);
      if (!item) continue;

      const currentX = item.position_x ?? 0;
      const currentY = item.position_y ?? 0;
      const dx = Math.abs(currentX - idealPos.x);
      const dy = Math.abs(currentY - idealPos.y);

      if (dx > 1 || dy > 1) {
        itemsToUpdate.push({ id: itemId, x: idealPos.x, y: idealPos.y });
      }
    }

    if (itemsToUpdate.length === 0) return;

    if (onUpdatePositions) {
      void onUpdatePositions(itemsToUpdate);
      return;
    }

    for (const { id, x, y } of itemsToUpdate) {
      onUpdatePosition(id, x, y);
    }
  }, [groupLayoutInfo, itemMap, onUpdatePosition, onUpdatePositions, draggingGroupId]);

  const selectionSignatures = useMemo(() => {
    const signatures = new Map<string, string>();
    const buildSignature = (node: TreeNode): string[] => {
      const collected: string[] = [];
      if (selectedItemIds.has(node.id)) {
        collected.push(node.id);
      }

      for (const child of node.children) {
        const childIds = buildSignature(child);
        if (childIds.length) {
          collected.push(...childIds);
        }
      }

      signatures.set(node.id, collected.join('|'));
      return collected;
    };

    itemsWithPositions.forEach(buildSignature);
    return signatures;
  }, [itemsWithPositions, selectedItemIds]);

  useEffect(() => {
    selectionSignaturesRef.current = selectionSignatures;
  }, [selectionSignatures]);



  const handleCardDrop = useCallback((droppedItemIds: string[], targetParentId: string) => {
    void onReparent(droppedItemIds, targetParentId);
  }, [onReparent]);

  const getSelectedIds = useCallback(() => selectionRef.current, []);
  const getSelectionSignature = useCallback((id: string) => selectionSignaturesRef.current.get(id) ?? '', []);

  const handleGroupNameChange = useCallback((groupId: string, name: string) => {
    void saveGroupUpdates(groupId, { name });
  }, [saveGroupUpdates]);

  const handleGroupCollapseChange = useCallback((groupId: string, isCollapsed: boolean) => {
    void saveGroupUpdates(groupId, { is_collapsed: isCollapsed });
  }, [saveGroupUpdates]);


  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      data-testid="canvas-viewport"
      role="region"
      aria-label="Plan canvas"
      onDragOver={handleDragOver}
      onDrop={(e) => {
        e.preventDefault();
        setDragPreview(null);
        setHoveredGroupId(null);
        void handleCanvasDrop(e);
      }}
      onDragEnd={() => {
        setHoveredGroupId(null);
      }}
      onClick={(e) => {
          onSelectItem(null);
          setSelectedGroupId(null);
        }
      }}
      onMouseMove={panHandlers.onMouseMove}
      onMouseUp={panHandlers.onMouseUp}
      onMouseLeave={panHandlers.onMouseLeave}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-surface-2 rounded-lg p-1 border border-border-default shadow-sm">
        <button
          onClick={() => setZoom(z => Math.max(ZOOM.MIN, z - ZOOM.STEP))}
          className="p-1.5 hover:bg-surface-3 rounded text-text-tertiary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-xs text-text-muted w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(ZOOM.MAX, z + ZOOM.STEP))}
          className="p-1.5 hover:bg-surface-3 rounded text-text-tertiary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="w-px h-4 bg-border-subtle mx-1" />
        <button
          onClick={resetView}
          className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-3 rounded transition-colors"
        >
          Reset View
        </button>
        <button
          onClick={() => {
            void (async () => {
              const dimensions = await getStableViewportDimensions();
              await onAutoLayout({
                dimensions,
                effectiveZoom,
              });

              setTimeout(() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }, 50);
            })();
          }}
          className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-3 rounded transition-colors"
        >
          Auto Layout
        </button>
      </div>

      {/* Transformed content layer */}
      <div
        className="absolute origin-top-left pointer-events-none"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${effectiveZoom})`,
        }}
      >
        {/* Groups - rendered first so they appear behind cards */}
        {groups.map(group => {
          const bounds = groupBounds.get(group.id);
          const groupWithBounds = bounds ? {
            ...group,
            position_x: bounds.x,
            position_y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          } : group;

          return (
            <GroupContainer
              key={group.id}
              group={groupWithBounds}
              zoom={effectiveZoom}
              isSelected={selectedGroupId === group.id}
              hasCollision={draggingGroupId === group.id && groupHasCollision}
              isDragOver={hoveredGroupId === group.id && dragPreview !== null}
              onSelect={handleGroupSelect}
              onDragComplete={handleGroupDragComplete}
              onNameChange={handleGroupNameChange}
              onCollapseChange={handleGroupCollapseChange}
              onDelete={handleGroupDelete}
              onDragStart={handleGroupDragStart}
              onDragEnd={handleGroupDragEnd}
              checkCollision={checkGroupCollisionDelta}
            />
          );
        })}

        <AnimatePresence mode="popLayout">
            const isInDraggingGroup = draggingGroupId && node.group_id === draggingGroupId;
            const isInRecentlyDraggedGroup = recentlyDraggedGroupId && node.group_id === recentlyDraggedGroupId;
            if (draggingGroupId) {
              if (isInDraggingGroup) {
              } else if (node.group_id) {
              }
            }

            const dragX = isInDraggingGroup ? groupDragOffset.x : 0;
            const dragY = isInDraggingGroup ? groupDragOffset.y : 0;

            const useInstantTransition = isInDraggingGroup || isInRecentlyDraggedGroup;

            return (
            <m.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{
                opacity: 1,
                scale: 1,
                x: dragX,
                y: dragY,
              }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={useInstantTransition
                : { type: 'tween', duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
              }
              className="absolute pointer-events-auto"
              style={{
                left: node.position_x ?? 50,
                top: node.position_y ?? 50,
                zIndex,
              }}
            >
              <PlanCard
                item={node}
                depth={0}
                isSelected={selectedItemIds.has(node.id)}
                isFocused={focusedItemId === node.id}
                focusedItemId={focusedItemId}
                searchQuery={searchQuery}
                selectionSignature={selectionSignatures.get(node.id) ?? ''}
                getSelectionSignature={getSelectionSignature}
                getSelectedIds={getSelectedIds}
                queuedItemIds={queuedItemIds}
                recentlyImportedIds={recentlyImportedIds}
                onSelectItem={onSelectItem}
                onEditItem={onEditItem}
                onAddToContext={onAddToContext}
                onDrop={handleCardDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            </m.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty state - hide when there are items OR groups */}
      {itemsWithPositions.length === 0 && groups.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center w-80">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-lg font-medium text-text-primary whitespace-nowrap">Start planning</p>
            <p className="text-sm mt-2 text-text-muted leading-relaxed">
              Ask Claude to break down your project into actionable work, or drag items from the backlog to get started.
            </p>
          </div>
        </div>
      )}

      {/* Pan hint */}
        Scroll to pan • ⌘+Scroll to zoom
      </div>

      {/* Drag preview */}
      {dragPreview && (
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: Z_INDEX.canvas.dragCard,
            left: `${dragPreview.x - dragPreview.offsetX}px`,
            top: `${dragPreview.y - dragPreview.offsetY}px`,
            transform: `scale(${effectiveZoom})`,
            transformOrigin: 'top left',
          }}
        >
          {dragPreview.nodes.map(({ node, relativeX, relativeY }) => (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: relativeX,
                top: relativeY,
              }}
            >
              <PlanCard
                item={node}
                depth={0}
                variant="preview"
                isSelected={false}
                isFocused={false}
                selectionSignature=""
                getSelectionSignature={getSelectionSignature}
                getSelectedIds={getSelectedIds}
              />
            </div>
          ))}
        </div>
      )}

      {/* Canvas context menu */}
      {canvasContextMenu && (
        <CanvasContextMenu
          x={canvasContextMenu.x}
          y={canvasContextMenu.y}
          onCreateItem={handleCreateItem}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </div>
  );
