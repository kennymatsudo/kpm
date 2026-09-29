/* eslint-disable @typescript-eslint/require-await */
/**
 * Plan Changes Tool
 *
 * Allows the active chat provider to propose plan modifications via a structured tool call
 * instead of text-based plan-actions blocks.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { findUnconnectedRepoTargetIds, planActionSchema } from '../../../shared/planActionSchema';
import { findUnresolvedRefIds } from '../../../shared/planActionRefs';
import type { PlanAction } from '../../../shared/types';
import type { IRepoRepository } from '../../db/interfaces';
import { getCurrentToolExecutionContext } from '../runtime';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { PlanActionsCallback } from './schemas';

export type { PlanActionsCallback };

function normalizeRepoTargets(
  actions: PlanAction[],
  projectId: string | undefined,
  repos: Pick<IRepoRepository, 'getByProject'>,
): { actions: PlanAction[]; error?: string } {
  if (!projectId) return { actions };

  const connectedRepos = repos.getByProject(projectId);
  const connectedRepoIds = new Set(connectedRepos.map((repo) => repo.id));
  const soleRepoId = connectedRepos.length === 1 ? connectedRepos[0].id : null;

  const normalized: PlanAction[] = actions.map((action) => {
    if (action.type !== 'create_item') return action;

    const primaryRepoId = action.primary_repo_id ?? soleRepoId;
    return {
      ...action,
      primary_repo_id: primaryRepoId,
      affected_repo_ids: [...new Set(action.affected_repo_ids ?? [])]
        .filter((repoId) => repoId !== primaryRepoId),
    };
  });

  const invalidRepoIds = findUnconnectedRepoTargetIds(normalized, connectedRepoIds);
  if (invalidRepoIds.length > 0) {
    return {
      actions,
      error: `Repo target is not connected to this project: ${invalidRepoIds.join(', ')}`,
    };
  }

  return { actions: normalized };
}

/** Structural minimum: the ref check only needs each item's ID. */
interface PlanItemIdSource {
  getByProject(projectId: string): { id: string }[];
}

/**
 * Reject the batch while the provider can still fix it. `PlanActionService`
 * makes the same check at apply time, but that failure surfaces to the user
 * long after the turn ended — here it lands in the tool result, so the model
 * can look the ID up and resubmit.
 */
function findRefTargetError(
  actions: PlanAction[],
  projectId: string | undefined,
  planItems: PlanItemIdSource,
): string | null {
  if (!projectId) return null;

  const unresolved = findUnresolvedRefIds(actions, () =>
    planItems.getByProject(projectId).map((item) => item.id));
  if (unresolved.length === 0) return null;

  return `No plan item in this project has the ID: ${unresolved.join(', ')}. Nothing was submitted. `
    + 'Resolve the real IDs with query_plan_items (or drop the @plan refs), then resubmit.';
}

/**
 * Create the plan changes tool.
 *
 * @param onPlanActions - Callback to emit proposed actions to the UI for approval
 */
export function createPlanChangeTools(
  onPlanActions: PlanActionsCallback,
  repos: Pick<IRepoRepository, 'getByProject'>,
  planItems: PlanItemIdSource,
) {
  return [
    tool(
      'modify_plan',
      `Propose changes to the plan: create items, revise them, set status or labels, reparent, reorder, link dependencies, delete, or queue items for tracker export. KPM queues the batch for review or applies it at once, per the user's setting. Put related changes in one call.

Work Brief = title, description, intent, acceptance_criteria. On an existing item, change any of them only with revise_work_brief: fetch the item with get_plan_items, then send all four fields (null for empty ones) with its work_brief_revision as expected_revision. On a revision conflict, fetch again. update_item covers status, label, release tag, and source document.

Shape: implementation items get intent plus acceptance_criteria; research items whose criteria are not known yet get intent plus description. description is the only field synced to Jira or Linear, so keep file paths, code names, commands, and local document paths out of it; they belong in intent or criteria. Headings inside description do not define the execution contract.

IDs: $1, $2… stand for the items this batch creates, in create_item order, and work in any item-ID field. Every other item ID comes from the Item Reference in the system prompt or a plan tool result. Repo IDs come only from the Project list in the system prompt, never from documents; leave primary_repo_id null when unsure, and KPM fills it when one repo is connected. To mention an item in text, follow Plan References; for nesting, follow Plan Structure.

Relations: add_dependency reads "from_id relation_type to_id", so "A blocks B" is from_id A, relation_type blocks, to_id B. remove_dependency takes a relation_id from get_enriched_relations. delete_item without cascade keeps the children as root items.`,
      {
        message: z.string().describe('One line summarizing the batch'),
        actions: z.array(planActionSchema).describe('The plan actions to propose'),
      },
      async ({ message, actions }) => {
        const projectId = getCurrentToolExecutionContext()?.projectId;
        const repoTargets = normalizeRepoTargets(actions, projectId, repos);
        if (repoTargets.error) return toolError(repoTargets.error);

        const refError = findRefTargetError(repoTargets.actions, projectId, planItems);
        if (refError) return toolError(refError);

        toolLog(`[KPM Tools] modify_plan "${message}" (${repoTargets.actions.length} actions: ${repoTargets.actions.map(a => a.type).join(', ')})`);

        try {
          onPlanActions(repoTargets.actions);
        } catch (error) {
          console.error(`[KPM Tools] Error emitting actions:`, error);
          return toolError(`Failed to emit plan actions: ${error instanceof Error ? error.message : String(error)}`);
        }

        return jsonResult({
          success: true,
          message: 'Plan changes submitted to KPM.',
          actionCount: repoTargets.actions.length,
        });
      }
    ),
  ];
}
