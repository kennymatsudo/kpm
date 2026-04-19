import { describe, it, expect } from 'vitest';
import {
  parseLinearFilter,
  stringifyLinearFilter,
  buildLinearIssueFilter,
  buildParentIdentifierFilter,
  type LinearFilter,
} from './filter-types';

describe('parseLinearFilter', () => {
  it('round-trips a minimal filter', () => {
    const filter: LinearFilter = { teamKey: 'ENG' };
    const parsed = parseLinearFilter(stringifyLinearFilter(filter));
    expect(parsed).toEqual(filter);
  });

  it('round-trips a filter with all optional fields', () => {
    const filter: LinearFilter = {
      teamKey: 'ENG',
      stateIds: ['s1', 's2'],
      labelIds: ['l1'],
      projectId: 'p1',
      searchTerm: 'foo',
    };
    expect(parseLinearFilter(stringifyLinearFilter(filter))).toEqual(filter);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseLinearFilter('{not valid}')).toThrow(/not valid JSON/);
  });

  it('throws when teamKey is missing', () => {
    expect(() => parseLinearFilter(JSON.stringify({ stateIds: [] }))).toThrow(/teamKey/);
  });

  it('throws when teamKey is empty', () => {
    expect(() => parseLinearFilter(JSON.stringify({ teamKey: '' }))).toThrow(/teamKey/);
  });

  it('throws when input is not an object', () => {
    expect(() => parseLinearFilter('null')).toThrow(/expected an object/);
    expect(() => parseLinearFilter('"ENG"')).toThrow(/expected an object/);
  });
});

describe('buildLinearIssueFilter', () => {
  it('always includes team filter', () => {
    const input = buildLinearIssueFilter({ teamKey: 'ENG' });
    expect(input).toEqual({ team: { key: { eq: 'ENG' } } });
  });

  it('maps stateIds to state.id.in', () => {
    const input = buildLinearIssueFilter({ teamKey: 'ENG', stateIds: ['s1', 's2'] });
    expect(input.state).toEqual({ id: { in: ['s1', 's2'] } });
  });

  it('skips empty arrays', () => {
    const input = buildLinearIssueFilter({ teamKey: 'ENG', stateIds: [], labelIds: [] });
    expect(input.state).toBeUndefined();
    expect(input.labels).toBeUndefined();
  });

  it('maps projectId to project.id.eq', () => {
    const input = buildLinearIssueFilter({ teamKey: 'ENG', projectId: 'p1' });
    expect(input.project).toEqual({ id: { eq: 'p1' } });
  });

  it('maps searchTerm to title.containsIgnoreCase', () => {
    const input = buildLinearIssueFilter({ teamKey: 'ENG', searchTerm: 'bug' });
    expect(input.title).toEqual({ containsIgnoreCase: 'bug' });
  });
});

describe('buildParentIdentifierFilter', () => {
  it('decomposes identifiers into team-key + number and ORs them', () => {
    const input = buildParentIdentifierFilter(['ENG-1', 'ENG-42']);
    expect(input.or).toHaveLength(2);
    expect(input.or?.[0]).toEqual({
      parent: { team: { key: { eq: 'ENG' } }, number: { eq: 1 } },
    });
    expect(input.or?.[1]).toEqual({
      parent: { team: { key: { eq: 'ENG' } }, number: { eq: 42 } },
    });
  });

  it('handles multiple teams', () => {
    const input = buildParentIdentifierFilter(['ENG-1', 'OPS-7']);
    expect(input.or).toHaveLength(2);
    expect(input.or?.[1]).toEqual({
      parent: { team: { key: { eq: 'OPS' } }, number: { eq: 7 } },
    });
  });

  it('skips malformed identifiers', () => {
    const input = buildParentIdentifierFilter(['not-an-id', 'ENG-42', 'lowercase-1']);
    expect(input.or).toHaveLength(1);
    expect(input.or?.[0]).toEqual({
      parent: { team: { key: { eq: 'ENG' } }, number: { eq: 42 } },
    });
  });

  it('returns impossible predicate when all identifiers are malformed', () => {
    const input = buildParentIdentifierFilter(['garbage', 'also-garbage']);
    expect(input).toEqual({ number: { eq: -1 } });
  });
});
