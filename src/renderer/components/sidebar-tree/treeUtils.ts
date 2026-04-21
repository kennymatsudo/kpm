import type { TreeApi } from 'react-arborist';
import type { FileNode } from '../../../shared/types';

export function areSetsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export function getOpenPathSet(tree: TreeApi<FileNode>): Set<string> {
  return new Set(
    Object.entries(tree.openState)
      .filter(([, isOpen]) => isOpen)
      .map(([id]) => id)
  );
}
