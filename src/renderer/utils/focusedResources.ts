/**
 * Utility functions for FocusedResource comparison.
 *
 * Used by both the store (for add/remove logic) and hooks (for UI state).
 */

import type { FocusedResource } from '../../shared/types';

/**
 * Check if two FocusedResource objects are equal.
 * This is the canonical comparison function for focus resources.
 */
export function resourceEquals(a: FocusedResource, b: FocusedResource): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'plan_item':
      return b.type === 'plan_item' && a.id === b.id;
    case 'project_file':
      return b.type === 'project_file' && a.path === b.path;
    case 'repo':
      return b.type === 'repo' && a.id === b.id;
    case 'document':
      return b.type === 'document' && a.id === b.id;
  }
}

