import { useState, useCallback, useEffect } from 'react';
import type { TreeNode } from '../../../utils/planHierarchy';

interface TreeExpansionDeps {
  items: TreeNode[];
}

function collectAllIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: TreeNode[]): void => {
    list.forEach((node) => {
      ids.add(node.id);
      walk(node.children);
    });
  };
  walk(nodes);
  return ids;
}

export function useTreeExpansion({ items }: TreeExpansionDeps): {
  expandedIds: Set<string>;
  handleToggleExpand: (id: string) => void;
  handleExpandAll: () => void;
  handleCollapseAll: () => void;
} {
  // Default all items expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectAllIds(items));

  // When items change, auto-expand newly added items
  useEffect(() => {
    const allIds = collectAllIds(items);

    setExpandedIds((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => {
        if (!prev.has(id)) next.add(id); // New items start expanded
      });
      return next;
    });
  }, [items]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(collectAllIds(items));
  }, [items]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  return {
    expandedIds,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
  };
}
