import { describe, expect, it } from 'vitest';
import { normalizeWorkBriefDraft, workBriefFromPlanItem } from './workBrief';

describe('Work Brief', () => {
  it('normalizes new revisions at the aggregate seam', () => {
    expect(normalizeWorkBriefDraft({
      title: '  Implement retries  ',
      context: '  Explain the failure mode.  ',
      intent: '  Requests recover from transient failures.  ',
      acceptance_criteria: ['  Retries stop after the configured limit.  '],
    })).toEqual({
      title: 'Implement retries',
      context: 'Explain the failure mode.',
      intent: 'Requests recover from transient failures.',
      acceptance_criteria: ['Retries stop after the configured limit.'],
    });
  });

  it('projects legacy persisted content without applying current authoring limits', () => {
    const legacyContext = 'x'.repeat(50_001);

    expect(workBriefFromPlanItem({
      title: 'Legacy item',
      description: legacyContext,
      intent: null,
      acceptance_criteria: null,
      work_brief_revision: 1,
    })).toEqual({
      title: 'Legacy item',
      context: legacyContext,
      intent: null,
      acceptance_criteria: [],
      revision: 1,
    });
  });
});
