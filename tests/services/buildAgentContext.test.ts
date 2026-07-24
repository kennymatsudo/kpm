/**
 * buildAgentContext — unit tests
 *
 * Covers the Work Brief execution projection:
 *  - intent / acceptance_criteria surface above context
 *  - persisted description always projects as context
 *  - headings inside context remain ordinary context
 *  - the instructions tail references criteria only when structured criteria exist
 */

import { describe, it, expect } from 'vitest';
import { buildAgentContext, buildBoardStartInstructions } from '../../src/main/services/repo/DevSessionService';
import { createPlanItem, createProject } from '../factories';

describe('buildAgentContext', () => {
  const project = createProject({ id: 'project-1', name: 'Test Project' });

  it('renders persisted description as Work Brief context', () => {
    const item = createPlanItem({
      id: 'item-1',
      project_id: project.id,
      title: 'Add login button',
      description: 'Users need a way to sign in.',
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('# Task: Add login button');
    expect(prompt).toContain('## Context\n\nUsers need a way to sign in.');
    expect(prompt).not.toContain('## Intent');
    expect(prompt).not.toContain('## Acceptance Criteria');
    expect(prompt).not.toContain('## Description');
    expect(prompt).toContain('Implement this task. In your final response');
    expect(prompt).toContain('Do not commit');
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

  it('falls back to "No context provided." only when everything is null', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Bare item',
      description: null,
      intent: null,
      acceptance_criteria: null,
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('## Context\n\nNo context provided.');
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
    expect(prompt).toContain('## Context');
    expect(prompt).not.toContain('so that every acceptance criterion above is satisfied');
  });

  it('keeps description headings inside ordinary context', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Structured description item',
      description: [
        'Background context for the task.',
        '',
        '## Acceptance Criteria',
        '- [ ] Duplicated legacy criterion should not render when structured criteria exist',
        '',
        '## Out of Scope',
        'Do not modify billing flows.',
        '',
        '## Dependencies',
        '- @plan/abc123 must land first',
        '',
        '## Code References',
        '- src/auth/session.ts (refreshSession) — existing behavior',
        '',
        '## Verification',
        'npm test -- src/auth/session.test.ts',
      ].join('\n'),
      acceptance_criteria: ['Session refresh keeps active users signed in'],
      code_refs: ['src/auth/client.ts (extendSession)'],
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('## Acceptance Criteria\n\n- [ ] Session refresh keeps active users signed in');
    expect(prompt).toContain('## Context\n\nBackground context for the task.');
    expect(prompt).toContain('Duplicated legacy criterion should not render when structured criteria exist');
    expect(prompt).toContain('## Out of Scope\nDo not modify billing flows.');
    expect(prompt).toContain('## Dependencies\n- @plan/abc123 must land first');
    expect(prompt).toContain('## Code References\n- src/auth/session.ts (refreshSession) — existing behavior');
    expect(prompt).toContain('## Verification\nnpm test -- src/auth/session.test.ts');
    expect(prompt).toContain('## Relevant Files\n\n- src/auth/client.ts (extendSession)');
    expect(prompt).not.toContain('Run the Verification command(s) above before finishing unless impossible');
    expect(prompt).toContain('criterion-by-criterion status');
  });

  it('does not treat an Acceptance Criteria heading in context as the contract', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Legacy structured description',
      description: [
        'Background context.',
        '',
        '## Acceptance Criteria',
        '- [ ] Endpoint returns 200 for valid input',
        '- [ ] Endpoint returns 400 for invalid input',
      ].join('\n'),
      acceptance_criteria: null,
    });

    const prompt = buildAgentContext({ item, project, children: [], parent: null });

    expect(prompt).toContain('## Context\n\nBackground context.\n\n## Acceptance Criteria');
    expect(prompt).toContain('- [ ] Endpoint returns 200 for valid input');
    expect(prompt).not.toContain('so that every acceptance criterion above is satisfied');
    expect(prompt).not.toContain('criterion-by-criterion status');
    expect(prompt).not.toContain('## Description');
  });
});

describe('buildBoardStartInstructions', () => {
  const project = createProject({ id: 'project-1', name: 'Test Project' });

  it('uses the structured context when the board prompt is left at the legacy default', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Session timeout warning',
      description: 'Users lose draft work today.',
      intent: "Warn users before their session expires so they don't lose unsaved work.",
      acceptance_criteria: [
        'Warning modal appears 5 minutes before session expires',
        'Modal exposes an Extend Session action',
      ],
    });

    const prompt = buildBoardStartInstructions({
      item,
      project,
      children: [],
      parent: null,
      userPrompt: 'Session timeout warning\n\nUsers lose draft work today.',
    });

    expect(prompt).toContain('## Intent');
    expect(prompt).toContain('## Acceptance Criteria');
    expect(prompt).not.toContain('## Additional User Instructions');
  });

  it('appends explicit user instructions after the structured context', () => {
    const item = createPlanItem({
      project_id: project.id,
      title: 'Investigate storage quota',
      description: 'Background context.',
      intent: 'Decide whether IndexedDB is a viable target for offline caching.',
    });

    const prompt = buildBoardStartInstructions({
      item,
      project,
      children: [],
      parent: null,
      userPrompt: 'Prefer touching the existing storage adapter instead of adding a new abstraction.',
    });

    expect(prompt).toContain('## Intent');
    expect(prompt).toContain('## Additional User Instructions');
    expect(prompt).toContain('Prefer touching the existing storage adapter instead of adding a new abstraction.');
  });
});
