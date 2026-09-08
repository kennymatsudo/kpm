import type { PlanItem, Group } from '../../shared/types';
import { CARD_WIDTHS, GROUP_LAYOUT } from '../constants/layout';
import { CARD_BOX_MODEL, paddingPxForDepth, titleLineHeightPxForDepth } from '../constants/planCardStyles';

/**
 * TreeNode extends PlanItem with children for hierarchical display
 */
export interface TreeNode extends PlanItem {
  children: TreeNode[];
}

/**
 * Result of building a hierarchy tree.
 */
export interface HierarchyResult {
  tree: TreeNode[];
  orphanedCount: number;
  selfReferencingCount: number;
}

/**
 * Build a tree structure from flat plan items.
 * Handles self-references and orphaned items gracefully.
 */
export function buildHierarchyTree(items: PlanItem[]): TreeNode[] {
  return buildHierarchy(items).tree;
}

/**
 * Build a tree structure with metadata about data integrity issues.
 */
export function buildHierarchy(items: PlanItem[]): HierarchyResult {
  const itemMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  let orphanedCount = 0;
  let selfReferencingCount = 0;

  // First pass: create nodes
  for (const item of items) {
    itemMap.set(item.id, { ...item, children: [] });
  }

  // Second pass: build tree
  for (const item of items) {
    const node = itemMap.get(item.id)!;

    // Check for self-reference (data corruption)
    if (item.parent_id === item.id) {
      console.error('[PlanHierarchy] Self-referencing item detected:', item.title, item.id);
      selfReferencingCount++;
      // Treat as root
      roots.push(node);
    } else if (item.parent_id && itemMap.has(item.parent_id)) {
      const parent = itemMap.get(item.parent_id)!;
      parent.children.push(node);
    } else if (item.parent_id && !itemMap.has(item.parent_id)) {
      // Orphaned item - parent doesn't exist in items
      orphanedCount++;
      // Still add to roots so it's visible
      roots.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by item_order
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.item_order - b.item_order);
    nodes.forEach(node => sortChildren(node.children));
  };
  sortChildren(roots);

  return { tree: roots, orphanedCount, selfReferencingCount };
}

/**
 * Height of a card's own content (padding, title, metadata, description),
 * excluding its children container. Shared by both height-calculation entry
 * points so the box model lives in exactly one formula.
 */
function ownCardHeight(depth: number): number {
  let height = paddingPxForDepth(depth);
  height += titleLineHeightPxForDepth(depth);
  height += CARD_BOX_MODEL.metadataRow.marginTop.px + CARD_BOX_MODEL.metadataRow.contentPx;
  if (CARD_BOX_MODEL.description.reservedAtDepth(depth)) {
    height += CARD_BOX_MODEL.description.marginTop.px + CARD_BOX_MODEL.description.lineHeightPx;
  }
  return height;
}

/**
 * Height contributed by the children container (toggle row + child heights
 * + inter-sibling gaps), given the already-computed height of each child.
 */
function childrenContainerHeight(childHeights: number[]): number {
  if (childHeights.length === 0) return 0;
  const { marginTop, toggleRowPx, siblingGap } = CARD_BOX_MODEL.childrenContainer;
  const gaps = (childHeights.length - 1) * siblingGap.px;
  const childrenSum = childHeights.reduce((sum, h) => sum + h, 0);
  return marginTop.px + toggleRowPx + childrenSum + gaps;
}

/**
 * Calculate the height of a single card including all nested children.
 * Used for accurate layout calculations in groups and auto-layout.
 *
 * @param item - The plan item to calculate height for
 * @param childrenMap - Map from parent ID to list of child IDs
 * @param itemMap - Map from item ID to item
 * @param depth - Current nesting depth (default 0)
 */
export function calculateCardHeight(
  itemId: string,
  childrenMap: Map<string, string[]>,
  itemMap: Map<string, PlanItem>,
  depth = 0
): number {
  const children = childrenMap.get(itemId) || [];
  const childHeights = children.map((childId) => calculateCardHeight(childId, childrenMap, itemMap, depth + 1));
  return ownCardHeight(depth) + childrenContainerHeight(childHeights);
}

/**
 * Build a height map for a hierarchy tree.
 * Assumes each item has a single parent so depth is stable per node.
 */
export function buildHeightMapFromTree(nodes: TreeNode[]): Map<string, number> {
  const heightMap = new Map<string, number>();

  const computeHeight = (node: TreeNode, depth: number): number => {
    const cached = heightMap.get(node.id);
    if (cached !== undefined) return cached;

    const childHeights = node.children.map((child) => computeHeight(child, depth + 1));
    const height = ownCardHeight(depth) + childrenContainerHeight(childHeights);

    heightMap.set(node.id, height);
    return height;
  };

  nodes.forEach((node) => computeHeight(node, 0));
  return heightMap;
}

/**
 * Build children map and item map from flat items array.
 * Useful for calculating heights across multiple items.
 */
export function buildItemMaps(items: PlanItem[]): {
  childrenMap: Map<string, string[]>;
  itemMap: Map<string, PlanItem>;
  itemIds: Set<string>;
} {
  const childrenMap = new Map<string, string[]>();
  const itemMap = new Map<string, PlanItem>();
  const itemIds = new Set(items.map(i => i.id));

  for (const item of items) {
    itemMap.set(item.id, item);
    if (item.parent_id && item.parent_id !== item.id && itemIds.has(item.parent_id)) {
      const siblings = childrenMap.get(item.parent_id) || [];
      siblings.push(item.id);
      childrenMap.set(item.parent_id, siblings);
    }
  }

  return { childrenMap, itemMap, itemIds };
}

/**
 * Build hierarchy and calculate layout metadata for root items.
 * Used for auto-layout calculations.
 */
export function buildHierarchyWithHeights(items: PlanItem[]): {
  rootIds: string[];
  rootHeights: number[];
  itemMap: Map<string, PlanItem>;
  childrenMap: Map<string, string[]>;
} {
  const rootIds: string[] = [];
  const { childrenMap, itemMap, itemIds } = buildItemMaps(items);

  // Find root items
  for (const item of items) {
    if (!item.parent_id || item.parent_id === item.id || !itemIds.has(item.parent_id)) {
      rootIds.push(item.id);
    }
  }

  // Calculate heights for all root items
  const rootHeights = rootIds.map(id => calculateCardHeight(id, childrenMap, itemMap));

  return { rootIds, rootHeights, itemMap, childrenMap };
}

// =============================================================================
// Group Item Sorting
// =============================================================================

/**
 * Sort order for status categories within groups.
 * Items are sorted to show most actionable work at the top.
 */
const STATUS_SORT_ORDER: Record<string, number> = {
  in_progress: 0,
  blocked: 1,
  not_started: 2,
  done: 3,
  canceled: 4,
};

/**
 * Sort items within a group by status priority.
 * Sort order (top to bottom):
 * 1. In Progress - active work (most actionable)
 * 2. Blocked - needs unblocking
 * 3. Not Started / null - upcoming work
 * 4. Done - completed
 * 5. Canceled - removed from scope
 *
 * Within each status:
 * - Unsynced items first (not yet in Jira)
 * - Then by most recently updated (updated_at DESC)
 */
export function sortGroupItems<T extends PlanItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Primary: status_category
    const aOrder = STATUS_SORT_ORDER[a.status_category ?? 'not_started'] ?? 2;
    const bOrder = STATUS_SORT_ORDER[b.status_category ?? 'not_started'] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // Secondary: unsynced first
    const aSync = a.external_key !== null;
    const bSync = b.external_key !== null;
    if (aSync !== bSync) return aSync ? 1 : -1;

    // Tertiary: most recently updated
    const aDate = a.updated_at ?? a.created_at ?? '';
    const bDate = b.updated_at ?? b.created_at ?? '';
    return bDate.localeCompare(aDate);
  });
}

// =============================================================================
// Masonry Layout Utilities
// =============================================================================

/**
 * Position result from masonry layout calculation
 */
export interface MasonryPosition {
  id: string;
  x: number;
  y: number;
}

/**
 * Options for masonry layout calculation
 */
export interface MasonryLayoutOptions {
  /** Number of columns (default: 2 for groups, based on item count) */
  columns?: number;
  /** Starting X position */
  startX: number;
  /** Starting Y position */
  startY: number;
  /** Horizontal gap between columns */
  horizontalGap?: number;
  /** Vertical gap between rows */
  verticalGap?: number;
  /** Width of each item (default: CARD_WIDTHS[0]) */
  itemWidth?: number;
}

/**
 * Calculate masonry layout positions for items.
 * Places each item in the shortest column (vertical-first layout).
 *
 * @param items - Array of items with id and height
 * @param options - Layout configuration
 * @returns Array of positions and the final column heights
 */
export function calculateMasonryLayout(
  items: { id: string; height: number }[],
  options: MasonryLayoutOptions
): { positions: MasonryPosition[]; columnHeights: number[] } {
  const {
    columns = items.length === 1 ? 1 : 2,
    startX,
    startY,
    horizontalGap = GROUP_LAYOUT.HORIZONTAL_GAP,
    verticalGap = GROUP_LAYOUT.VERTICAL_GAP,
    itemWidth = CARD_WIDTHS[0],
  } = options;

  const columnWidth = itemWidth + horizontalGap;
  const columnHeights: number[] = new Array(columns).fill(0);
  const positions: MasonryPosition[] = [];

  for (const item of items) {
    // Find the shortest column
    let shortestCol = 0;
    for (let c = 1; c < columns; c++) {
      if (columnHeights[c] < columnHeights[shortestCol]) {
        shortestCol = c;
      }
    }

    positions.push({
      id: item.id,
      x: startX + shortestCol * columnWidth,
      y: startY + columnHeights[shortestCol],
    });

    // Update column height
    columnHeights[shortestCol] += item.height + verticalGap;
  }

  return { positions, columnHeights };
}

/**
 * Per-tree cache for `buildHeightMapFromTree`, keyed by array identity.
 * `layoutGroup` is called once per group sharing the same plan tree, and
 * without this it would re-walk the whole tree for every group.
 */
const heightMapByTree = new WeakMap<TreeNode[], Map<string, number>>();

function heightMapForTree(tree: TreeNode[]): Map<string, number> {
  let cached = heightMapByTree.get(tree);
  if (!cached) {
    cached = buildHeightMapFromTree(tree);
    heightMapByTree.set(tree, cached);
  }
  return cached;
}

/**
 * Calculate a group's bounds and its assigned items' ideal positions.
 *
 * This is the single policy for group layout: every caller gets depth-aware
 * card heights (from `tree`, the full plan hierarchy — never the depth-0
 * fallback `calculateCardHeight` uses on its own), column count derived from
 * the group's real width, and the collapsed / manual-width-clamp rules
 * baked in. There is no shorter call that opts out of any of these, so the
 * render path (`useCanvasHierarchy`) and the persistence paths
 * (`useGroupCollisionResolution`, `useAutoLayout`) always agree.
 *
 * @param group - id, position, width, and collapsed state of the target group
 * @param assignedItems - Items assigned to this group (`item.group_id === group.id`)
 * @param tree - The full plan hierarchy tree, used to resolve each item's real depth
 */
export function layoutGroup(
  group: Pick<Group, 'id' | 'position_x' | 'position_y' | 'width' | 'is_collapsed'>,
  assignedItems: PlanItem[],
  tree: TreeNode[]
): {
  bounds: { x: number; y: number; width: number; height: number };
  itemPositions: Map<string, { x: number; y: number }>;
} {
  const shouldDebug = typeof window !== 'undefined' &&
    (window as unknown as { __DEBUG_GROUP_LAYOUT?: boolean }).__DEBUG_GROUP_LAYOUT === true;

  const itemPositions = new Map<string, { x: number; y: number }>();

  // No items assigned - return minimum bounds. Every current caller already
  // guards this case before calling (an empty group keeps its own persisted
  // size rather than shrinking to this default), so this is a defensive
  // fallback, not a reachable branch today.
  if (assignedItems.length === 0) {
    return {
      bounds: {
        x: group.position_x,
        y: group.position_y,
        width: GROUP_LAYOUT.PADDING_X * 2 + CARD_WIDTHS[0],
        height: group.is_collapsed
          ? GROUP_LAYOUT.COLLAPSED_HEIGHT
          : GROUP_LAYOUT.HEADER_HEIGHT + GROUP_LAYOUT.PADDING_TOP + GROUP_LAYOUT.PADDING_BOTTOM,
      },
      itemPositions,
    };
  }

  // Sort items for consistent, priority-based display order
  const sortedItems = sortGroupItems(assignedItems);

  // Calculate heights for each item (using sorted order), always from the
  // depth-aware map so a nested item measures the same here as it renders.
  const heightMap = heightMapForTree(tree);
  const itemsWithHeights = sortedItems.map(item => {
    const height = heightMap.get(item.id);
    if (height === undefined) {
      console.error('[layoutGroup] item is not part of the supplied tree, cannot resolve its depth:', item.id);
    }
    return { id: item.id, height: height ?? 0 };
  });

  // Determine column count from the group's actual width, capped by MAX_COLUMNS
  const maxColumns = Math.min(GROUP_LAYOUT.MAX_COLUMNS, sortedItems.length);
  const availableWidth = group.width - GROUP_LAYOUT.PADDING_X * 2;
  const columnSpan = CARD_WIDTHS[0] + GROUP_LAYOUT.HORIZONTAL_GAP;
  const possibleColumns = Math.floor((availableWidth + GROUP_LAYOUT.HORIZONTAL_GAP) / columnSpan);
  const numColumns = Math.max(1, Math.min(maxColumns, possibleColumns || 1));

  const startX = group.position_x + GROUP_LAYOUT.PADDING_X;
  const startY = group.position_y + GROUP_LAYOUT.HEADER_HEIGHT + GROUP_LAYOUT.PADDING_TOP;

  // Calculate masonry positions
  const { positions, columnHeights } = calculateMasonryLayout(itemsWithHeights, {
    columns: numColumns,
    startX,
    startY,
    horizontalGap: GROUP_LAYOUT.HORIZONTAL_GAP,
    verticalGap: GROUP_LAYOUT.VERTICAL_GAP,
    itemWidth: CARD_WIDTHS[0],
  });

  // Convert to map
  for (const pos of positions) {
    itemPositions.set(pos.id, { x: pos.x, y: pos.y });
  }

  // Calculate bounds from column heights
  const maxColumnHeight = Math.max(...columnHeights) - GROUP_LAYOUT.VERTICAL_GAP; // Remove trailing gap
  const contentWidth = CARD_WIDTHS[0] * numColumns + GROUP_LAYOUT.HORIZONTAL_GAP * Math.max(0, numColumns - 1);
  const naturalWidth = contentWidth + GROUP_LAYOUT.PADDING_X * 2;

  const bounds = {
    x: group.position_x,
    y: group.position_y,
    // Never shrink a group narrower than its current (possibly manually
    // widened) width.
    width: Math.max(group.width, naturalWidth),
    height: group.is_collapsed
      ? GROUP_LAYOUT.COLLAPSED_HEIGHT
      : maxColumnHeight + GROUP_LAYOUT.HEADER_HEIGHT + GROUP_LAYOUT.PADDING_TOP + GROUP_LAYOUT.PADDING_BOTTOM,
  };

  if (shouldDebug) {
    console.debug('[group-layout]', {
      groupId: group.id,
      assignedCount: assignedItems.length,
      groupWidth: group.width,
      numColumns,
      bounds,
    });
  }

  return { bounds, itemPositions };
}
