import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../../shared/types';
import type { WorkBrief } from '../../shared/workBrief';
import { projectWorkBriefToExecution, projectWorkBriefToTracker } from './projections';

const brief: WorkBrief = {
  title: 'Ship feature',
  context: 'Context for @plan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  intent: 'Keep the contract local',
  acceptance_criteria: ['Criterion stays local'],
  revision: 2,
};
const referencedItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Referenced item',
  external_key: null,
} as PlanItem;

describe('Work Brief projections', () => {
  it('projects only title and translated context to trackers', () => {
    const projected = projectWorkBriefToTracker(brief, [referencedItem], 'jira');

    expect(projected.title).toBe('Ship feature');
    expect(projected.context).toContain('Referenced item');
    expect(projected.context).not.toContain('@plan/');
    expect(projected).not.toHaveProperty('intent');
    expect(projected).not.toHaveProperty('acceptance_criteria');
  });

  it('renders the structured execution contract without parsing context headings', () => {
    const execution = projectWorkBriefToExecution({
      ...brief,
      context: 'Background\n\n## Intent\n\nThis remains context.',
    });

    expect(execution).toContain('## Intent\n\nKeep the contract local');
    expect(execution).toContain('## Context\n\nBackground\n\n## Intent\n\nThis remains context.');
    expect(execution).toContain('- [ ] Criterion stays local');
  });
});
