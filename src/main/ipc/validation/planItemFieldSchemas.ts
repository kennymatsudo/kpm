/**
 * Zod generation for the plan-item field registry (src/shared/planItemFields.ts).
 *
 * `planItemUpdates` (the IPC update_item schema) and the update_item PlanAction's
 * `updates` schema are both built from PLAN_ITEM_FIELDS, filtered by editableVia,
 * instead of being hand-kept in sync. Adding a field to the registry adds it to
 * both schemas (or one, per its editableVia tag) automatically.
 */

import { z } from 'zod';
import {
  PLAN_ITEM_FIELDS,
  fieldsEditableVia,
  type PlanItemFieldKind,
  type PlanItemFieldChannel,
} from '../../../shared/planItemFields';
import { uuid } from './shared';

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

/**
 * Build a Zod object shape for the fields editable via `channel`, all optional
 * (PlanItemUpdates-style: every field is an optional partial update).
 */
export function buildPlanItemUpdateShape(channel: PlanItemFieldChannel): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const name of fieldsEditableVia(channel)) {
    shape[name] = zodForKind(PLAN_ITEM_FIELDS[name].fieldKind).optional();
  }
  return shape;
}
