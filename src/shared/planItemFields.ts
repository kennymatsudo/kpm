/**
 * @kpm/shared-types
 *
 * Registry of PlanItem fields writable through `update_item` — both the
 * direct IPC `updateItem` call and the `update_item` PlanAction (Claude
 * tools) derive their Zod validation from this file, and
 * PlanItemRepository's dynamic UPDATE column list derives from it too.
 *
 * Not every field here is reachable from both surfaces: `update_item`'s
 * PlanAction is deliberately narrower than the IPC call — structural fields
 * like `parent_id`/`item_order`/`position_x`/`position_y`/`group_id` are
 * written through dedicated PlanActions (`reparent`, `reorder`,
 * `set_position`, `assign_to_group`) that carry their own business rules
 * (Jira-subtask nesting checks, batch reparent, etc.), so they're
 * IPC-editable only. `editableVia` records that per field.
 *
 * Excluded entirely: tracker-sync fields (`external_key`, `sync_source`,
 * ...) are owned by SyncService/ImportService via PlanItemSyncUpdates, a
 * separate ownership domain that fails independently of this one.
 *
 * This file has NO dependencies (see base-types.ts) so it can be consumed by
 * both Zod-based validation (main/ipc/validation) and the DB layer
 * (main/db/repositories) without either depending on the other.
 */

import type { PlanItem, StatusCategory } from './base-types';

/**
 * A closed set of field shapes. Every PlanItemUpdates field fits one of
 * these — a shape that doesn't fit is a signal the field needs a dedicated
 * PlanAction (like set_position) rather than a registry entry.
 *
 * `nullableJsonArray` is the only kind stored JSON-encoded (see DB CLAUDE.md's
 * JSON-array-column rule) — encoding is implied by the kind, not a separate
 * flag that could disagree with it.
 */
export type PlanItemFieldKind =
  | { kind: 'literal'; value: string }
  | { kind: 'text'; maxLength: number }
  | { kind: 'nullableText'; maxLength: number }
  | { kind: 'nullableUnboundedText' }
  | { kind: 'nullableUuid' }
  | { kind: 'nullableUnboundedStringArray' }
  | { kind: 'nullableJsonArray'; maxItemLength: number; maxItems: number }
  | { kind: 'nullableEnum'; values: readonly string[] }
  | { kind: 'number'; min?: number; max?: number; int?: boolean }
  | { kind: 'nullableNumber'; min?: number; max?: number; int?: boolean };

/** True for the kinds whose SQLite column stores the value JSON-encoded. */
export function isJsonEncodedKind(kind: PlanItemFieldKind): boolean {
  return kind.kind === 'nullableJsonArray' || kind.kind === 'nullableUnboundedStringArray';
}

/** Which caller surfaces may set this field. */
export type PlanItemFieldChannel = 'ipc' | 'planAction';

export interface PlanItemFieldDescriptor {
  /** Column name in plan_items — identical to the PlanItem property name. */
  sqlColumn: string;
  fieldKind: PlanItemFieldKind;
  editableVia: readonly PlanItemFieldChannel[];
}

const IPC_AND_PLAN_ACTION = ['ipc', 'planAction'] as const;
const IPC_ONLY = ['ipc'] as const;

/**
 * Fields writable through update_item (IPC and/or PlanAction). Keys are
 * checked against PlanItem below — a typo or removed field fails the type
 * check, not a runtime assertion.
 */
export const PLAN_ITEM_FIELDS = {
  title: {
    sqlColumn: 'title',
    fieldKind: { kind: 'text', maxLength: 500 },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  description: {
    sqlColumn: 'description',
    fieldKind: { kind: 'nullableText', maxLength: 50000 },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  intent: {
    sqlColumn: 'intent',
    fieldKind: { kind: 'nullableText', maxLength: 500 },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  acceptance_criteria: {
    sqlColumn: 'acceptance_criteria',
    fieldKind: { kind: 'nullableJsonArray', maxItemLength: 1000, maxItems: 50 },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  source_document_id: {
    sqlColumn: 'source_document_id',
    fieldKind: { kind: 'nullableUnboundedText' },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  label: {
    sqlColumn: 'label',
    fieldKind: { kind: 'nullableText', maxLength: 100 },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  release_tag: {
    sqlColumn: 'release_tag',
    fieldKind: { kind: 'nullableText', maxLength: 50 },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  status_category: {
    sqlColumn: 'status_category',
    fieldKind: {
      kind: 'nullableEnum',
      values: ['not_started', 'in_progress', 'in_review', 'done', 'blocked', 'canceled'] satisfies readonly StatusCategory[],
    },
    editableVia: IPC_AND_PLAN_ACTION,
  },
  status: {
    sqlColumn: 'status',
    fieldKind: { kind: 'literal', value: 'planned' },
    editableVia: IPC_ONLY,
  },
  parent_id: {
    sqlColumn: 'parent_id',
    fieldKind: { kind: 'nullableUuid' },
    editableVia: IPC_ONLY,
  },
  item_order: {
    sqlColumn: 'item_order',
    fieldKind: { kind: 'number', min: 0, int: true },
    editableVia: IPC_ONLY,
  },
  code_refs: {
    sqlColumn: 'code_refs',
    fieldKind: { kind: 'nullableUnboundedStringArray' },
    editableVia: IPC_ONLY,
  },
  position_x: {
    sqlColumn: 'position_x',
    fieldKind: { kind: 'nullableNumber', min: -10000, max: 100000, int: true },
    editableVia: IPC_ONLY,
  },
  position_y: {
    sqlColumn: 'position_y',
    fieldKind: { kind: 'nullableNumber', min: -10000, max: 100000, int: true },
    editableVia: IPC_ONLY,
  },
  group_id: {
    sqlColumn: 'group_id',
    fieldKind: { kind: 'nullableUnboundedText' },
    editableVia: IPC_ONLY,
  },
} as const satisfies Partial<Record<keyof PlanItem, PlanItemFieldDescriptor>>;

export type PlanItemFieldName = keyof typeof PLAN_ITEM_FIELDS;

export function fieldsEditableVia(channel: PlanItemFieldChannel): PlanItemFieldName[] {
  return (Object.keys(PLAN_ITEM_FIELDS) as PlanItemFieldName[]).filter((name) =>
    (PLAN_ITEM_FIELDS[name].editableVia as readonly PlanItemFieldChannel[]).includes(channel)
  );
}
