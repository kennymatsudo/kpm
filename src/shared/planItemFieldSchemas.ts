/**
 * Zod generation for the plan-item field registry (src/shared/planItemFields.ts).
 *
 * `planItemUpdates` (the IPC update_item schema) and the update_item PlanAction's
 * `updates` schema are both built from PLAN_ITEM_FIELDS, filtered by editableVia,
 * instead of being hand-kept in sync. Adding a field to the registry adds it to
 * both schemas (or one, per its editableVia tag) automatically.
 *
 * Lives in shared/ (not main/ipc/validation/) so shared/planActionSchema.ts can
 * reuse it for create_item/update_item without main importing from shared and
 * shared importing back from main.
 */

import { z } from 'zod';
import {
  PLAN_ITEM_FIELDS,
  fieldsEditableVia,
  type PlanItemFieldKind,
  type PlanItemFieldChannel,
  type FieldsEditableVia,
} from './planItemFields';
import type { PlanItem } from './base-types';

const uuid = z.string().uuid('Invalid ID format (expected UUID)');

// The registry's position fields are nullable (an item need not be placed), but a
// caller that sets a position must supply both coordinates — hence the non-nullable
// schema, bounds still owned by the registry entry.
export const canvasPosition = z
  .number()
  .int()
  .min(PLAN_ITEM_FIELDS.position_x.fieldKind.min)
  .max(PLAN_ITEM_FIELDS.position_x.fieldKind.max);

function zodForKind(kind: PlanItemFieldKind): z.ZodTypeAny {
  switch (kind.kind) {
    case 'literal':
      return z.literal(kind.value);
    case 'text':
      return z.string().min(1, 'Value cannot be empty').max(kind.maxLength, 'Value too long').trim();
    case 'nullableText':
      return z.string().max(kind.maxLength, 'Value too long').nullable();
    case 'nullableUnboundedText':
      return z.string().nullable();
    case 'nullableUuid':
      return uuid.nullable();
    case 'nullableUnboundedStringArray':
      return z.array(z.string()).nullable();
    case 'nullableJsonArray':
      return z
        .array(z.string().min(1, 'Entry cannot be empty').max(kind.maxItemLength, 'Entry too long'))
        .max(kind.maxItems, 'Too many entries')
        .nullable();
    case 'nullableEnum':
      return z.enum(kind.values as [string, ...string[]]).nullable();
    case 'number': {
      let schema = z.number();
      if (kind.int) schema = schema.int();
      if (kind.min !== undefined) schema = schema.min(kind.min);
      if (kind.max !== undefined) schema = schema.max(kind.max);
      return schema;
    }
    case 'nullableNumber': {
      let schema = z.number();
      if (kind.int) schema = schema.int();
      if (kind.min !== undefined) schema = schema.min(kind.min);
      if (kind.max !== undefined) schema = schema.max(kind.max);
      return schema.nullable();
    }
  }
}

type PlanItemUpdateShape<Channel extends PlanItemFieldChannel> = {
  [Field in FieldsEditableVia<Channel>]: z.ZodOptional<z.ZodType<PlanItem[Field], PlanItem[Field]>>;
};

export function buildPlanItemUpdateShape<Channel extends PlanItemFieldChannel>(
  channel: Channel
): PlanItemUpdateShape<Channel> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const name of fieldsEditableVia(channel)) {
    shape[name] = zodForKind(PLAN_ITEM_FIELDS[name].fieldKind).optional();
  }
  return shape as PlanItemUpdateShape<Channel>;
}

export function planItemUpdatesType<Channel extends PlanItemFieldChannel>(channel: Channel) {
  return z.object(buildPlanItemUpdateShape(channel)).strict();
}
