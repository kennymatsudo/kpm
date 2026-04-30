import { describe, it, expect } from 'vitest';
import { formatPlanRefSection } from './contextRefs';
import type { PlanItem } from '../../shared/types';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';

function makeItem(id: string, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id,
    parent_id: null,
    title: 'Untitled',
    description: null,
    intent: null,
    acceptance_criteria: null,
    source_document_id: null,
    label: null,
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_parent_key: null,
    external_epic_key: null,
    external_status: null,
    status_category: null,
    external_url: null,
    sync_source: 'local',
    last_synced_at: null,
    ...overrides,
  };
}

describe('formatPlanRefSection', () => {
  it('returns empty string when text contains no refs', () => {
    expect(formatPlanRefSection('plain prose, no refs', [])).toBe('');
  });

  it('emits a <plan-refs> block with title, status, and tracker key', () => {
    const items = [
      makeItem(A, {
        title: 'Ship the export pipeline',
        status_category: 'in_progress',
        external_key: 'ENG-451',
      }),
    ];
    const out = formatPlanRefSection(`See @plan/${A} for context.`, items);
    expect(out).toContain('<plan-refs>');
    expect(out).toContain('@plan/' + A);
    expect(out).toContain('Ship the export pipeline');
    expect(out).toContain('status: In Progress');
    expect(out).toContain('tracker: ENG-451');
    expect(out).toMatch(/<\/plan-refs>\s*$/);
  });

  it('inlines intent and the first three criteria', () => {
    const items = [
      makeItem(A, {
        title: 'Foo',
        intent: 'Make Foo work',
        acceptance_criteria: ['c1', 'c2', 'c3', 'c4', 'c5'],
      }),
    ];
    const out = formatPlanRefSection(`@plan/${A}`, items);
    expect(out).toContain('intent: Make Foo work');
    expect(out).toContain('criteria (5):');
    expect(out).toContain('- c1');
    expect(out).toContain('- c2');
    expect(out).toContain('- c3');
    expect(out).not.toContain('- c4');
    expect(out).toContain('and 2 more');
  });

  it('marks unresolved refs explicitly', () => {
    const out = formatPlanRefSection(`@plan/${A}`, []);
    expect(out).toContain('unresolved');
  });

  it('deduplicates refs that appear multiple times', () => {
    const items = [makeItem(A, { title: 'Foo' })];
    const out = formatPlanRefSection(`@plan/${A} and again @plan/${A}`, items);
    const occurrences = out.match(new RegExp(`@plan/${A}`, 'g')) ?? [];
    // One in the header line "@plan/<id> — **title**", that's it.
    expect(occurrences.length).toBe(1);
  });

  it('skips refs inside fenced code blocks', () => {
    const items = [makeItem(A, { title: 'Foo' })];
    const text = ['```', `@plan/${A}`, '```'].join('\n');
    expect(formatPlanRefSection(text, items)).toBe('');
  });

  it('handles multiple refs in stable document order', () => {
    const items = [
      makeItem(A, { title: 'Alpha' }),
      makeItem(B, { title: 'Beta' }),
    ];
    const out = formatPlanRefSection(`@plan/${B} then @plan/${A}`, items);
    const aIdx = out.indexOf(`@plan/${B}`);
    const bIdx = out.indexOf(`@plan/${A}`);
    expect(aIdx).toBeGreaterThan(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});
