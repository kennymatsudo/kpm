/**
 * Plan formatting utilities for system prompts.
 *
 * Handles formatting plan items as hierarchies and reference tables.
 */

import type { PlanItem } from '../../../shared/types';

/**
 * Threshold for including FULL item hierarchy in prompt.
 * Below this: include all items with hierarchy (saves all query calls)
 * Above this: only include root-level items (phases) as move targets
 */
export const FULL_HIERARCHY_THRESHOLD = 30;

/**
 * Build a compact reference table of plan items for Claude.
 *
 * Strategy:
 * - Always include root-level items (phases) - common move targets, typically 3-7 items
 * - Only include full hierarchy when total items <= threshold
 *
 * This ensures "move X to Phase Y" only needs 2 calls (query X, propose)
 * even with large plans, since Phase Y's ID is always available.
 */
export function buildItemReferenceTable(planItems: PlanItem[]): string {
  if (planItems.length === 0) {
    return '';
  }

  const rootItems = planItems.filter(item => item.parent_id === null);
  const includeFullHierarchy = planItems.length <= FULL_HIERARCHY_THRESHOLD;

  const formatItem = (item: PlanItem, indent = ''): string => {
    const key = item.external_key ? `${item.external_key}: ` : '';
    const title = item.title.length > 40 ? item.title.slice(0, 40) + '...' : item.title;
    return `${indent}- ${key}\`${item.id}\` "${title}"`;
  };

  if (includeFullHierarchy) {
    // Full hierarchy: include all items nested
    const lines = ['## Item Reference (use these IDs directly)', ''];
    const childrenByParent = new Map<string, PlanItem[]>();

    planItems.forEach(item => {
      if (item.parent_id) {
        const children = childrenByParent.get(item.parent_id) || [];
        children.push(item);
        childrenByParent.set(item.parent_id, children);
      }
    });

    const formatWithChildren = (item: PlanItem, indent = ''): string[] => {
      const result = [formatItem(item, indent)];
      const children = childrenByParent.get(item.id) || [];
      children
        .sort((a, b) => a.item_order - b.item_order)
        .forEach(child => {
          result.push(...formatWithChildren(child, indent + '  '));
        });
      return result;
    };

    rootItems
      .sort((a, b) => a.item_order - b.item_order)
      .forEach(item => {
        lines.push(...formatWithChildren(item));
      });

    return lines.join('\n');
  } else {
    // Root items only: phases as move targets
    const lines = ['## Root Items (phases - use these IDs for reparent targets)', ''];

    rootItems
      .sort((a, b) => a.item_order - b.item_order)
      .forEach(item => {
        lines.push(formatItem(item));
      });

    return lines.join('\n');
  }
}

