import { describe, expect, it } from 'vitest';
import { buildPlanItemUpdateShape } from './planItemFieldSchemas';
import { z } from 'zod';
import { fieldsEditableVia } from '../../../shared/planItemFields';

describe('buildPlanItemUpdateShape', () => {
  it('ipc shape accepts every registry field', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    const parsed = schema.parse({
      title: 'A title',
      description: null,
      intent: null,
      acceptance_criteria: null,
      source_document_id: null,
      label: null,
      release_tag: null,
      status_category: 'in_progress',
      status: 'planned',
      parent_id: null,
      item_order: 0,
      code_refs: null,
      position_x: 0,
      position_y: 0,
      group_id: null,
    });
    expect(parsed.title).toBe('A title');
  });

  it('planAction shape rejects structural fields not on its editableVia list', () => {
    const schema = z.object(buildPlanItemUpdateShape('planAction')).strict();
    const result = schema.safeParse({ title: 'ok', item_order: 5 });
    expect(result.success).toBe(false);
  });

  it('planAction shape matches the fields editableVia("planAction") reports', () => {
    const shapeKeys = Object.keys(buildPlanItemUpdateShape('planAction')).sort();
    expect(shapeKeys).toEqual(fieldsEditableVia('planAction').sort());
  });

  it('title rejects empty string (matches prior hand-written schema)', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    const result = schema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('title rejects strings over 500 chars', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    const result = schema.safeParse({ title: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('description accepts null and long-but-in-bounds strings', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ description: null }).success).toBe(true);
    expect(schema.safeParse({ description: 'x'.repeat(50000) }).success).toBe(true);
    expect(schema.safeParse({ description: 'x'.repeat(50001) }).success).toBe(false);
  });

  it('acceptance_criteria enforces max 50 entries of max 1000 chars', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ acceptance_criteria: Array(50).fill('ok') }).success).toBe(true);
    expect(schema.safeParse({ acceptance_criteria: Array(51).fill('ok') }).success).toBe(false);
    expect(schema.safeParse({ acceptance_criteria: ['a'.repeat(1001)] }).success).toBe(false);
    expect(schema.safeParse({ acceptance_criteria: [''] }).success).toBe(false);
  });

  it('status_category rejects values outside the enum', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ status_category: 'not_a_real_status' }).success).toBe(false);
    expect(schema.safeParse({ status_category: null }).success).toBe(true);
  });

  it('item_order rejects negative and non-integer values', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ item_order: -1 }).success).toBe(false);
    expect(schema.safeParse({ item_order: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ item_order: 0 }).success).toBe(true);
  });

  it('position_x/position_y enforce the canvas bounds', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ position_x: -10000 }).success).toBe(true);
    expect(schema.safeParse({ position_x: 100000 }).success).toBe(true);
    expect(schema.safeParse({ position_x: -10001 }).success).toBe(false);
    expect(schema.safeParse({ position_x: 100001 }).success).toBe(false);
    expect(schema.safeParse({ position_y: null }).success).toBe(true);
  });

  it('status only accepts the literal "planned"', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ status: 'planned' }).success).toBe(true);
    expect(schema.safeParse({ status: 'backlog' }).success).toBe(false);
  });

  it('parent_id requires UUID format (matches prior hand-written schema)', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ parent_id: 'not-a-uuid' }).success).toBe(false);
    expect(schema.safeParse({ parent_id: '123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
    expect(schema.safeParse({ parent_id: null }).success).toBe(true);
  });

  it('code_refs accepts any string array with no length caps (matches prior hand-written schema)', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ code_refs: Array(500).fill('x'.repeat(2000)) }).success).toBe(true);
    expect(schema.safeParse({ code_refs: [''] }).success).toBe(true);
    expect(schema.safeParse({ code_refs: null }).success).toBe(true);
  });

  it('source_document_id and group_id accept unbounded strings (matches prior hand-written schema)', () => {
    const schema = z.object(buildPlanItemUpdateShape('ipc'));
    expect(schema.safeParse({ source_document_id: 'x'.repeat(5000) }).success).toBe(true);
    expect(schema.safeParse({ group_id: 'x'.repeat(5000) }).success).toBe(true);
  });
});
