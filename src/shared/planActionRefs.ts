/**
 * Which `PlanAction` fields carry references, and whether those references
 * resolve.
 *
 * Two kinds of reference live here:
 *
 * - `@plan/<uuid>` tokens inside user-visible text.
 * - Entity ids in id-bearing fields, where a `$N` placeholder may stand for an
 *   entity the same batch creates.
 *
 * Both are declared once, beside the schema in `planActionSchema.ts`, so the
 * propose-time check in the `modify_plan` tool, the apply-time check in
 * `PlanActionService`, and the prefetch it runs all read the same answer — a
 * reference one of them accepts must not silently fall through another.
 */

import { PLAN_ACTION_REGISTRY } from './planActionSchema';
import { findRefs } from './planRefs';
import type { PlanAction } from './types';

/**
 * Entity an id-bearing field points at. Only `planItem` and `group` are minted
 * inside a batch, so a `$N` in a `relation` field can never resolve.
 */
export type PlanActionRefKind = 'planItem' | 'group' | 'relation';

export interface PlanActionRef<Field extends string = string> {
  field: Field;
  kind: PlanActionRefKind;
  placeholders: 'allowed' | 'rejected';
}

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

export interface MintedId {
  placeholder: string;
  id: string;
}

export interface MintedIds {
  byPlaceholder: Map<string, string>;
  byActionIndex: Map<number, MintedId>;
}

/**
 * Assign an id to every action that creates an entity, in batch order, so
 * `$1`, `$2`, … are known before any action runs. Numbering matches the order
 * the creating actions appear in.
 */
export function mintPlaceholderIds(actions: PlanAction[], newId: () => string): MintedIds {
  const byPlaceholder = new Map<string, string>();
  const byActionIndex = new Map<number, MintedId>();

  actions.forEach((action, index) => {
    if (!PLAN_ACTION_REGISTRY[action.type].creates) return;
    const minted = { placeholder: `$${byPlaceholder.size + 1}`, id: newId() };
    byPlaceholder.set(minted.placeholder, minted.id);
    byActionIndex.set(index, minted);
  });

  return { byPlaceholder, byActionIndex };
}

export type RefResolution =
  | { status: 'resolved'; action: PlanAction }
  | { status: 'unresolved'; reason: string };

/**
 * Rewrite every `$N` in the action's id-bearing fields to the id the batch
 * minted for it, so executors never see a placeholder. A placeholder with no
 * mint is reported rather than passed through — passed through it would reach
 * SQL as a literal and match no row.
 */
export function resolveActionRefs(
  action: PlanAction,
  placeholders: ReadonlyMap<string, string>,
): RefResolution {
  const refs = PLAN_ACTION_REGISTRY[action.type].refs;
  if (refs.length === 0) return { status: 'resolved', action };

  const fields = { ...action } as Record<string, unknown>;
  let rewritten = false;

  for (const ref of refs) {
    const value = fields[ref.field];
    const raw = typeof value === 'string' ? [value] : Array.isArray(value) ? (value as string[]) : null;
    if (!raw) continue;

    const resolved: string[] = [];
    for (const id of raw) {
      if (!id.startsWith('$')) {
        resolved.push(id);
        continue;
      }
      if (ref.placeholders === 'rejected') {
        return { status: 'unresolved', reason: `${ref.field} does not accept a placeholder: ${id}` };
      }
      const minted = placeholders.get(id);
      if (!minted) {
        return { status: 'unresolved', reason: `Unresolved placeholder ${id} in ${ref.field}` };
      }
      resolved.push(minted);
    }

    if (resolved.every((id, index) => id === raw[index])) continue;
    fields[ref.field] = typeof value === 'string' ? resolved[0] : resolved;
    rewritten = true;
  }

  return { status: 'resolved', action: rewritten ? (fields as PlanAction) : action };
}

/** Every id of the given kind the actions reference. */
export function collectRefIds(actions: PlanAction[], kind: PlanActionRefKind): Set<string> {
  const ids = new Set<string>();

  for (const action of actions) {
    const fields = action as unknown as Record<string, unknown>;
    for (const ref of PLAN_ACTION_REGISTRY[action.type].refs) {
      if (ref.kind !== kind) continue;
      const value = fields[ref.field];
      if (typeof value === 'string') ids.add(value);
      else if (Array.isArray(value)) for (const id of value) if (typeof id === 'string') ids.add(id);
    }
  }

  return ids;
}
