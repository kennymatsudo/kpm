import { useCallback } from 'react';
import type { PlanItem } from '../../../../shared/types';
import type { TreeNode } from '../../../utils/planHierarchy';
import { DragSource } from '../../../constants/dragSource';

interface UseCanvasDragHandlersDeps {
  itemMap: Map<string, PlanItem>;
  zoom: number;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  findGroupAtPoint: (canvasX: number, canvasY: number) => string | null;
  setDragPreview: React.Dispatch<React.SetStateAction<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    nodes: { node: TreeNode; relativeX: number; relativeY: number }[];
    depth: number;
  } | null>>;
  setHoveredGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  onReparent: (itemIds: string[], newParentId: string | null) => Promise<void>;
  onUpdatePosition: (itemId: string, x: number, y: number) => void;
  onUpdatePositions?: (updates: { id: string; x: number; y: number }[]) => Promise<void>;
  onAssignToGroup?: (itemIds: string[], groupId: string | null) => Promise<void>;
}

interface UseCanvasDragHandlersReturn {
  handleCanvasDrop: (e: React.DragEvent) => Promise<void>;
  handleDragOver: (e: React.DragEvent) => void;
}

export function useCanvasDragHandlers({
  itemMap,
  zoom,
  screenToCanvas,
  findGroupAtPoint,
  setDragPreview,
  setHoveredGroupId,
  onReparent,
  onUpdatePosition,
  onUpdatePositions,
  onAssignToGroup,
}: UseCanvasDragHandlersDeps): UseCanvasDragHandlersReturn {
  const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragPreview(null);

    const itemId = e.dataTransfer.getData('item-id');
    const source = e.dataTransfer.getData('source');
    const selectedIdsJson = e.dataTransfer.getData('selected-ids');

    if (!itemId) return;

    const { x: dropX, y: dropY } = screenToCanvas(e.clientX, e.clientY);

    const offsetX = parseFloat(e.dataTransfer.getData('offset-x')) || 0;
    const offsetY = parseFloat(e.dataTransfer.getData('offset-y')) || 0;

    if (source === DragSource.CANVAS) {
      const item = itemMap.get(itemId);
      const selectedIds: string[] = selectedIdsJson ? JSON.parse(selectedIdsJson) : [itemId];

      const targetGroupId = findGroupAtPoint(dropX, dropY);
      const wasInGroup = item?.group_id;

      if (onAssignToGroup) {
        if (targetGroupId && targetGroupId !== wasInGroup) {
          await onAssignToGroup(selectedIds, targetGroupId);
          return;
        } else if (!targetGroupId && wasInGroup) {
          await onAssignToGroup(selectedIds, null);
          const newX = dropX - offsetX / zoom;
          const newY = dropY - offsetY / zoom;
          if (onUpdatePositions) {
            void onUpdatePositions(selectedIds.map(id => ({ id, x: newX, y: newY })));
          } else {
            selectedIds.forEach(id => {
              onUpdatePosition(id, newX, newY);
            });
          }
          return;
        }
      }

      if (item?.parent_id) {
        await onReparent([itemId], null);
        onUpdatePosition(itemId, dropX - offsetX / zoom, dropY - offsetY / zoom);
      } else if (item) {
        if (item.group_id) return;

        const dragStartScreenX = parseFloat(e.dataTransfer.getData('drag-start-screen-x')) || 0;
        const dragStartScreenY = parseFloat(e.dataTransfer.getData('drag-start-screen-y')) || 0;

        const dragStartCanvas = screenToCanvas(dragStartScreenX, dragStartScreenY);
        const deltaX = dropX - dragStartCanvas.x;
        const deltaY = dropY - dragStartCanvas.y;

        const updates: { id: string; x: number; y: number }[] = [];
        selectedIds.forEach(id => {
          const selectedItem = itemMap.get(id);
          if (selectedItem && !selectedItem.parent_id) {
            updates.push({
              id,
              x: (selectedItem.position_x || 0) + deltaX,
              y: (selectedItem.position_y || 0) + deltaY,
            });
          }
        });
        if (updates.length > 0) {
          if (onUpdatePositions) {
            void onUpdatePositions(updates);
          } else {
            updates.forEach(({ id, x, y }) => onUpdatePosition(id, x, y));
          }
        }
      }
    }
  }, [itemMap, zoom, screenToCanvas, findGroupAtPoint, setDragPreview, onReparent, onUpdatePosition, onUpdatePositions, onAssignToGroup]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    setDragPreview(prev => {
      if (prev) {
        return { ...prev, x: e.clientX, y: e.clientY };
      }
      return prev;
    });

    const { x: canvasX, y: canvasY } = screenToCanvas(e.clientX, e.clientY);
    const groupId = findGroupAtPoint(canvasX, canvasY);
    setHoveredGroupId(groupId);
  }, [screenToCanvas, findGroupAtPoint, setDragPreview, setHoveredGroupId]);

  return { handleCanvasDrop, handleDragOver };
}
