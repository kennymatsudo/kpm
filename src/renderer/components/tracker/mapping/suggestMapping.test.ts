import { describe, it, expect } from 'vitest';
import type { TrackerStatusOption } from '../../../stores/tracker/useMetadataStore';

const s = (name: string, categoryKey: string, id?: string): TrackerStatusOption => ({
  id: id ?? name.toLowerCase().replace(/\s/g, '-'),
  name,
  categoryKey,
});

describe('suggestStatusMapping', () => {
  it('exact-name match wins for canonical labels', () => {
    const states = [
      s('In Progress', 'indeterminate'),
      s('Blocked', 'indeterminate'),
      s('In Review', 'indeterminate'),
    ];
    const { mapping, source } = suggestStatusMapping(states);
    expect(mapping.in_progress).toBe('In Progress');
    expect(mapping.in_review).toBe('In Review');
    expect(mapping.blocked).toBe('Blocked');
    expect(source.in_progress).toBe('name-exact');
  });

  it('exact match is case-insensitive', () => {
    const states = [s('IN PROGRESS', 'indeterminate'), s('done', 'done')];
    const { mapping } = suggestStatusMapping(states);
    expect(mapping.in_progress).toBe('IN PROGRESS');
    expect(mapping.done).toBe('done');
  });

  it('sole-occupant of a bucket gets claimed when label-name does not match', () => {
    // Single started state named "Working" — no exact match on any started
    // KPM category, but it's the only state in the indeterminate bucket so
    // it claims `in_progress` (the first started-bucket category).
    const states = [
      s('Backlog', 'new'),
      s('Working', 'indeterminate'),
      s('Done', 'done'),
    ];
    const { mapping, source } = suggestStatusMapping(states);
    expect(mapping.not_started).toBe('Backlog');
    expect(mapping.done).toBe('Done');
    expect(mapping.in_progress).toBe('Working');
    expect(source.in_progress).toBe('sole-in-bucket');
    expect(mapping.in_review).toBeUndefined();
    expect(mapping.blocked).toBeUndefined();
  });

  it('keyword match fills started sub-states by convention when no exact match', () => {
    // Custom names without exact matches but recognizable keywords.
    const states = [
      s('Active', 'indeterminate'),     // → in_progress (via "active")
      s('Code Review', 'indeterminate'), // → in_review (via "review")
      s('On Hold', 'indeterminate'),     // → blocked (via "on hold")
    ];
    const { mapping, source } = suggestStatusMapping(states);
    expect(mapping.in_progress).toBe('Active');
    expect(mapping.in_review).toBe('Code Review');
    expect(mapping.blocked).toBe('On Hold');
    expect(source.in_progress).toBe('keyword');
    expect(source.in_review).toBe('keyword');
    expect(source.blocked).toBe('keyword');
  });

  it('keyword signal wins over sole-occupant defaults in shared buckets', () => {
    const { mapping, source } = suggestStatusMapping([
      s('QA', 'indeterminate'),
      s('Archived', 'done'),
    ]);

    expect(mapping.in_review).toBe('QA');
    expect(source.in_review).toBe('keyword');
    expect(mapping.in_progress).toBeUndefined();
    expect(mapping.done).toBe('Archived');
    expect(source.done).toBe('sole-in-bucket');
  });

  it('does not claim the same state for two categories', () => {
    // One started state should map to in_progress (label-exact wins) and
    // not also satisfy the in_review or blocked slot.
    const states = [s('In Progress', 'indeterminate')];
    const { mapping } = suggestStatusMapping(states);
    expect(mapping.in_progress).toBe('In Progress');
    expect(mapping.in_review).toBeUndefined();
    expect(mapping.blocked).toBeUndefined();
  });

  it('leaves a category empty when no candidate exists in the bucket', () => {
    const states = [s('Backlog', 'new'), s('Done', 'done')];
    const { mapping } = suggestStatusMapping(states);
    expect(mapping.not_started).toBe('Backlog');
    expect(mapping.done).toBe('Done');
    expect(mapping.in_progress).toBeUndefined();
    expect(mapping.in_review).toBeUndefined();
    expect(mapping.blocked).toBeUndefined();
    expect(mapping.canceled).toBeUndefined();
  });

  it('canceled is picked from the done bucket via keyword when distinct from done', () => {
    const states = [
      s('Done', 'done'),
      s('Cancelled', 'done'),
    ];
    const { mapping, source } = suggestStatusMapping(states);
    expect(mapping.done).toBe('Done');
    expect(mapping.canceled).toBe('Cancelled');
    expect(source.canceled).toBe('keyword');
  });

  it('returns an empty mapping for an empty status list', () => {
    const { mapping, source } = suggestStatusMapping([]);
    expect(mapping).toEqual({});
    expect(source).toEqual({});
  });

  it('handles a real Linear PROJ-shaped team (most common case)', () => {
    const states = [
      s('Triage', 'new'),
      s('Backlog', 'new'),
      s('Todo', 'new'),
      s('In Progress', 'indeterminate'),
      s('In Review', 'indeterminate'),
      s('Blocked', 'indeterminate'),
      s('Done', 'done'),
      s('Cancelled', 'done'),
    ];
    const { mapping } = suggestStatusMapping(states);
    expect(mapping.in_progress).toBe('In Progress');
    expect(mapping.in_review).toBe('In Review');
    expect(mapping.blocked).toBe('Blocked');
    expect(mapping.done).toBe('Done');
    expect(mapping.canceled).toBe('Cancelled');
    // not_started has three candidates — all are 'new' bucket. Exact-label
    // for "not started" doesn't match any. Sole-in-bucket doesn't apply.
    // Keyword fallback: 'backlog' is the first keyword in the catalog and
    // matches "Backlog" → wins.
    expect(mapping.not_started).toBe('Backlog');
  });
});
