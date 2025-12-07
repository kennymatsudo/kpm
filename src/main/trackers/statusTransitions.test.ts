/**
 * Tests for status transition mapping utilities
 */

import { describe, it, expect } from 'vitest';
import {
  findBestTransition,
  inferCategoryFromStatus,
  isTransitionNeeded,
  generateTransitionWarning,
} from './statusTransitions';
import type { JiraTransition } from '../../shared/types';

// Helper to create test transitions
function createTransition(
  name: string,
  toName: string,
  statusCategoryKey: string
): JiraTransition {
  return {
    id: `${name.toLowerCase().replace(/\s/g, '-')}-id`,
    name,
    to: {
      id: `status-${toName.toLowerCase().replace(/\s/g, '-')}`,
      name: toName,
      statusCategory: {
        key: statusCategoryKey,
        name: statusCategoryKey,
      },
    },
  };
}

describe('findBestTransition', () => {
  describe('category-based matching', () => {
    it('returns null for empty transitions', () => {
      expect(findBestTransition('done', [])).toBeNull();
    });

    });

    it('prefers shorter transition names when multiple match', () => {
      const transitions = [
        createTransition('Mark as Complete and Archive', 'Done', 'done'),
        createTransition('Done', 'Done', 'done'),
        createTransition('Complete Task', 'Done', 'done'),
      ];
      const result = findBestTransition('done', transitions);
      expect(result?.name).toBe('Done');
    });
  });

  describe('keyword-based fallback', () => {

    });

    it('returns null when no keyword matches', () => {
      const transitions = [
        createTransition('Custom Workflow', 'Custom State', 'unknown'),
      ];
      const result = findBestTransition('done', transitions);
      expect(result).toBeNull();
    });
  });
});

describe('inferCategoryFromStatus', () => {
  });

  describe('edge cases', () => {
    it('is case insensitive', () => {
      expect(inferCategoryFromStatus('IN PROGRESS')).toBe('in_progress');
      expect(inferCategoryFromStatus('done')).toBe('done');
    });

    it('defaults to not_started for unknown status', () => {
      expect(inferCategoryFromStatus('Custom Status')).toBe('not_started');
    });
  });
});

describe('isTransitionNeeded', () => {
  it('returns false when current status matches target category', () => {
    expect(isTransitionNeeded('In Progress', 'in_progress')).toBe(false);
    expect(isTransitionNeeded('Done', 'done')).toBe(false);
    expect(isTransitionNeeded('To Do', 'not_started')).toBe(false);
  });

  it('returns true when current status differs from target category', () => {
    expect(isTransitionNeeded('To Do', 'in_progress')).toBe(true);
    expect(isTransitionNeeded('In Progress', 'done')).toBe(true);
    expect(isTransitionNeeded('Done', 'not_started')).toBe(true);
  });
});

describe('generateTransitionWarning', () => {
  it('warns when no transitions available', () => {
    const warning = generateTransitionWarning('Done', 'not_started', []);
    expect(warning).toContain('Done');
  });

    const transitions = [
      createTransition('In Progress', 'In Progress', 'indeterminate'),
      createTransition('Done', 'Done', 'done'),
    ];
    const warning = generateTransitionWarning('To Do', 'blocked', transitions);
    expect(warning).toContain('Blocked');
    expect(warning).toContain('Available:');
    expect(warning).toContain('In Progress');
    expect(warning).toContain('Done');
  });
});
