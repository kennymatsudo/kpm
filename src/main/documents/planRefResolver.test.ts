import { describe, it, expect } from 'vitest';
import {
  collectLinkedRefKeys,
  countUnlinkedRefs,
  resolvePlanRefs,
} from './planRefResolver';
import type { PlanItem } from '../../shared/types';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

function makeItem(id: string, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id,
    parent_id: null,
    title: 'Untitled',
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

describe('resolvePlanRefs', () => {
  it('returns the input unchanged when there are no refs', () => {
    expect(resolvePlanRefs('plain text', [], 'jira')).toBe('plain text');
  });

  it('rewrites linked refs to a markdown link of the tracker key for jira', () => {
    const items = [
      makeItem(A, {
        title: 'Ship the export pipeline',
        external_key: 'ENG-451',
        external_url: 'https://corp.atlassian.net/browse/ENG-451',
        external_type: 'jira',
      }),
    ];
    const out = resolvePlanRefs(`Closes @plan/${A} today.`, items, 'jira');
    expect(out).toBe(
      'Closes [ENG-451](https://corp.atlassian.net/browse/ENG-451) today.',
    );
  });

  it('rewrites linked refs to bare key for github (Closes line is added by caller)', () => {
    const items = [
      makeItem(A, {
        external_key: 'ENG-451',
        external_url: 'https://corp.atlassian.net/browse/ENG-451',
      }),
    ];
    expect(resolvePlanRefs(`See @plan/${A}.`, items, 'github')).toBe(
      'See ENG-451.',
    );
  });

  it('falls back to title when item has no tracker linkage', () => {
    const items = [makeItem(A, { title: 'Foo' })];
    expect(resolvePlanRefs(`See @plan/${A}.`, items, 'jira')).toBe('See Foo.');
  });

  it('leaves literal token for unknown refs (broken-link signal)', () => {
    expect(resolvePlanRefs(`See @plan/${A}.`, [], 'jira')).toBe(
      `See @plan/${A}.`,
    );
  });

  it('does not rewrite refs inside fenced code blocks', () => {
    const items = [
      makeItem(A, {
        external_key: 'ENG-451',
        external_url: 'https://corp.atlassian.net/browse/ENG-451',
      }),
    ];
    const text = ['Top: @plan/' + A, '```', '@plan/' + A, '```'].join('\n');
    const out = resolvePlanRefs(text, items, 'jira');
    expect(out).toContain('Top: [ENG-451]');
    // The code block ref stays literal.
    const lines = out.split('\n');
    expect(lines[2]).toBe('@plan/' + A);
  });

  it('handles multiple distinct refs', () => {
    const items = [
      makeItem(A, {
        title: 'Alpha',
        external_key: 'ENG-1',
        external_url: 'https://corp.atlassian.net/browse/ENG-1',
      }),
      makeItem(B, { title: 'Beta' }),
    ];
    const out = resolvePlanRefs(
      `First @plan/${A} then @plan/${B}.`,
      items,
      'jira',
    );
    expect(out).toBe(
      'First [ENG-1](https://corp.atlassian.net/browse/ENG-1) then Beta.',
    );
  });
});

describe('countUnlinkedRefs', () => {
  it('counts only resolved-but-unlinked refs', () => {
    const items = [
      makeItem(A, {
        external_key: 'ENG-1',
        external_url: 'https://corp.atlassian.net/browse/ENG-1',
      }),
      makeItem(B, { title: 'Plain' }),
    ];
    expect(
      countUnlinkedRefs(`@plan/${A} @plan/${B} @plan/${C}`, items),
    ).toBe(1); // A linked, B unlinked, C unknown (not counted)
  });

  it('returns 0 for ref-free text', () => {
    expect(countUnlinkedRefs('hello', [])).toBe(0);
  });
});

describe('collectLinkedRefKeys', () => {
  it('returns external keys for linked refs in document order, deduped', () => {
    const items = [
      makeItem(A, {
        external_key: 'ENG-1',
        external_url: 'https://corp.atlassian.net/browse/ENG-1',
      }),
      makeItem(B, {
        external_key: 'ENG-2',
        external_url: 'https://corp.atlassian.net/browse/ENG-2',
      }),
    ];
    expect(
      collectLinkedRefKeys(
        `@plan/${B} then @plan/${A} then @plan/${B} again`,
        items,
      ),
    ).toEqual(['ENG-2', 'ENG-1']);
  });

  it('skips unlinked and unknown refs', () => {
    const items = [makeItem(A, { title: 'Plain' })];
    expect(collectLinkedRefKeys(`@plan/${A} @plan/${B}`, items)).toEqual([]);
  });
});

describe('resolvePlanRefs(shared-doc)', () => {
  it('rewrites a bare @plan token to a markdown link with the title', () => {
    const items = [makeItem(A, { title: 'Auth refactor' })];
    expect(resolvePlanRefs(`see @plan/${A}.`, items, 'shared-doc')).toBe(
      `see [Auth refactor](@plan/${A}).`,
    );
  });

  it('rewrites refs with no tracker linkage (no early-return)', () => {
    const items = [makeItem(A, { title: 'Local-only', external_key: null, external_url: null })];
    expect(resolvePlanRefs(`@plan/${A}`, items, 'shared-doc')).toBe(
      `[Local-only](@plan/${A})`,
    );
  });

  it('leaves refs already in [title](@plan/<uuid>) form untouched (idempotent re-saves)', () => {
    const items = [makeItem(A, { title: 'New title' })];
    const input = `prefix [Old title](@plan/${A}) suffix`;
    expect(resolvePlanRefs(input, items, 'shared-doc')).toBe(input);
  });

  it('preserves bare-token form for unknown UUIDs (graceful degradation)', () => {
    expect(resolvePlanRefs(`@plan/${B}`, [], 'shared-doc')).toBe(`@plan/${B}`);
  });

  it('rewrites only the bare token when the file mixes both forms', () => {
    const items = [
      makeItem(A, { title: 'A title' }),
      makeItem(C, { title: 'C title' }),
    ];
    const input = `bare @plan/${A} and wrapped [C label](@plan/${C}).`;
    expect(resolvePlanRefs(input, items, 'shared-doc')).toBe(
      `bare [A title](@plan/${A}) and wrapped [C label](@plan/${C}).`,
    );
  });

  it('does not rewrite refs inside fenced code blocks', () => {
    const items = [makeItem(A, { title: 'X' })];
    const input = '```\n@plan/' + A + '\n```';
    expect(resolvePlanRefs(input, items, 'shared-doc')).toBe(input);
  });
});
