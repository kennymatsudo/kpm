import { describe, expect, it } from 'vitest';
import type { PlanItem, Project } from '../../../shared/types';
import {
  buildAgentContext,
  buildBoardProviderPrompt,
  buildBoardStartInstructions,
  buildWorkBriefReconciliation,
  replaceCurrentWorkBrief,
} from './devSessionPrompt';

function item(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'item-1', project_id: 'project-1', parent_id: null, title: 'Task',
    description: null, intent: null, acceptance_criteria: null, work_brief_revision: 1,
    source_document_id: null, label: null, item_order: 0, code_refs: null,
    status: 'planned', release_tag: null,
    association_id: null, external_key: null, external_id: null,
    external_type: null, external_issue_type: null, external_status: null,
    status_category: 'not_started', external_url: null, external_parent_key: null,
    external_epic_key: null, sync_source: 'local', last_synced_at: null,
    ...overrides,
  };
}

const project = { id: 'project-1', name: 'Project' } as Project;

function context(overrides: Partial<PlanItem>) {
  return buildAgentContext({ item: item(overrides), project, children: [], parent: null });
}

describe('buildAgentContext Work Brief projection', () => {
  it('projects a persisted description as context, not as its own section', () => {
    const prompt = context({ title: 'Add login button', description: 'Users need a way to sign in.' });

    expect(prompt).toContain('# Task: Add login button');
    expect(prompt).toContain('## Context\n\nUsers need a way to sign in.');
    expect(prompt).not.toContain('## Intent');
    expect(prompt).not.toContain('## Acceptance Criteria');
    // Task context only — what to do with it belongs to the playbook step.
    expect(prompt).not.toContain('## Instructions');
  });

  it('orders intent above criteria above context when all three are set', () => {
    const prompt = context({
      intent: "Warn users before their session expires so they don't lose unsaved work.",
      acceptance_criteria: [
        'Warning modal appears 5 minutes before session expires',
        'Modal exposes an Extend Session action',
      ],
      description: 'Users lose draft work today. Rejected: auto-extend (conflicts with session fixation).',
    });

    expect(prompt.indexOf('## Intent')).toBeGreaterThan(-1);
    expect(prompt.indexOf('## Acceptance Criteria')).toBeGreaterThan(prompt.indexOf('## Intent'));
    expect(prompt.indexOf('## Context')).toBeGreaterThan(prompt.indexOf('## Acceptance Criteria'));

    expect(prompt).toContain("Warn users before their session expires so they don't lose unsaved work.");
    expect(prompt).toContain('- [ ] Warning modal appears 5 minutes before session expires');
    expect(prompt).toContain('- [ ] Modal exposes an Extend Session action');
    expect(prompt).toContain('Rejected: auto-extend');
  });

  it('omits the context section entirely when intent is set and description is null', () => {
    const prompt = context({
      intent: 'Decide whether IndexedDB is a viable target for offline caching.',
      description: null,
    });

    expect(prompt).toContain('## Intent');
    expect(prompt).toContain('Decide whether IndexedDB is a viable target for offline caching.');
    expect(prompt).not.toContain('## Acceptance Criteria');
    expect(prompt).not.toContain('## Context');
  });

  it('renders criteria without intent, demoting the description to context', () => {
    const prompt = context({
      description: 'Background context.',
      acceptance_criteria: ['Ship the endpoint', 'Cover with one integration test'],
    });

    expect(prompt).not.toContain('## Intent');
    expect(prompt).toContain('## Acceptance Criteria\n\n- [ ] Ship the endpoint');
    expect(prompt).toContain('## Context\n\nBackground context.');
  });

  it('treats an empty criteria array as no criteria', () => {
    const prompt = context({ description: 'Has description.', acceptance_criteria: [] });

    expect(prompt).not.toContain('## Acceptance Criteria');
    expect(prompt).toContain('## Context');
  });

  it('falls back to a placeholder only when intent, criteria, and description are all null', () => {
    expect(context({ description: null, intent: null, acceptance_criteria: null }))
      .toContain('## Context\n\nNo context provided.');
  });

  it('treats an Acceptance Criteria heading inside context as ordinary context', () => {
    const prompt = context({
      description: 'Background\n\n## Acceptance Criteria\n\n- Legacy prose only',
      acceptance_criteria: ['Structured contract'],
    });

    expect(prompt).toContain('## Acceptance Criteria\n\n- [ ] Structured contract');
    expect(prompt).toContain('## Context\n\nBackground\n\n## Acceptance Criteria\n\n- Legacy prose only');
    expect(prompt).not.toContain('- [ ] Legacy prose only');
  });

  it('passes other legacy description headings through and appends code refs', () => {
    const prompt = context({
      description: [
        'Background context for the task.',
        '',
        '## Out of Scope',
        'Do not modify billing flows.',
        '',
        '## Dependencies',
        '- @plan/abc123 must land first',
        '',
        '## Verification',
        'npm test -- src/auth/session.test.ts',
      ].join('\n'),
      acceptance_criteria: ['Session refresh keeps active users signed in'],
      code_refs: ['src/auth/client.ts (extendSession)'],
    });

    expect(prompt).toContain('## Context\n\nBackground context for the task.');
    expect(prompt).toContain('## Out of Scope\nDo not modify billing flows.');
    expect(prompt).toContain('## Dependencies\n- @plan/abc123 must land first');
    expect(prompt).toContain('## Verification\nnpm test -- src/auth/session.test.ts');
    expect(prompt).toContain('## Relevant Files\n\n- src/auth/client.ts (extendSession)');
  });
});

describe('buildBoardStartInstructions', () => {
  it('drops a user prompt left at the legacy title/description default', () => {
    const prompt = buildBoardStartInstructions({
      item: item({
        title: 'Session timeout warning',
        description: 'Users lose draft work today.',
        intent: "Warn users before their session expires so they don't lose unsaved work.",
        acceptance_criteria: ['Warning modal appears 5 minutes before session expires'],
      }),
      project,
      children: [],
      parent: null,
      userPrompt: 'Session timeout warning\n\nUsers lose draft work today.',
    });

    expect(prompt).toContain('## Intent');
    expect(prompt).toContain('## Acceptance Criteria');
    expect(prompt).not.toContain('## Additional User Instructions');
  });

  it('appends an explicit user prompt after the structured context', () => {
    const prompt = buildBoardStartInstructions({
      item: item({
        title: 'Investigate storage quota',
        description: 'Background context.',
        intent: 'Decide whether IndexedDB is a viable target for offline caching.',
      }),
      project,
      children: [],
      parent: null,
      userPrompt: 'Prefer touching the existing storage adapter instead of adding a new abstraction.',
    });

    expect(prompt.indexOf('## Additional User Instructions')).toBeGreaterThan(prompt.indexOf('## Intent'));
    expect(prompt).toContain('Prefer touching the existing storage adapter instead of adding a new abstraction.');
  });
});

describe('buildBoardProviderPrompt', () => {
  it.each(['claude', 'pi'] as const)('uses native system instructions for %s', (agentType) => {
    expect(buildBoardProviderPrompt(agentType, 'ROLE', 'TASK')).toBe('TASK');
  });

  it.each(['codex', 'gemini'] as const)('prepends role instructions for %s', (agentType) => {
    expect(buildBoardProviderPrompt(agentType, 'ROLE', 'TASK')).toBe('ROLE\n\nTASK');
  });
});

describe('Work Brief reconciliation prompt', () => {
  it('marks the latest approved brief as authoritative', () => {
    const prompt = buildWorkBriefReconciliation({
      item: item({
        title: 'Revised task',
        work_brief_revision: 4,
        acceptance_criteria: ['Use the revised contract'],
      }),
      project,
      children: [],
      parent: null,
    }, 2);

    expect(prompt).toContain('changed from revision 2 to revision 4');
    expect(prompt).toContain('authoritative task contract');
    expect(prompt).toContain('Revised task');
    expect(prompt).toContain('Use the revised contract');
  });

  it('replaces the prior current brief while preserving other session instructions', () => {
    const first = buildWorkBriefReconciliation({
      item: item({ title: 'First revision', work_brief_revision: 2 }),
      project,
      children: [],
      parent: null,
    }, 1);
    const second = buildWorkBriefReconciliation({
      item: item({ title: 'Second revision', work_brief_revision: 3 }),
      project,
      children: [],
      parent: null,
    }, 2);

    const updated = replaceCurrentWorkBrief(
      `Original task\n\n${first}\n\n## Additional User Instructions\n\nKeep the API stable.`,
      second,
    );

    expect(updated).toContain('Original task');
    expect(updated).toContain('Second revision');
    expect(updated).toContain('Keep the API stable.');
    expect(updated).not.toContain('First revision');
    expect(updated.match(/<current-work-brief>/g)).toHaveLength(1);
  });
});
