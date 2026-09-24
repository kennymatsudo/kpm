/**
 * Plan formatting utilities for system prompts.
 *
 * Handles formatting plan items as hierarchies and reference tables.
 */

import type { PlanItem } from '../../../shared/types';

/**
 * Threshold for including FULL item hierarchy in prompt.
 * Below this: include all listed items with hierarchy (saves all query calls)
 * Above this: only include root-level items as move targets
 */
export const FULL_HIERARCHY_THRESHOLD = 30;

const CLOSED_STATUSES: ReadonlySet<PlanItem['status_category']> = new Set(['done', 'canceled']);

/**
 * Closed (done or canceled) items stay out of the listing: in a long-lived plan
 * they are most of the rows and rarely the subject. A closed item is kept only
 * when an open item sits beneath it, so the open item's nesting still reads
 * correctly.
 */
function selectListedItems(planItems: readonly PlanItem[]): PlanItem[] {
  const byId = new Map(planItems.map((item) => [item.id, item]));
  const listed = new Set<string>();
  for (const item of planItems) {
    if (CLOSED_STATUSES.has(item.status_category)) continue;
    let current: PlanItem | undefined = item;
    while (current && !listed.has(current.id)) {
      listed.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }
  return planItems.filter((item) => listed.has(item.id));
}

/**
 * The `# Current Plan` section shared by every chat provider: a count line and
 * a compact reference table of the items worth listing.
 */
export function buildCurrentPlanSection(planItems: readonly PlanItem[]): string {
  if (planItems.length === 0) return '# Current Plan\nEmpty.';

  const listed = selectListedItems(planItems);
  const omitted = planItems.length - listed.length;
  const findHint = 'find them with `query_plan_items`.';
  const summary = listed.length === 0
    ? `${planItems.length} ${planItems.length === 1 ? 'item, closed' : 'items, all closed'} (done or canceled), so none are listed; ${findHint}`
    : omitted > 0
      ? `${planItems.length} items. ${omitted} closed (done or canceled) ${omitted === 1 ? 'item is' : 'items are'} not listed; ${findHint}`
      : `${planItems.length} items.`;

  const table = buildItemReferenceTable(listed);
  return `# Current Plan\n${summary}${table ? `\n${table}` : ''}`;
}

/**
 * Build a compact reference table of plan items.
 *
 * Only include the full hierarchy when the listed items fit under the
 * threshold; otherwise list root items, which are the common reparent targets.
 */
export function buildItemReferenceTable(planItems: readonly PlanItem[]): string {
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
    const lines = ['## Item Reference (root items only)', ''];
    lines.push('Query `query_plan_items` for other item IDs.', '');

    rootItems
      .sort((a, b) => a.item_order - b.item_order)
      .forEach(item => {
        lines.push(formatItem(item));
      });

    return lines.join('\n');
  }
}
