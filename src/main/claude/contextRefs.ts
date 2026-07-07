/**
 * Plan-reference expansion for agent context. When a doc / prompt fed to an
 * agent contains `@plan/<uuid>` tokens, we surface a side-section that
 * resolves each one to its title, status, intent, and (truncated) criteria so
 * the agent has the information without an extra tool call.
 *
 * Pure: takes text and plan items, returns a string. No I/O.
 */

import type { PlanItem, StatusCategory } from '../../shared/types';
import { expandPlanRefs } from '../../shared/planRefs';

const STATUS_LABEL: Record<StatusCategory, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  canceled: 'Canceled',
};

const MAX_CRITERIA_INLINED = 3;

/**
 * Render a `<plan-refs>` block summarizing refs in `text`. Returns an empty
 * string when no refs are present.
 */
export function formatPlanRefSection(
  text: string,
  planItems: readonly PlanItem[],
): string {
  const expanded = expandPlanRefs(text, planItems);
  if (expanded.length === 0) return '';

  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const { id, item } of expanded) {
    if (seen.has(id)) continue;
    seen.add(id);
    blocks.push(formatRefBlock(id, item));
  }

  return `<plan-refs>\nThe context above contains @plan/<uuid> references. Their resolved state at this turn:\n\n${blocks.join('\n\n')}\n</plan-refs>\n\n`;
}

function formatRefBlock(id: string, item: PlanItem | null): string {
  if (!item) {
    return `- @plan/${id}: _unresolved (item does not exist or has been deleted)_`;
  }
  const lines: string[] = [];
  const statusLabel = item.status_category ? STATUS_LABEL[item.status_category] : null;
  const meta: string[] = [];
  if (statusLabel) meta.push(`status: ${statusLabel}`);
  if (item.external_key) meta.push(`tracker: ${item.external_key}`);
  const metaPart = meta.length ? ` [${meta.join(', ')}]` : '';
  lines.push(`- @plan/${id} — **${item.title}**${metaPart}`);
  if (item.intent) lines.push(`  - intent: ${item.intent}`);
  if (item.acceptance_criteria && item.acceptance_criteria.length > 0) {
    const head = item.acceptance_criteria.slice(0, MAX_CRITERIA_INLINED);
    const extra = item.acceptance_criteria.length - head.length;
    lines.push(`  - criteria (${item.acceptance_criteria.length}):`);
    for (const c of head) lines.push(`    - ${c}`);
    if (extra > 0) lines.push(`    - …and ${extra} more (use \`get_plan_items\` for full list)`);
  }
  return lines.join('\n');
}
