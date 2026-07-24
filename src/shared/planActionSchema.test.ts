import { describe, expect, it } from 'vitest';
import type { infer as ZodInfer } from 'zod';
import type { PlanAction } from './types';
import { planActionSchema } from './planActionSchema';
import { WORK_BRIEF_LIMITS } from './workBrief';

/**
 * Canonical list of PlanAction discriminators.
 *
 * This is the single source of truth the three layers must agree on:
 *   - `PlanAction` union in `src/shared/types.ts`
 *   - `planActionSchema` in `src/shared/planActionSchema.ts`
 *   - switch cases in `src/main/db/domain/PlanActionService.ts`
 *
 * Adding a new action type? Update this list, then follow the compile errors.
 */
const CANONICAL_ACTION_TYPES = [
  'create_item',
  'reparent',
  'set_label',
  'set_release',
  'add_dependency',
  'remove_dependency',
  'reorder',
  'update_item',
  'revise_work_brief',
  'set_repo_targets',
  'delete_item',
  'set_position',
  'queue_for_tracker',
  'create_group',
  'update_group',
  'delete_group',
  'assign_to_group',
] as const;

type CanonicalType = (typeof CANONICAL_ACTION_TYPES)[number];

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertTrue<T extends true> = T;

type _CanonicalMatchesUnion = AssertTrue<Equals<CanonicalType, PlanAction['type']>>;
type _CanonicalMatchesSchema = AssertTrue<
  Equals<CanonicalType, ZodInfer<typeof planActionSchema>['type']>
>;

describe('planActionSchema discriminator sync', () => {
  it('Zod schema options match the canonical discriminator list', () => {
    const schemaTypes = planActionSchema.options
      .map((opt) => opt.shape.type.value as string)
      .sort();
    expect(schemaTypes).toEqual([...CANONICAL_ACTION_TYPES].sort());
  });
});

describe('planActionSchema spec field pass-through', () => {
  it('create_item preserves intent, acceptance_criteria, and source_document_id', () => {
    const parsed = planActionSchema.parse({
      type: 'create_item',
      title: 'Example',
      parent_id: null,
      intent: 'Ship the thing',
      acceptance_criteria: ['Test A passes', 'Test B passes'],
      source_document_id: 'doc-123',
    });

    expect(parsed).toMatchObject({
      type: 'create_item',
      intent: 'Ship the thing',
      acceptance_criteria: ['Test A passes', 'Test B passes'],
      source_document_id: 'doc-123',
    });
  });

  it('rejects create fields that exceed Work Brief authoring limits', () => {
    expect(() => planActionSchema.parse({
      type: 'create_item',
      title: 'x'.repeat(WORK_BRIEF_LIMITS.title + 1),
      parent_id: null,
    })).toThrow();

    expect(() => planActionSchema.parse({
      type: 'create_item',
      title: 'Example',
      description: 'x'.repeat(WORK_BRIEF_LIMITS.context + 1),
      parent_id: null,
    })).toThrow();
  });

  it('uses revise_work_brief for full spec replacement and normalizes empty values', () => {
    const parsed = planActionSchema.parse({
      type: 'revise_work_brief',
      item_id: 'item-1',
      expected_revision: 2,
      work_brief: {
        title: ' Revised title ',
        context: ' ',
        intent: null,
        acceptance_criteria: [' Criterion '],
      },
    });

    expect(parsed).toMatchObject({
      type: 'revise_work_brief',
      expected_revision: 2,
      work_brief: {
        title: 'Revised title',
        context: null,
        intent: null,
        acceptance_criteria: ['Criterion'],
      },
    });
  });

  it('does not allow Work Brief fields through update_item', () => {
    expect(() => planActionSchema.parse({
      type: 'update_item',
      item_id: 'item-1',
      updates: { title: 'Not allowed' },
    })).toThrow();
  });
});
