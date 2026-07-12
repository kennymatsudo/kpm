import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PLAYBOOKS,
  formatPlaybookStepTitle,
  getPlaybookLoops,
  getPlaybookValidationIssues,
  parsePlaybook,
} from './playbooks';

describe('playbookSchema', () => {
  it('validates built-in playbooks', () => {
    expect(BUILT_IN_PLAYBOOKS.implementOpposingReview.name).toBe('Implement + opposing review');
    expect(BUILT_IN_PLAYBOOKS.implementOnly.steps.map((step) => step.id)).toEqual(['implement']);
    expect(BUILT_IN_PLAYBOOKS.loopUntilClean.steps.find((step) => step.id === 'address')?.next).toBe('review');
  });

  it('models the two-axis code-review playbook', () => {
    const playbook = BUILT_IN_PLAYBOOKS.implementCodeReview;
    expect(playbook.name).toBe('Implement (TDD) + two-axis review');
    expect(playbook.steps.find((step) => step.id === 'implement')?.systemPromptKey).toBe('agents.implementation_tdd_system');
    const review = playbook.steps.find((step) => step.id === 'review');
    expect(review?.runs).toHaveLength(2);
    expect(review?.runOverrides?.map((run) => run.axis)).toEqual(['standards', 'spec']);
  });

  it('rejects runOverrides without runs', () => {
    expect(() => parsePlaybook({
      id: 'bad', name: 'Bad', builtIn: false,
      steps: [
        { id: 'implement', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt' } },
        { id: 'review', session: 'subagent', agents: [{ provider: 'codex' }], runOverrides: [{ axis: 'spec' }], systemPromptKey: 'agents.review_system', directive: { kind: 'prompt' } },
      ],
    })).toThrow(/runOverrides requires runs/);
  });

  it('rejects more runOverrides than runs', () => {
    expect(() => parsePlaybook({
      id: 'bad', name: 'Bad', builtIn: false,
      steps: [
        { id: 'implement', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt' } },
        { id: 'review', session: 'subagent', runs: [[{ provider: 'codex' }]], runOverrides: [{ axis: 'standards' }, { axis: 'spec' }], systemPromptKey: 'agents.review_system', directive: { kind: 'prompt' } },
      ],
    })).toThrow(/more entries than runs/);
  });

  it('rejects unreachable steps and unknown targets', () => {
    expect(() => parsePlaybook({
      id: 'bad',
      name: 'Bad',
      builtIn: false,
      steps: [
        {
          id: 'implement',
          session: 'main',
          systemPromptKey: 'agents.implementation_system',
          directive: { kind: 'prompt' },
          next: 'missing',
        },
        {
          id: 'review',
          session: 'subagent',
          agents: [{ provider: 'codex' }],
          systemPromptKey: 'agents.review_system',
          directive: { kind: 'prompt' },
        },
      ],
    })).toThrow(/Unknown target step|Unreachable step/);
  });

  it('rejects unbounded cycles', () => {
    expect(() => parsePlaybook({
      id: 'loop',
      name: 'Loop',
      builtIn: false,
      steps: [
        {
          id: 'implement',
          session: 'main',
          systemPromptKey: 'agents.implementation_system',
          directive: { kind: 'prompt' },
          next: 'review',
        },
        {
          id: 'review',
          session: 'subagent',
          agents: [{ provider: 'codex' }],
          systemPromptKey: 'agents.review_system',
          directive: { kind: 'prompt' },
          next: 'review',
        },
      ],
    })).toThrow(/Cycle must pass through/);
  });

  it('enforces first-main identity and later-main inheritance', () => {
    expect(() => parsePlaybook({
      id: 'identity',
      name: 'Identity',
      builtIn: false,
      steps: [
        {
          id: 'implement',
          session: 'main',
          systemPromptKey: 'agents.implementation_system',
          directive: { kind: 'prompt' },
        },
        {
          id: 'address',
          session: 'main',
          agents: [{ provider: 'codex' }],
          systemPromptKey: 'agents.other',
          directive: { kind: 'prompt' },
        },
      ],
    })).toThrow(/systemPromptKey is allowed only|agents is allowed only/);
  });

  it('enforces subagent run and write constraints', () => {
    expect(() => parsePlaybook({
      id: 'writes',
      name: 'Writes',
      builtIn: false,
      steps: [
        {
          id: 'implement',
          session: 'main',
          systemPromptKey: 'agents.implementation_system',
          directive: { kind: 'prompt' },
        },
        {
          id: 'review',
          session: 'subagent',
          runs: [[{ provider: 'claude' }], [{ provider: 'codex' }]],
          systemPromptKey: 'agents.review_system',
          writes: true,
          directive: { kind: 'prompt' },
        },
      ],
    })).toThrow(/writes is allowed only/);
  });

  it('requires output references to point to earlier steps', () => {
    expect(() => parsePlaybook({
      id: 'refs',
      name: 'Refs',
      builtIn: false,
      steps: [
        {
          id: 'implement',
          session: 'main',
          systemPromptKey: 'agents.implementation_system',
          directive: { kind: 'prompt', text: 'Use {{output:review}}' },
        },
        {
          id: 'review',
          session: 'subagent',
          agents: [{ provider: 'codex' }],
          systemPromptKey: 'agents.review_system',
          directive: { kind: 'prompt' },
        },
      ],
    })).toThrow(/earlier step/);
  });

  it('maps unreachable, back-edge, and output issues to their structural sources', () => {
    const issues = getPlaybookValidationIssues({
      id: 'anchored',
      name: 'Anchored',
      builtIn: false,
      steps: [
        {
          id: 'implement',
          session: 'main',
          systemPromptKey: 'agents.implementation_system',
          directive: { kind: 'prompt', text: 'Use {{output:Missing-Step}} and {{output:missing}}' },
          next: 'review',
        },
        {
          id: 'review',
          session: 'subagent',
          agents: [{ provider: 'codex' }],
          systemPromptKey: 'agents.review_system',
          directive: { kind: 'prompt' },
          next: 'review',
        },
        {
          id: 'orphan',
          session: 'main',
          directive: { kind: 'prompt' },
        },
      ],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'output', stepId: 'implement', token: '{{output:Missing-Step}}' }),
      expect.objectContaining({ kind: 'output', stepId: 'implement', token: '{{output:missing}}' }),
      expect.objectContaining({ kind: 'route', stepId: 'review', field: 'next' }),
      expect.objectContaining({ kind: 'step', stepId: 'orphan' }),
    ]));
  });

  it('detects only genuine loops, spanning the body with its bound and exit', () => {
    expect(getPlaybookLoops(BUILT_IN_PLAYBOOKS.loopUntilClean)).toEqual([
      { startIndex: 1, endIndex: 2, maxPasses: 3, onMaxPasses: 'pause' },
    ]);
    // A one-time forward onFindings route is not a loop.
    expect(getPlaybookLoops(BUILT_IN_PLAYBOOKS.implementOpposingReview)).toEqual([]);
  });

  it('formats internal step ids as user-facing titles', () => {
    expect(formatPlaybookStepTitle('security_review')).toBe('Security Review');
    expect(formatPlaybookStepTitle('address-2')).toBe('Address 2');
  });
});
