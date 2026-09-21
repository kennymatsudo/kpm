import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../../shared/types';
import type { WorkBrief } from '../../shared/workBrief';
import {
  projectWorkBriefToExecution,
  projectWorkBriefToTracker,
  projectWorkBriefToTrackerUpdate,
} from './projections';

const brief: WorkBrief = {
  title: 'Ship feature',
  description: 'Context for @plan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
  it('projects only title and translated description to trackers', () => {
    const projected = projectWorkBriefToTracker(brief, [referencedItem], 'jira');

    expect(projected.title).toBe('Ship feature');
    expect(projected.description).toContain('Referenced item');
    expect(projected.description).not.toContain('@plan/');
    expect(projected).not.toHaveProperty('intent');
    expect(projected).not.toHaveProperty('acceptance_criteria');
  });

  it('renders the structured execution contract without parsing context headings', () => {
    const execution = projectWorkBriefToExecution({
      ...brief,
      description: 'Background\n\n## Intent\n\nThis remains context.',
    });

    expect(execution).toContain('## Intent\n\nKeep the contract local');
    expect(execution).toContain('## Context\n\nBackground\n\n## Intent\n\nThis remains context.');
    expect(execution).toContain('- [ ] Criterion stays local');
  });

  it('falls back to a placeholder context section when the brief has no intent, criteria, or description', () => {
    const execution = projectWorkBriefToExecution({
      title: 'Bare task',
      description: null,
      intent: null,
      acceptance_criteria: [],
      revision: 1,
    });

    expect(execution).toBe('# Task: Bare task\n\n## Context\n\nNo context provided.');
  });

  it('clears the tracker description to empty external markdown when the brief has none', () => {
    const update = projectWorkBriefToTrackerUpdate(
      { ...brief, description: null },
      [referencedItem],
      'jira',
    );

    expect(update.summary).toBe('Ship feature');
    expect(update.description).toBe('');
  });
});
