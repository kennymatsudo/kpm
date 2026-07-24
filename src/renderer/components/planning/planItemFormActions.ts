import type { PlanAction, PlanItem, StatusCategory } from '../../../shared/types';
import type { RepositoryScope, WorkBriefDraft } from '../../../shared/workBrief';
import {
  normalizeWorkBriefDraft,
  repositoryScopeFromPlanItem,
  repositoryScopeSchema,
  workBriefDraftsEqual,
  workBriefFromPlanItem,
} from '../../../shared/workBrief';

export interface PlanTaskEditDraft {
  workBrief: WorkBriefDraft;
  repositoryScope: RepositoryScope;
  label: string | null;
}

export interface CreateItemActionData {
  title: string;
  description: string | null;
  intent: string | null;
  acceptance_criteria: string[] | null;
  primary_repo_id: string | null;
  affected_repo_ids: string[];
  label: string | null;
  parent_id: string | null;
  status_category: StatusCategory | null;
}

export function buildPlanTaskEditActions(
  item: PlanItem,
  draft: PlanTaskEditDraft,
): PlanAction[] {
  const actions: PlanAction[] = [];
  const nextWorkBrief = normalizeWorkBriefDraft(draft.workBrief);
  const currentWorkBrief = workBriefFromPlanItem(item);

  if (!workBriefDraftsEqual(currentWorkBrief, nextWorkBrief)) {
    actions.push({
      type: 'revise_work_brief',
      item_id: item.id,
      expected_revision: item.work_brief_revision,
      work_brief: nextWorkBrief,
    });
  }

  const currentScope = repositoryScopeFromPlanItem(item);
  const nextScope = repositoryScopeSchema.parse(draft.repositoryScope);
  if (!repositoryScopesEqual(currentScope, nextScope)) {
    actions.push({
      type: 'set_repo_targets',
      item_id: item.id,
      repository_scope: nextScope,
    });
  }

  const currentLabel = item.label ?? null;
  if (draft.label !== currentLabel) {
    actions.push({
      type: 'update_item',
      item_id: item.id,
      updates: { label: draft.label },
    });
  }

  return actions;
}

export function buildCreateItemActions(
  item: CreateItemActionData,
  canvasPosition?: { x: number; y: number } | null,
): PlanAction[] {
  const actions: PlanAction[] = [
    {
      type: 'create_item',
      title: item.title,
      description: item.description ?? undefined,
      intent: item.intent ?? undefined,
      acceptance_criteria: item.acceptance_criteria ?? undefined,
      primary_repo_id: item.primary_repo_id,
      affected_repo_ids: item.affected_repo_ids,
      label: item.label ?? undefined,
      parent_id: item.parent_id,
    },
  ];

  if (item.status_category) {
    actions.push({
      type: 'update_item',
      item_id: '$1',
      updates: { status_category: item.status_category },
    });
  }

  if (canvasPosition) {
    actions.push({
      type: 'set_position',
      item_id: '$1',
      x: canvasPosition.x,
      y: canvasPosition.y,
    });
  }

  return actions;
}

function repositoryScopesEqual(left: RepositoryScope, right: RepositoryScope): boolean {
  if (left.primary_repo_id !== right.primary_repo_id) return false;
  if (left.affected_repo_ids.length !== right.affected_repo_ids.length) return false;
  const rightRepoIds = new Set(right.affected_repo_ids);
  return left.affected_repo_ids.every((repoId) => rightRepoIds.has(repoId));
}
