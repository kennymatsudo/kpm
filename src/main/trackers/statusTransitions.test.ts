/**
 * Tests for status transition mapping utilities
 */

import { describe, it, expect } from 'vitest';
import {
  findBestTransition,
  findTransitionWithMapping,
  inferCategoryFromStatus,
  isTransitionNeeded,
  isTransitionNeededWithMapping,
  generateTransitionWarning,
  inferCategoryWithMapping,
  mapLinearStateTypeToCategory,
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

describe('findTransitionWithMapping', () => {
  it('uses explicit mapping to find the target transition', () => {
    const transitions = [
      createTransition('Start Progress', 'In Progress', 'indeterminate'),
      createTransition('Done', 'Done', 'done'),
    ];

    const result = findTransitionWithMapping('in_progress', transitions, {
      in_progress: 'In Progress',
    });

    expect(result?.name).toBe('Start Progress');
  });

  it('does not fall back to heuristics when mapping is absent', () => {
    const transitions = [
      createTransition('Start Progress', 'In Progress', 'indeterminate'),
    ];

    expect(findTransitionWithMapping('in_progress', transitions, null)).toBeNull();
  });

  it('does not fall back to heuristics when explicit mapping is stale', () => {
    const transitions = [
      createTransition('Start Progress', 'In Progress', 'indeterminate'),
    ];

    expect(
      findTransitionWithMapping('in_progress', transitions, { in_progress: 'Doing' })
    ).toBeNull();
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

describe('isTransitionNeededWithMapping', () => {
  it('does not request a transition when current status already matches explicit mapping', () => {
    expect(
      isTransitionNeededWithMapping('QA', 'in_review', { in_review: 'QA' })
    ).toBe(false);
  });

  it('requests a transition when explicit mapping resolves to a different category', () => {
    expect(
      isTransitionNeededWithMapping('QA', 'done', { in_review: 'QA' })
    ).toBe(true);
  });

  it('uses Linear state type hints when no explicit mapping matches', () => {
    expect(
      isTransitionNeededWithMapping('Custom State', 'in_progress', null, { stateType: 'started' })
    ).toBe(false);
  });
});

describe('generateTransitionWarning', () => {
  it('warns when no transitions available', () => {
    const warning = generateTransitionWarning('Done', 'not_started', []);
    expect(warning).toContain('no destination states available');
    expect(warning).toContain('Done');
  });

  it('points to mappings when no mapping is configured', () => {
    const transitions = [
      createTransition('In Progress', 'In Progress', 'indeterminate'),
      createTransition('Done', 'Done', 'done'),
    ];
    const warning = generateTransitionWarning('To Do', 'blocked', transitions);
    expect(warning).toContain('No status mapping configured');
    expect(warning).toContain('Blocked');
    expect(warning).toContain('Open Mappings');
    expect(warning).toContain('Available:');
    expect(warning).toContain('In Progress');
    expect(warning).toContain('Done');
  });

  it('points to mappings when category is unmapped in an existing mapping', () => {
    const transitions = [createTransition('Done', 'Done', 'done')];
    const warning = generateTransitionWarning('To Do', 'blocked', transitions, {
      done: 'Done',
    });
    expect(warning).toContain('No status mapping configured for "Blocked"');
    expect(warning).toContain('Open Mappings');
  });

  it('distinguishes stale mapped statuses from absent mappings', () => {
    const transitions = [
      createTransition('In Progress', 'In Progress', 'indeterminate'),
    ];
    const warning = generateTransitionWarning('To Do', 'blocked', transitions, {
      blocked: 'On Hold',
    });

    expect(warning).toContain('is set to "On Hold"');
    expect(warning).toContain("isn't an available state");
  });
});

describe('mapLinearStateTypeToCategory', () => {
  it('maps Linear state types directly', () => {
    expect(mapLinearStateTypeToCategory('triage')).toBe('not_started');
    expect(mapLinearStateTypeToCategory('backlog')).toBe('not_started');
    expect(mapLinearStateTypeToCategory('unstarted')).toBe('not_started');
    expect(mapLinearStateTypeToCategory('started')).toBe('in_progress');
    expect(mapLinearStateTypeToCategory('completed')).toBe('done');
    expect(mapLinearStateTypeToCategory('canceled')).toBe('canceled');
  });

  it('is case-insensitive', () => {
    expect(mapLinearStateTypeToCategory('STARTED')).toBe('in_progress');
    expect(mapLinearStateTypeToCategory('Completed')).toBe('done');
  });

  it('returns null for unknown or empty values', () => {
    expect(mapLinearStateTypeToCategory(null)).toBeNull();
    expect(mapLinearStateTypeToCategory(undefined)).toBeNull();
    expect(mapLinearStateTypeToCategory('')).toBeNull();
    expect(mapLinearStateTypeToCategory('wat')).toBeNull();
  });
});

describe('inferCategoryWithMapping — Linear state type hint', () => {
  it('prefers Linear state type over keyword inference when no explicit mapping', () => {
    // "Custom Status" would default to not_started via keyword inference, but
    // Linear state type 'started' should override.
    expect(inferCategoryWithMapping('Custom Status', null, { stateType: 'started' })).toBe('in_progress');
    expect(inferCategoryWithMapping('Custom Status', null, { stateType: 'canceled' })).toBe('canceled');
  });

  it('explicit mapping still wins over the state-type hint', () => {
    const mapping = { in_progress: 'Custom Status' };
    expect(
      inferCategoryWithMapping('Custom Status', mapping, { stateType: 'completed' })
    ).toBe('in_progress');
  });

  it('falls back to keyword inference when no hint and no mapping', () => {
    expect(inferCategoryWithMapping('In Progress', null)).toBe('in_progress');
  });
});
