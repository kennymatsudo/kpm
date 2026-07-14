import { describe, it, expect } from 'vitest';
import { getStatusCategory, resolveStatusCategory } from './statusConfig';
import type { PlanItem } from '../../shared/types';

type ResolvableItem = Pick<PlanItem, 'status_category' | 'external_status' | 'external_type'>;

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
