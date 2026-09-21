import { describe, expect, it } from 'vitest';
import {
  normalizeWorkBriefDraft,
  repositoryScopeSchema,
  workBriefDraftSchema,
  workBriefDraftsEqual,
  workBriefFromPlanItem,
} from './workBrief';

describe('Work Brief', () => {
  it('normalizes new revisions at the aggregate seam', () => {
    expect(normalizeWorkBriefDraft({
      title: '  Implement retries  ',
      description: '  Explain the failure mode.  ',
      intent: '  Requests recover from transient failures.  ',
      acceptance_criteria: ['  Retries stop after the configured limit.  '],
    })).toEqual({
      title: 'Implement retries',
      description: 'Explain the failure mode.',
      intent: 'Requests recover from transient failures.',
      acceptance_criteria: ['Retries stop after the configured limit.'],
    });
  });

  it('projects legacy persisted content without applying current authoring limits', () => {
    const legacyDescription = 'x'.repeat(50_001);

    expect(workBriefFromPlanItem({
      title: 'Legacy item',
      description: legacyDescription,
      intent: null,
      acceptance_criteria: null,
      work_brief_revision: 1,
    })).toEqual({
      title: 'Legacy item',
      description: legacyDescription,
      intent: null,
      acceptance_criteria: [],
      revision: 1,
    });
  });

  it('accepts a resumed session replaying the pre-rename `context` key as `description`', () => {
    const parsed = workBriefDraftSchema.parse({
      title: 'Example',
      context: '  Old key from before the rename  ',
      intent: null,
      acceptance_criteria: [],
    });
    expect(parsed).toEqual({
      title: 'Example',
      description: 'Old key from before the rename',
      intent: null,
      acceptance_criteria: [],
    });
  });

  it('prefers description over context when a draft carries both', () => {
    const parsed = workBriefDraftSchema.parse({
      title: 'Example',
      context: 'Stale value',
      description: 'Current value',
      intent: null,
      acceptance_criteria: [],
    });
    expect(parsed.description).toBe('Current value');
  });

  it('workBriefDraftsEqual treats semantically-equal drafts as equal despite whitespace', () => {
    const left = { title: ' A ', description: ' B ', intent: null, acceptance_criteria: [' C '] };
    const right = { title: 'A', description: 'B', intent: null, acceptance_criteria: ['C'] };
    expect(workBriefDraftsEqual(left, right)).toBe(true);
  });

  it('workBriefDraftsEqual is false when a criterion differs', () => {
    const left = { title: 'A', description: null, intent: null, acceptance_criteria: ['C1'] };
    const right = { title: 'A', description: null, intent: null, acceptance_criteria: ['C2'] };
    expect(workBriefDraftsEqual(left, right)).toBe(false);
  });
});

describe('repositoryScopeSchema', () => {
  it('deduplicates affected repo ids and excludes the primary from the affected list', () => {
    const scope = repositoryScopeSchema.parse({
      primary_repo_id: 'repo-a',
      affected_repo_ids: ['repo-b', 'repo-b', 'repo-a', 'repo-c'],
    });
    expect(scope).toEqual({
      primary_repo_id: 'repo-a',
      affected_repo_ids: ['repo-b', 'repo-c'],
    });
  });
});
