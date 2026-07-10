import { describe, expect, it } from 'vitest';
import type { Playbook } from '../../../shared/playbooks';
import { buildPlaybookStepLabels } from './PhaseStepper';

const playbook: Playbook = {
  id: 'test',
  name: 'Test',
  builtIn: false,
  steps: [
    { id: 'implement', session: 'main', systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt' } },
    {
      id: 'security_review',
      session: 'subagent',
      runs: [[{ provider: 'claude' }], [{ provider: 'claude' }]],
      systemPromptKey: 'agents.review_system',
      directive: { kind: 'prompt' },
      verdict: 'findings',
      onFindings: { goto: 'implement', maxPasses: 3, onMaxPasses: 'pause' },
    },
  ],
};

describe('PhaseStepper labels', () => {
  it('shows bounded passes and persisted per-step cost using shared usage formatting', () => {
    expect(buildPlaybookStepLabels(playbook.steps, { security_review: 2 }, {
      implement: 1_250_000,
      security_review: 12_500,
    })).toEqual([
      { id: 'implement', title: 'Implement', details: ['$1.25'] },
      { id: 'security_review', title: 'Security Review', details: ['pass 2/3', '$0.01'] },
    ]);
  });

  it('shows pass zero before a findings route has looped', () => {
    expect(buildPlaybookStepLabels(playbook.steps, {}, {}).at(1)?.details).toEqual(['pass 0/3']);
  });
});
