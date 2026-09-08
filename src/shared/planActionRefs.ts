/**
 * Which `PlanAction` text fields carry `@plan/<uuid>` refs, and whether those
 * refs resolve.
 *
 * Shared so the propose-time check in the `modify_plan` tool and the
 * apply-time check in `PlanActionService` test the same predicate over the
 * same fields — a ref the tool accepts must not fail later at apply.
 */

import { findRefs } from './planRefs';
import type { PlanAction } from './types';

/**
 * Walk the ref-bearing text fields on `create_item` / `revise_work_brief`.
 * Returns the referenced UUIDs in document order (deduplicated, lowercased).
 */
export function collectRefIdsInActions(actions: PlanAction[]): string[] {
  const ids = new Set<string>();
  const consume = (text: string | null | undefined) => {
    if (!text) return;
    for (const m of findRefs(text)) ids.add(m.id);
  };

  for (const action of actions) {
    if (action.type === 'create_item') {
      consume(action.title);
      consume(action.description);
      consume(action.intent);
      if (action.acceptance_criteria) {
        for (const c of action.acceptance_criteria) consume(c);
      }
    } else if (action.type === 'revise_work_brief') {
      consume(action.work_brief.title);
      consume(action.work_brief.description);
      consume(action.work_brief.intent);
      for (const criterion of action.work_brief.acceptance_criteria) consume(criterion);
    }
  }
  return Array.from(ids);
}

/**
 * Referenced UUIDs that don't exist. `listExistingIds` is a thunk so callers
 * skip the lookup entirely when the batch carries no refs.
 */
export function findUnresolvedRefIds(
  actions: PlanAction[],
  listExistingIds: () => Iterable<string>,
): string[] {
  const refIds = collectRefIdsInActions(actions);
  if (refIds.length === 0) return [];

  const existing = new Set<string>();
  for (const id of listExistingIds()) existing.add(id.toLowerCase());
  return refIds.filter((id) => !existing.has(id));
}
