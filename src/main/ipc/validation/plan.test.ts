import { describe, expect, it } from 'vitest';
import type { PlanAction } from '../../../shared/types';
import { planActionSchema } from './plan';

/**
 * Canonical list of PlanAction discriminators.
 *
 * This is the single source of truth the three layers must agree on:
 *   - `PlanAction` union in `src/shared/types.ts`
 *   - `planActionSchema` in `src/main/ipc/validation/plan.ts`
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

  it('update_item.updates preserves intent, acceptance_criteria, and source_document_id', () => {
    const parsed = planActionSchema.parse({
      type: 'update_item',
      item_id: 'item-1',
      updates: {
        intent: 'Revised intent',
        acceptance_criteria: ['Revised criterion'],
        source_document_id: 'doc-456',
      },
    });

    expect(parsed).toMatchObject({
      type: 'update_item',
      updates: {
        intent: 'Revised intent',
        acceptance_criteria: ['Revised criterion'],
        source_document_id: 'doc-456',
      },
    });
  });

  it('update_item.updates accepts null to clear spec fields', () => {
    const parsed = planActionSchema.parse({
      type: 'update_item',
      item_id: 'item-1',
      updates: {
        intent: null,
        acceptance_criteria: null,
        source_document_id: null,
      },
    });

    expect(parsed).toMatchObject({
      type: 'update_item',
      updates: {
        intent: null,
        acceptance_criteria: null,
        source_document_id: null,
      },
    });
  });
});
