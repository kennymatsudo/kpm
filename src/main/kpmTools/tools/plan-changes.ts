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
import { planActionSchema } from '../../../shared/planActionSchema';
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

  const normalized: PlanAction[] = [];
  for (const action of actions) {
    if (action.type !== 'create_item') {
      normalized.push(action);
      continue;
    }

    const primaryRepoId = action.primary_repo_id ?? soleRepoId;
    const affectedRepoIds = [...new Set(action.affected_repo_ids ?? [])]
      .filter((repoId) => repoId !== primaryRepoId);
    const proposedRepoIds = [primaryRepoId, ...affectedRepoIds]
      .filter((repoId): repoId is string => Boolean(repoId));
    const invalidRepoIds = proposedRepoIds.filter((repoId) => !connectedRepoIds.has(repoId));
    if (invalidRepoIds.length > 0) {
      return {
        actions,
        error: `Repo target is not connected to this project: ${[...new Set(invalidRepoIds)].join(', ')}`,
      };
    }

    normalized.push({
      ...action,
      primary_repo_id: primaryRepoId,
      affected_repo_ids: affectedRepoIds,
    });
  }

  return { actions: normalized };
}

/**
 * Create the plan changes tool.
 *
 * @param onPlanActions - Callback to emit proposed actions to the UI for approval
 */
export function createPlanChangeTools(
  onPlanActions: PlanActionsCallback,
  repos: Pick<IRepoRepository, 'getByProject'>,
) {
  return [
    tool(
      'modify_plan',
      `Modify the plan. KPM will either queue these changes for review or apply them immediately, depending on the user's approval setting.

Plan items carry structured fields that flow to the agent, the reviewer, and generated artifacts:
- **intent** (one sentence, local-only): what "done" means at a glance. The decided outcome.
- **acceptance_criteria** (string[], local-only): testable checklist the agent will satisfy. Each entry is one criterion.
- **description** (markdown, **synced to Jira/Linear**): rationale, context, rejected alternatives. Not the contract — the story.
- **source_document_id** (local-only): if this item was extracted from an iteration doc, carry the breadcrumb here.
- **primary_repo_id** (local-only): the connected repo UUID most likely to own implementation. Use the repo IDs shown in Project Context. Set null when multiple repos are plausible and none is clearly primary.
- **affected_repo_ids** (local-only): other connected repo UUIDs the item is expected to affect. Do not repeat primary_repo_id.

Repo targeting:
- Infer targets from the focused repo/files and the repos you inspected before creating the item.
- If exactly one repo is connected, KPM selects it automatically.
- Never guess an opaque repo UUID. Use only IDs shown in Project Context.
- Leave primary_repo_id null when the evidence is ambiguous. The user can change it during review.

Together, title + description/context + intent + acceptance_criteria are the item's **Work Brief**. After creation, **revise_work_brief is the only chat action allowed to change any Work Brief field**. First fetch the full current item, then submit the complete replacement Work Brief with its current work_brief_revision as expected_revision. Never send a partial brief. A revision conflict means you must fetch again before proposing another revision.

Use intent + acceptance_criteria as the primary shape for implementation items. Use description for discovery/research items where criteria cannot be enumerated yet. Never put **Intent** or **Acceptance Criteria** headings inside description/context; headings there are ordinary context and do not define the execution contract.

**Sync boundary — critical.** When an item has a Jira/Linear association, its \`description\` is pushed to the external tracker as-is. Keep description sync-clean:
- **Never** mention KPM document IDs (e.g., \`doc-42\`, \`source_document_id: ...\`) or other local-only resources inside description. Those references are dead outside the developer's machine.
- **Never** cite iteration-doc filenames or local project-folder paths unless they correspond to files actually in the synced code repo.
- Breadcrumbs to iteration docs live in the \`source_document_id\` field, never in prose.
- Code references (repo-relative paths like \`src/auth/session.ts\`) are fine in description — they exist wherever the code does.
- intent and acceptance_criteria are local-only and not synced today, so they can reference local context freely.

To reference another plan item from a description, intent, or criterion, follow **Plan References** in the system prompt.

Item actions:
- create_item: see full example below
- revise_work_brief: { "type": "revise_work_brief", "item_id": "...", "expected_revision": 3, "work_brief": { "title": "Complete title", "context": "Complete context or null", "intent": "Complete intent or null", "acceptance_criteria": ["Complete criterion list"] } }
  - Fetch the item first and replace all four fields. Never use update_item for title, description/context, intent, or acceptance_criteria.
- set_repo_targets: { "type": "set_repo_targets", "item_id": "...", "repository_scope": { "primary_repo_id": null, "affected_repo_ids": [] } }
  - Replaces the complete Repository Scope. Use only connected repo UUIDs from Project Context.
- update_item: { "type": "update_item", "item_id": "...", "updates": { "status_category": "done" } }
  - update_item is only for non-brief metadata such as status_category, label, release_tag, and source_document_id.
- delete_item: { "type": "delete_item", "item_id": "..." }
- reparent: { "type": "reparent", "item_id": "...", "new_parent_id": "..." }
- add_dependency: { "type": "add_dependency", "from_id": "...", "to_id": "..." }

Group actions (visual containers):
- create_group: { "type": "create_group", "project_id": "...", "name": "Must Do", "position_x": 0, "position_y": 0, "width": 552, "height": 300 }
- assign_to_group: { "type": "assign_to_group", "item_id": "existing-uuid", "group_id": "$1" }
- update_group: { "type": "update_group", "group_id": "...", "updates": { "name": "New Name" } }
- delete_group: { "type": "delete_group", "group_id": "..." }

Placeholder references: Use $1, $2 etc. to reference entities created earlier in the same batch. Example: first action creates a group, $1 is that group's ID for subsequent assign_to_group actions.

Full create_item example (implementation item):
{
  "type": "create_item",
  "title": "Add session timeout warning modal",
  "intent": "Warn users before their session expires so they don't lose unsaved work.",
  "acceptance_criteria": [
    "Warning modal appears 5 minutes before session expires",
    "Modal exposes an Extend Session action that refreshes the token",
    "Warning does not interrupt active form input (e.g., typing in a textarea)",
    "Dismissing the modal still lets the session expire on schedule"
  ],
  "description": "Users report losing draft work when sessions time out silently. Rejected: auto-extending the session without asking — conflicts with session-fixation mitigations.",
  "parent_id": null,
  "primary_repo_id": null,
  "affected_repo_ids": []
}

Exploratory item example (no criteria yet):
{
  "type": "create_item",
  "title": "Investigate storage budget for offline mode",
  "intent": "Decide whether IndexedDB is a viable target for offline plan caching.",
  "description": "Open question: are per-origin quotas predictable enough to rely on? Compare against OPFS.",
  "parent_id": null
}

Hierarchy and Groups: follow **Plan Structure** in the system prompt. A placeholder ($1, $2) is a valid \`parent_id\` when the parent is created in the same batch; every other \`parent_id\` must be an ID resolved from a query tool.`,
      {
        message: z.string().describe('Brief description of the proposed changes'),
        actions: z.array(planActionSchema).describe('The plan actions to propose'),
      },
      async ({ message, actions }) => {
        const repoTargets = normalizeRepoTargets(
          actions,
          getCurrentToolExecutionContext()?.projectId,
          repos,
        );
        if (repoTargets.error) return toolError(repoTargets.error);

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
