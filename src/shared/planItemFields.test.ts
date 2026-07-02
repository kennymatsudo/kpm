import { describe, expect, it } from 'vitest';
import { PLAN_ITEM_FIELDS, fieldsEditableVia, isJsonEncodedKind } from './planItemFields';

describe('PLAN_ITEM_FIELDS', () => {
  it('every entry has a non-empty editableVia', () => {
    for (const [name, descriptor] of Object.entries(PLAN_ITEM_FIELDS)) {
      expect(descriptor.editableVia.length, `${name} has no editableVia channel`).toBeGreaterThan(0);
    }
  });

  it('sqlColumn matches the registry key for every field', () => {
    for (const [name, descriptor] of Object.entries(PLAN_ITEM_FIELDS)) {
      expect(descriptor.sqlColumn).toBe(name);
    }
  });

  it('only array-shaped kinds are JSON-encoded', () => {
    // isJsonEncodedKind is derived from fieldKind itself, not a separate flag,
    // so there is no way for a field's Zod shape and its encoding to disagree.
    expect(isJsonEncodedKind(PLAN_ITEM_FIELDS.acceptance_criteria.fieldKind)).toBe(true);
    expect(isJsonEncodedKind(PLAN_ITEM_FIELDS.code_refs.fieldKind)).toBe(true);
    expect(isJsonEncodedKind(PLAN_ITEM_FIELDS.title.fieldKind)).toBe(false);
    expect(isJsonEncodedKind(PLAN_ITEM_FIELDS.description.fieldKind)).toBe(false);
    expect(isJsonEncodedKind(PLAN_ITEM_FIELDS.item_order.fieldKind)).toBe(false);
  });
});

describe('fieldsEditableVia', () => {
  it('planAction is a subset of ipc', () => {
    const ipcFields = new Set(fieldsEditableVia('ipc'));
    const planActionFields = fieldsEditableVia('planAction');
    for (const field of planActionFields) {
      expect(ipcFields.has(field), `${field} is planAction-editable but not ipc-editable`).toBe(true);
    }
  });

  it('planAction excludes structural fields with dedicated PlanActions', () => {
    const planActionFields = new Set(fieldsEditableVia('planAction'));
    for (const structural of ['parent_id', 'item_order', 'position_x', 'position_y', 'group_id', 'status']) {
      expect(planActionFields.has(structural as never)).toBe(false);
    }
  });

  it('ipc includes every registry field', () => {
    expect(fieldsEditableVia('ipc').sort()).toEqual(Object.keys(PLAN_ITEM_FIELDS).sort());
  });
});
