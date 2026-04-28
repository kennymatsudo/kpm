import type { PlanItem } from '../../shared/types';
import type { TreeNode } from './planHierarchy';

export function getCanvasSelectionOrder(items: readonly PlanItem[]): string[] {
  return [...items]
    .sort((a, b) => {
      const yDiff = (a.position_y ?? 0) - (b.position_y ?? 0);
      if (yDiff !== 0) return yDiff;
      return (a.position_x ?? 0) - (b.position_x ?? 0);
    })
    .map((item) => item.id);
}

function treeNodeMatchesNormalizedQuery(node: TreeNode, query: string): boolean {
  if (node.title.toLowerCase().includes(query)) return true;
  if (node.external_key?.toLowerCase().includes(query)) return true;
  return node.children.some((child) => treeNodeMatchesNormalizedQuery(child, query));
}

export function treeNodeMatchesSearch(node: TreeNode, searchQuery: string): boolean {
  const query = searchQuery.trim().toLowerCase();
  return query.length === 0 || treeNodeMatchesNormalizedQuery(node, query);
}

export function getVisibleTreeSelectionOrder(
  nodes: readonly TreeNode[],
  expandedIds: ReadonlySet<string>,
  searchQuery: string,
): string[] {
  const orderedIds: string[] = [];
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  const walk = (currentNodes: readonly TreeNode[]) => {
    for (const node of currentNodes) {
      const matchesSearch = !isSearching || treeNodeMatchesNormalizedQuery(node, query);
      if (!matchesSearch) continue;

      orderedIds.push(node.id);

      const shouldShowChildren = expandedIds.has(node.id) || isSearching;
      if (shouldShowChildren && node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return orderedIds;
}
