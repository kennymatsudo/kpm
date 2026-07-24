import { describe, it, expect } from 'vitest';
import {
  PLAN_REF_REGEX,
  expandPlanRefs,
  findRefs,
  serializeRef,
  tokenizeRefs,
} from './planRefs';
import type { PlanItem } from './base-types';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

function makeItem(id: string, title: string): PlanItem {
  return {
    id,
    parent_id: null,
    title,
    description: null,
    intent: null,
    acceptance_criteria: null,
    work_brief_revision: 1,
    source_document_id: null,
    label: null,
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_status: null,
    status_category: null,
    external_url: null,
  };
}

describe('serializeRef', () => {
  it('produces canonical lowercase token', () => {
    expect(serializeRef(A)).toBe(`@plan/${A}`);
  });

  it('lowercases an upper-case UUID', () => {
    expect(serializeRef(A.toUpperCase())).toBe(`@plan/${A}`);
  });
});

describe('serializeRef <-> findRefs round-trip', () => {
  it('finds a serialized ref back', () => {
    const text = `See ${serializeRef(A)} for details.`;
    expect(findRefs(text)).toEqual([
      { id: A, start: 4, end: 4 + 6 + A.length },
    ]);
  });

  it('round-trips many refs', () => {
    const text = `${serializeRef(A)} and ${serializeRef(B)}.`;
    const found = findRefs(text);
    expect(found.map((m) => m.id)).toEqual([A, B]);
  });
});

describe('findRefs — positioning', () => {
  it('matches a ref at the very start of the doc', () => {
    const text = `${serializeRef(A)} kicks off the work.`;
    const matches = findRefs(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: A, start: 0 });
    expect(text.slice(matches[0].start, matches[0].end)).toBe(serializeRef(A));
  });

  it('matches a ref at the very end of the doc', () => {
    const text = `Closes ${serializeRef(B)}`;
    const matches = findRefs(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].end).toBe(text.length);
  });

  it('matches mid-prose refs surrounded by punctuation', () => {
    const text = `(see ${serializeRef(A)}, ${serializeRef(B)}!)`;
    const matches = findRefs(text);
    expect(matches.map((m) => m.id)).toEqual([A, B]);
  });

  it('returns matches in document order', () => {
    const text = `${serializeRef(B)} then ${serializeRef(A)} then ${serializeRef(C)}`;
    const matches = findRefs(text);
    expect(matches.map((m) => m.id)).toEqual([B, A, C]);
  });
});

describe('findRefs — UUID validation', () => {
  it('does not match a UUID with the wrong version digit', () => {
    // Version digit '3' instead of '4'
    const bad = 'aaaaaaaa-aaaa-3aaa-8aaa-aaaaaaaaaaaa';
    expect(findRefs(`@plan/${bad}`)).toEqual([]);
  });

  it('does not match a UUID with the wrong variant nibble', () => {
    // Variant nibble 'c' instead of 8/9/a/b
    const bad = 'aaaaaaaa-aaaa-4aaa-caaa-aaaaaaaaaaaa';
    expect(findRefs(`@plan/${bad}`)).toEqual([]);
  });

  it('does not match a truncated UUID', () => {
    const truncated = A.slice(0, A.length - 1);
    expect(findRefs(`@plan/${truncated}`)).toEqual([]);
  });

  it('does not match a UUID without hyphens', () => {
    const noHyphens = A.replace(/-/g, '');
    expect(findRefs(`@plan/${noHyphens}`)).toEqual([]);
  });

  it('does not match plain text mentioning "plan" without the @ prefix', () => {
    expect(findRefs(`plan/${A}`)).toEqual([]);
  });

  it('does not match a different sigil', () => {
    expect(findRefs(`#plan/${A}`)).toHaveLength(0);
    // The match still finds the ref-suffix portion only if the sigil is `@plan/`.
    // `&plan/<uuid>` should not match.
    expect(findRefs(`&plan/${A}`)).toEqual([]);
  });
});

describe('findRefs — case insensitivity', () => {
  it('matches an upper-case UUID and normalizes to lowercase', () => {
    const text = `Look at @plan/${A.toUpperCase()} please`;
    const matches = findRefs(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(A);
  });

  it('matches mixed-case sigil', () => {
    // Note: the docs don't promise this but the regex flag is `i`. Lock the
    // behavior so a future regex change is a deliberate decision.
    const text = `@PLAN/${A}`;
    expect(findRefs(text)).toHaveLength(1);
  });
});

describe('findRefs — fenced code blocks', () => {
  it('skips refs inside a ``` block', () => {
    const text = [
      `Outside: ${serializeRef(A)}`,
      '```',
      `Inside: ${serializeRef(B)}`,
      '```',
      `After: ${serializeRef(C)}`,
    ].join('\n');
    const matches = findRefs(text);
    expect(matches.map((m) => m.id)).toEqual([A, C]);
  });

  it('skips refs inside a ~~~ block', () => {
    const text = ['~~~', `${serializeRef(A)}`, '~~~'].join('\n');
    expect(findRefs(text)).toEqual([]);
  });

  it('does not let a ~~~ closer end a ``` block', () => {
    const text = [
      '```',
      `${serializeRef(A)}`,
      '~~~', // wrong closer — should not end the block
      `${serializeRef(B)}`,
      '```',
      `After: ${serializeRef(C)}`,
    ].join('\n');
    expect(findRefs(text).map((m) => m.id)).toEqual([C]);
  });

  it('treats an unterminated fence as running to end of text', () => {
    const text = [
      `Before: ${serializeRef(A)}`,
      '```',
      `${serializeRef(B)}`,
      // no closer
    ].join('\n');
    expect(findRefs(text).map((m) => m.id)).toEqual([A]);
  });

  it('still matches refs inside inline code spans', () => {
    // Inline code (single backticks) is intentionally not skipped.
    const text = `See \`${serializeRef(A)}\` here.`;
    expect(findRefs(text).map((m) => m.id)).toEqual([A]);
  });

  it('handles consecutive fenced blocks', () => {
    const text = [
      `Top: ${serializeRef(A)}`,
      '```',
      `${serializeRef(B)}`,
      '```',
      'Middle prose',
      '```',
      `${serializeRef(C)}`,
      '```',
      'Bottom',
    ].join('\n');
    expect(findRefs(text).map((m) => m.id)).toEqual([A]);
  });
});

describe('tokenizeRefs', () => {
  it('returns a single text segment for ref-free input', () => {
    expect(tokenizeRefs('plain text')).toEqual([
      { type: 'text', value: 'plain text' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(tokenizeRefs('')).toEqual([]);
  });

  it('alternates text and ref segments', () => {
    const text = `Hi ${serializeRef(A)} there ${serializeRef(B)}!`;
    const segments = tokenizeRefs(text);
    expect(segments).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'ref', id: A, start: 3, end: 3 + serializeRef(A).length },
      {
        type: 'text',
        value: ' there ',
      },
      {
        type: 'ref',
        id: B,
        start: 3 + serializeRef(A).length + ' there '.length,
        end:
          3 +
          serializeRef(A).length +
          ' there '.length +
          serializeRef(B).length,
      },
      { type: 'text', value: '!' },
    ]);
  });

  it('emits no leading text segment when ref starts at offset 0', () => {
    const text = `${serializeRef(A)} tail`;
    const [first] = tokenizeRefs(text);
    expect(first.type).toBe('ref');
  });

  it('emits no trailing text segment when ref ends at end-of-string', () => {
    const text = `head ${serializeRef(A)}`;
    const segments = tokenizeRefs(text);
    expect(segments[segments.length - 1].type).toBe('ref');
  });

  it('skips refs inside fenced code blocks (folds into surrounding text)', () => {
    const text = [`Top ${serializeRef(A)}`, '```', `${serializeRef(B)}`, '```'].join('\n');
    const segments = tokenizeRefs(text);
    const refIds = segments.flatMap((s) => (s.type === 'ref' ? [s.id] : []));
    expect(refIds).toEqual([A]);
  });
});

describe('expandPlanRefs', () => {
  it('returns [] for ref-free input', () => {
    expect(expandPlanRefs('plain text', [])).toEqual([]);
  });

  it('resolves known refs to their PlanItem', () => {
    const items = [makeItem(A, 'Alpha'), makeItem(B, 'Beta')];
    const text = `${serializeRef(A)} and ${serializeRef(B)}`;
    const expanded = expandPlanRefs(text, items);
    expect(expanded).toHaveLength(2);
    expect(expanded[0].item?.title).toBe('Alpha');
    expect(expanded[1].item?.title).toBe('Beta');
  });

  it('returns item: null for unknown UUIDs', () => {
    const text = `hello ${serializeRef(A)}`;
    const expanded = expandPlanRefs(text, []);
    expect(expanded).toHaveLength(1);
    expect(expanded[0].id).toBe(A);
    expect(expanded[0].item).toBeNull();
  });

  it('matches case-insensitively against the items map', () => {
    // Item id stored in upper-case; ref written in lower-case. Should resolve.
    const items = [makeItem(A.toUpperCase(), 'Alpha')];
    const expanded = expandPlanRefs(serializeRef(A), items);
    expect(expanded[0].item?.title).toBe('Alpha');
  });

  it('skips refs inside fenced code blocks', () => {
    const items = [makeItem(A, 'Alpha'), makeItem(B, 'Beta')];
    const text = [`Top ${serializeRef(A)}`, '```', serializeRef(B), '```'].join('\n');
    const expanded = expandPlanRefs(text, items);
    expect(expanded.map((e) => e.id)).toEqual([A]);
  });
});

describe('PLAN_REF_REGEX', () => {
  it('is a global, case-insensitive regex', () => {
    expect(PLAN_REF_REGEX.flags).toContain('g');
    expect(PLAN_REF_REGEX.flags).toContain('i');
  });
});
