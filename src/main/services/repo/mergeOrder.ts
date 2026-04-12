/**
 * Merge order computation for dev sessions.
 *
 * Given a set of dev sessions and their plan's dependency graph, computes
 * the topological merge order. Sessions with an explicit `merge_order`
 * override (set by the user) take precedence over the computed graph layer.
 *
 * Edge semantics:
 *   depends_on: from depends_on to  →  to must merge before from
 *   blocks:     from blocks to      →  from must merge before to
 *   relates_to: ignored
 */

import type { DevSession, PlanRelation } from '../../../shared/types';

export interface MergeOrderEntry {
  /**
   * Position in the merge queue (0 = merge first).
   * null means unconstrained — no plan dependency and no user override.
   * User explicit `merge_order` wins over the computed graph layer.
   */
  layer: number | null;
  /**
   * Session IDs that must be merged before this one (direct graph predecessors).
   * Empty for sessions with no plan item or no upstream dependencies.
   */
  blockedBy: string[];
}

export function computeMergeOrder(
  sessions: DevSession[],
  relations: PlanRelation[],
): Map<string, MergeOrderEntry> {
  // Map plan_item_id → session id (only for sessions with a plan item)
  const planItemToSession = new Map<string, string>();
  for (const session of sessions) {
    if (session.plan_item_id) {
      planItemToSession.set(session.plan_item_id, session.id);
    }
  }

  // Adjacency: predecessors[sessionId] = set of sessions that must merge before it
  const predecessors = new Map<string, Set<string>>();
  const successors = new Map<string, Set<string>>();
  for (const session of sessions) {
    predecessors.set(session.id, new Set());
    successors.set(session.id, new Set());
  }

  for (const rel of relations) {
    if (rel.relation_type === 'relates_to') continue;

    // Resolve to "before → after" session pair
    let beforeItemId: string;
    let afterItemId: string;

    if (rel.relation_type === 'depends_on') {
      // A depends_on B → B must merge before A
      beforeItemId = rel.to_item_id;
      afterItemId = rel.from_item_id;
    } else {
      // A blocks B → A must merge before B
      beforeItemId = rel.from_item_id;
      afterItemId = rel.to_item_id;
    }

    const beforeSession = planItemToSession.get(beforeItemId);
    const afterSession = planItemToSession.get(afterItemId);

    if (!beforeSession || !afterSession || beforeSession === afterSession) continue;

    predecessors.get(afterSession)!.add(beforeSession);
    successors.get(beforeSession)!.add(afterSession);
  }

  // Kahn's topological sort → layer assignment (only for plan-backed sessions)
  // Sessions in layer 0 have no predecessors; layer N can only merge after layer N-1.
  const graphLayer = new Map<string, number>();
  const inDegree = new Map<string, number>();

  for (const session of sessions) {
    if (!session.plan_item_id) continue;
    inDegree.set(session.id, predecessors.get(session.id)!.size);
  }

  let currentLayer = 0;
  let batch = sessions
    .filter(s => s.plan_item_id && (inDegree.get(s.id) ?? 0) === 0)
    .map(s => s.id);

  while (batch.length > 0) {
    for (const id of batch) {
      graphLayer.set(id, currentLayer);
    }

    const next: string[] = [];
    for (const id of batch) {
      for (const succ of successors.get(id) ?? []) {
        const deg = (inDegree.get(succ) ?? 1) - 1;
        inDegree.set(succ, deg);
        if (deg === 0) next.push(succ);
      }
    }

    currentLayer++;
    batch = next;
  }

  // Build result
  const result = new Map<string, MergeOrderEntry>();
  for (const session of sessions) {
    const blockedBy = Array.from(predecessors.get(session.id) ?? []);

    let layer: number | null;
    if (session.merge_order !== null && session.merge_order !== undefined) {
      // User explicit override always wins
      layer = session.merge_order;
    } else if (session.plan_item_id && graphLayer.has(session.id)) {
      layer = graphLayer.get(session.id)!;
    } else {
      layer = null;
    }

    result.set(session.id, { layer, blockedBy });
  }

  return result;
}
