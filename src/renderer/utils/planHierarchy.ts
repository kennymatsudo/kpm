import type { PlanItem } from '../../shared/types';

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
 */
} {
  const childrenMap = new Map<string, string[]>();
  const itemMap = new Map<string, PlanItem>();
  const itemIds = new Set(items.map(i => i.id));

  for (const item of items) {
    itemMap.set(item.id, item);
      const siblings = childrenMap.get(item.parent_id) || [];
      siblings.push(item.id);
      childrenMap.set(item.parent_id, siblings);
    }
  }

    }

    }

    });



}
