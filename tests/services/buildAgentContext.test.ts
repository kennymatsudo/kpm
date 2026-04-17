/**
 * buildAgentContext — unit tests
 *
 * Covers the spec-field rendering branches added in sprint 1:
 *  - intent / acceptance_criteria surface above description
 *  - description is demoted to "## Context" when criteria carry the contract
 *  - legacy items (no spec fields) still render the classic shape
 *  - the instructions tail references criteria only when criteria exist
 */

import { describe, it, expect } from 'vitest';
import { createPlanItem, createProject } from '../factories';

describe('buildAgentContext', () => {
  const project = createProject({ id: 'project-1', name: 'Test Project' });

  it('renders the classic shape when no structured fields are set', () => {
    const item = createPlanItem({
      id: 'item-1',
      project_id: project.id,
      title: 'Add login button',
      description: 'Users need a way to sign in.',
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('# Task: Add login button');
    expect(prompt).toContain('## Description\n\nUsers need a way to sign in.');
    expect(prompt).not.toContain('## Intent');
    expect(prompt).not.toContain('## Acceptance Criteria');
    expect(prompt).not.toContain('## Context');
  });

  it('renders intent and acceptance_criteria above description when both are set', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Session timeout warning',
      intent: "Warn users before their session expires so they don't lose unsaved work.",
      acceptance_criteria: [
        'Warning modal appears 5 minutes before session expires',
        'Modal exposes an Extend Session action',
        'Warning does not interrupt active form input',
      ],
      description: 'Users lose draft work today. Rejected: auto-extend (conflicts with session fixation).',
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    const intentIdx = prompt.indexOf('## Intent');
    const criteriaIdx = prompt.indexOf('## Acceptance Criteria');
    const contextIdx = prompt.indexOf('## Context');

    expect(intentIdx).toBeGreaterThan(-1);
    expect(criteriaIdx).toBeGreaterThan(intentIdx);
    expect(contextIdx).toBeGreaterThan(criteriaIdx);

    expect(prompt).toContain("Warn users before their session expires so they don't lose unsaved work.");
    expect(prompt).toContain('- [ ] Warning modal appears 5 minutes before session expires');
    expect(prompt).toContain('- [ ] Modal exposes an Extend Session action');
    expect(prompt).toContain('- [ ] Warning does not interrupt active form input');

    // description is demoted, no longer its own "## Description" section
    expect(prompt).not.toContain('## Description');
    expect(prompt).toContain('Rejected: auto-extend');

    // Instructions tail adapts when criteria are present
    expect(prompt).toContain('so that every acceptance criterion above is satisfied');
  });

  it('renders only intent when acceptance_criteria is null', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Investigate storage quota',
      intent: 'Decide whether IndexedDB is a viable target for offline caching.',
      description: null,
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('## Intent');
    expect(prompt).toContain('Decide whether IndexedDB is a viable target for offline caching.');
    expect(prompt).not.toContain('## Acceptance Criteria');

    // No description section emitted when intent is present and description is null
    expect(prompt).not.toContain('## Description');
    expect(prompt).not.toContain('No description provided.');

    // Instructions tail falls back since no criteria
    expect(prompt).not.toContain('so that every acceptance criterion above is satisfied');
  });

  it('falls back to "No description provided." only when everything is null', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Bare item',
      description: null,
      intent: null,
      acceptance_criteria: null,
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('## Description\n\nNo description provided.');
  });

  it('renders acceptance_criteria without intent, demoting description to Context', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Criteria-only item',
      description: 'Background context.',
      acceptance_criteria: ['Ship the endpoint', 'Cover with one integration test'],
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).not.toContain('## Intent');
    expect(prompt).toContain('## Acceptance Criteria');
    expect(prompt).toContain('## Context');
    expect(prompt).not.toContain('## Description');
    expect(prompt).toContain('so that every acceptance criterion above is satisfied');
  });

  it('ignores an empty acceptance_criteria array (treats as no criteria)', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Empty criteria array',
      description: 'Has description.',
      acceptance_criteria: [],
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).not.toContain('## Acceptance Criteria');
    expect(prompt).toContain('## Description');
    expect(prompt).not.toContain('so that every acceptance criterion above is satisfied');
  });
});
