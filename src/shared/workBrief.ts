import { z } from 'zod';
import type { PlanItem } from './base-types';
import { PLAN_ITEM_FIELDS } from './planItemFields';

export const WORK_BRIEF_LIMITS = {
  title: PLAN_ITEM_FIELDS.title.fieldKind.maxLength,
  context: PLAN_ITEM_FIELDS.description.fieldKind.maxLength,
  intent: PLAN_ITEM_FIELDS.intent.fieldKind.maxLength,
  criteria: PLAN_ITEM_FIELDS.acceptance_criteria.fieldKind.maxItems,
  criterion: PLAN_ITEM_FIELDS.acceptance_criteria.fieldKind.maxItemLength,
} as const;

const normalizedNullableText = (maxLength: number) => z
  .string()
  .max(maxLength)
  .nullable()
  .transform((value) => {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  });

export const workBriefDraftSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(WORK_BRIEF_LIMITS.title),
  context: normalizedNullableText(WORK_BRIEF_LIMITS.context),
  intent: normalizedNullableText(WORK_BRIEF_LIMITS.intent),
  acceptance_criteria: z
    .array(z.string().trim().min(1, 'Criterion cannot be empty').max(WORK_BRIEF_LIMITS.criterion))
    .max(WORK_BRIEF_LIMITS.criteria),
});

export type WorkBriefDraft = z.infer<typeof workBriefDraftSchema>;

export const workBriefSchema = workBriefDraftSchema.extend({
  revision: z.number().int().positive(),
});

export type WorkBrief = z.infer<typeof workBriefSchema>;

export const repositoryScopeSchema = z.object({
  primary_repo_id: z.string().uuid().nullable(),
  affected_repo_ids: z.array(z.string().uuid()).max(50),
}).transform((scope) => ({
  primary_repo_id: scope.primary_repo_id,
  affected_repo_ids: [...new Set(scope.affected_repo_ids)].filter(
    (repoId) => repoId !== scope.primary_repo_id,
  ),
}));

export type RepositoryScope = z.infer<typeof repositoryScopeSchema>;

export function normalizeWorkBriefDraft(draft: WorkBriefDraft): WorkBriefDraft {
  return workBriefDraftSchema.parse(draft);
}

export function workBriefFromPlanItem(item: Pick<PlanItem,
  'title' | 'description' | 'intent' | 'acceptance_criteria' | 'work_brief_revision'
>): WorkBrief {
  // Persisted and imported legacy rows can predate today's authoring limits.
  // Projection must remain lossless; validation and normalization happen when
  // a caller creates or revises the Work Brief.
  return {
    title: item.title,
    context: item.description,
    intent: item.intent,
    acceptance_criteria: item.acceptance_criteria ?? [],
    revision: item.work_brief_revision ?? 1,
  };
}

export function repositoryScopeFromPlanItem(item: Pick<PlanItem,
  'primary_repo_id' | 'affected_repo_ids'
>): RepositoryScope {
  return repositoryScopeSchema.parse({
    primary_repo_id: item.primary_repo_id ?? null,
    affected_repo_ids: item.affected_repo_ids ?? [],
  });
}

export function workBriefDraftsEqual(left: WorkBriefDraft, right: WorkBriefDraft): boolean {
  const normalizedLeft = normalizeWorkBriefDraft(left);
  const normalizedRight = normalizeWorkBriefDraft(right);
  return (
    normalizedLeft.title === normalizedRight.title
    && normalizedLeft.context === normalizedRight.context
    && normalizedLeft.intent === normalizedRight.intent
    && normalizedLeft.acceptance_criteria.length === normalizedRight.acceptance_criteria.length
    && normalizedLeft.acceptance_criteria.every(
      (criterion, index) => criterion === normalizedRight.acceptance_criteria[index],
    )
  );
}
