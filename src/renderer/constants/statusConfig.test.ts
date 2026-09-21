import { describe, it, expect } from 'vitest';
import { getStatusCategory, resolveStatusCategory } from './statusConfig';
import type { PlanItem } from '../../shared/types';

type ResolvableItem = Pick<PlanItem, 'status_category' | 'external_status' | 'external_type'>;

describe('getStatusCategory', () => {
  it('returns null when status or trackerType is missing', () => {
    expect(getStatusCategory(null, 'jira')).toBeNull();
    expect(getStatusCategory('In Progress', null)).toBeNull();
  });

  it('matches case-insensitively when the exact case is not mapped', () => {
    expect(getStatusCategory('in progress', 'jira')).toBe('in_progress');
    expect(getStatusCategory('DONE', 'linear')).toBe('done');
  });

  it('falls back to keyword matching for a custom, unmapped status', () => {
    expect(getStatusCategory('Peer Review', 'jira')).toBe('in_review');
    expect(getStatusCategory('QA Testing', 'jira')).toBe('in_progress');
    expect(getStatusCategory('Shipped and Closed Out', 'jira')).toBe('done');
    expect(getStatusCategory('On Hold Pending Design', 'linear')).toBe('blocked');
    expect(getStatusCategory('Won\'t Do - Cancelled', 'linear')).toBe('canceled');
  });

  it('defaults truly unrecognized statuses to not_started', () => {
    expect(getStatusCategory('Icebox', 'jira')).toBe('not_started');
  });
});

describe('resolveStatusCategory', () => {
  it('prefers the local status_category override over the tracker-derived category', () => {
    const item: ResolvableItem = {
      status_category: 'blocked',
      external_status: 'In Progress',
      external_type: 'jira',
    };
    expect(resolveStatusCategory(item)).toBe('blocked');
  });

  it('falls back to getStatusCategory when status_category is null', () => {
    const item: ResolvableItem = {
      status_category: null,
      external_status: 'In Progress',
      external_type: 'jira',
    };
    expect(resolveStatusCategory(item)).toBe(getStatusCategory('In Progress', 'jira'));
    expect(resolveStatusCategory(item)).toBe('in_progress');
  });

  it('returns null when neither status_category nor the tracker-derived category resolves', () => {
    const item: ResolvableItem = {
      status_category: null,
      external_status: null,
      external_type: null,
    };
    expect(resolveStatusCategory(item)).toBeNull();
  });
});
