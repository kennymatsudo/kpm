import type { PlanItem, Group } from '../../../../shared/types';
import { checkCollisionWithObstacles, findEscapeOffset, type Rect } from '../../../utils/collision';
import { CARD_WIDTHS, COLLISION } from '../../../constants/layout';
import { calculateCardHeight } from '../../../utils/planHierarchy';
import type { TreeNode } from '../../../utils/planHierarchy';

interface GroupDragDeps {
  groups: Group[];
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
  itemsWithPositions: TreeNode[];
  itemsByGroupId: Map<string, PlanItem[]>;
  heightMap: Map<string, number>;
  childrenMap: Map<string, string[]>;
  itemMap: Map<string, PlanItem>;
  collapsedGroupIds: Set<string>;
  updateGroupPosition: (groupId: string, x: number, y: number) => Promise<unknown>;
  onUpdatePosition: (itemId: string, x: number, y: number) => void;
  onUpdatePositions?: (updates: { id: string; x: number; y: number }[]) => Promise<void>;
}

interface UseGroupDragReturn {
  draggingGroupId: string | null;
  groupHasCollision: boolean;
  groupDragOffset: { x: number; y: number };
  recentlyDraggedGroupId: string | null;
  hoveredGroupId: string | null;
  setHoveredGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  setGroupHasCollision: React.Dispatch<React.SetStateAction<boolean>>;
  handleGroupDragStart: (groupId: string) => void;
  handleGroupDragEnd: (groupId: string) => void;
  handleGroupDragComplete: (groupId: string, deltaX: number, deltaY: number) => void;
  checkGroupCollisionDelta: (groupId: string, deltaX: number, deltaY: number) => boolean;
  findGroupAtPoint: (canvasX: number, canvasY: number) => string | null;
}

export function useGroupDrag({
  groups,
  groupBounds,
  itemsWithPositions,
  itemsByGroupId,
  heightMap,
  childrenMap,
  itemMap,
  collapsedGroupIds,
  updateGroupPosition,
  onUpdatePosition,
  onUpdatePositions,
}: GroupDragDeps): UseGroupDragReturn {
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [groupHasCollision, setGroupHasCollision] = useState(false);
  const [groupDragOffset, setGroupDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [recentlyDraggedGroupId, setRecentlyDraggedGroupId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const recentlyDraggedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find which group contains a given canvas point
  const findGroupAtPoint = useCallback((canvasX: number, canvasY: number): string | null => {
    for (const group of groups) {
      const bounds = groupBounds.get(group.id);
      if (!bounds) continue;

      if (
        canvasX >= bounds.x &&
        canvasX <= bounds.x + bounds.width &&
        canvasY >= bounds.y &&
        canvasY <= bounds.y + bounds.height
      ) {
        return group.id;
      }
    }
    return null;
  }, [groups, groupBounds]);

  // Build obstacles array for collision detection (other groups and visible items not in the target group)
  const buildObstacles = useCallback((excludeGroupId: string): Rect[] => {
    const obstacles: Rect[] = [];

    // Add other groups as obstacles
    for (const otherGroup of groups) {
      if (otherGroup.id === excludeGroupId) continue;
      const otherBounds = groupBounds.get(otherGroup.id);
      if (otherBounds) obstacles.push(otherBounds);
    }

    // Add items not in the excluded group as obstacles
    const CARD_WIDTH = CARD_WIDTHS[0];
    for (const node of itemsWithPositions) {
      if (node.group_id === excludeGroupId) continue;
      if (node.group_id && collapsedGroupIds.has(node.group_id)) continue;
      obstacles.push({
        x: node.position_x ?? 0,
        y: node.position_y ?? 0,
        width: CARD_WIDTH,
        height: heightMap.get(node.id) ?? calculateCardHeight(node.id, childrenMap, itemMap),
      });
    }

    return obstacles;
  }, [groups, groupBounds, itemsWithPositions, heightMap, childrenMap, itemMap, collapsedGroupIds]);

  // Check if a rectangle collides with other groups or ungrouped items
  const checkGroupCollision = useCallback((
    groupId: string,
    bounds: Rect
  ): boolean => {
    return checkCollisionWithObstacles(bounds, obstacles, COLLISION.MIN_GAP);

  // Check collision callback for GroupContainer during drag (uses delta from drag start)
  // Also updates groupDragOffset for items to use for their visual transform
  const checkGroupCollisionDelta = useCallback((groupId: string, deltaX: number, deltaY: number): boolean => {
    // Update drag offset for items in this group to follow visually

    const currentBounds = groupBounds.get(groupId);
    const group = groups.find(g => g.id === groupId);
    if (!group) return false;

    const newBounds = {
      x: (currentBounds?.x ?? group.position_x) + deltaX,
      y: (currentBounds?.y ?? group.position_y) + deltaY,
      width: currentBounds?.width ?? group.width,
      height: currentBounds?.height ?? group.height,
    };

    return checkGroupCollision(groupId, newBounds);

  // Find the minimum offset needed to resolve collision, preferring directions with open space
  const findNearestValidOffsetForGroup = useCallback((
    groupId: string,
    bounds: Rect
  ): { dx: number; dy: number } => {
    return findEscapeOffset(bounds, obstacles, COLLISION.MIN_GAP);

  const handleGroupDragStart = useCallback((groupId: string) => {
    setDraggingGroupId(groupId);
    setGroupHasCollision(false);

  // Handle group drag complete - applies final delta to group and all assigned items
  const handleGroupDragComplete = useCallback((groupId: string, deltaX: number, deltaY: number) => {
    const assignedItems = itemsByGroupId.get(groupId) ?? [];
    const currentBounds = groupBounds.get(groupId);
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const currentX = currentBounds?.x ?? group.position_x;
    const currentY = currentBounds?.y ?? group.position_y;

    // Calculate new position
    let newX = currentX + deltaX;
    let newY = currentY + deltaY;
    let finalDeltaX = deltaX;
    let finalDeltaY = deltaY;

    // Check for collision and find valid position if needed
    const newBounds = {
      x: newX,
      y: newY,
      width: currentBounds?.width ?? group.width,
      height: currentBounds?.height ?? group.height,
    };

    if (checkGroupCollision(groupId, newBounds)) {
      const offset = findNearestValidOffsetForGroup(groupId, newBounds);
      newX += offset.dx;
      newY += offset.dy;
      finalDeltaX += offset.dx;
      finalDeltaY += offset.dy;
    }

    // Batch update: update group position
    void updateGroupPosition(groupId, newX, newY);

    if (assignedItems.length > 0) {
      const updates = assignedItems.map(item => ({
        id: item.id,
        x: (item.position_x ?? 0) + finalDeltaX,
        y: (item.position_y ?? 0) + finalDeltaY,
      }));
      if (onUpdatePositions) {
        void onUpdatePositions(updates);
      } else {
        updates.forEach(({ id, x, y }) => onUpdatePosition(id, x, y));
      }
    }
  }, [itemsByGroupId, groups, groupBounds, updateGroupPosition, onUpdatePosition, onUpdatePositions, checkGroupCollision, findNearestValidOffsetForGroup]);

  // Handle group drag end - cleanup state (position updates happen in handleGroupDragComplete)
  const handleGroupDragEnd = useCallback((groupId: string) => {
    setDraggingGroupId(null);
    setGroupHasCollision(false);
    setGroupDragOffset({ x: 0, y: 0 });

    // Track the recently dragged group to prevent animation flicker
    // Items in this group will use instant transitions for a short period
    setRecentlyDraggedGroupId(groupId);
    if (recentlyDraggedTimeoutRef.current) {
      clearTimeout(recentlyDraggedTimeoutRef.current);
    }
    recentlyDraggedTimeoutRef.current = setTimeout(() => {
      setRecentlyDraggedGroupId(null);
    }, 500); // Allow instant transitions for 500ms after drag ends
  }, []);

  return {
    draggingGroupId,
    groupHasCollision,
    groupDragOffset,
    recentlyDraggedGroupId,
    hoveredGroupId,
    setHoveredGroupId,
    setGroupHasCollision,
    handleGroupDragStart,
    handleGroupDragEnd,
    handleGroupDragComplete,
    checkGroupCollisionDelta,
    findGroupAtPoint,
  };
}
