import { describe, expect, it } from 'vitest';
import type { PlaybookStep } from '../../../shared/playbooks';
import {
  addAgentCandidate,
  earlierOutputStepIds,
  insertOutputToken,
  moveAgentCandidate,
  removeAgentCandidate,
  updateAgentCandidate,
} from './playbookEditor';

const singleStep = (): PlaybookStep => ({
  id: 'review',
  session: 'subagent',
  agents: ['opposing', { provider: 'claude', model: 'sonnet' }],
  systemPromptKey: 'agents.review_system',
  directive: { kind: 'prompt', text: '' },
});

const fanoutStep = (): PlaybookStep => ({
  id: 'review',
  session: 'subagent',
  runs: [
    [{ provider: 'codex', model: 'gpt-5' }, { provider: 'claude', model: 'sonnet' }],
    ['opposing'],
  ],
  systemPromptKey: 'agents.review_system',
  directive: { kind: 'prompt', text: '' },
});

describe('playbook agent-chain editing', () => {
  it('round-trips ordered fallback chains longer than one for agents and fan-out runs', () => {
    let single = addAgentCandidate(singleStep(), 0, { provider: 'codex' });
    single = moveAgentCandidate(single, 0, 2, -1);
    single = updateAgentCandidate(single, 0, 1, { provider: 'codex', effort: 'high' });
    expect(single.agents).toEqual([
      'opposing',
      { provider: 'codex', effort: 'high' },
      { provider: 'claude', model: 'sonnet' },
    ]);
    expect(single.runs).toBeUndefined();

    let fanout = addAgentCandidate(fanoutStep(), 1, { provider: 'claude' });
    fanout = removeAgentCandidate(fanout, 0, 0);
    expect(fanout.runs).toEqual([
      [{ provider: 'claude', model: 'sonnet' }],
      ['opposing', { provider: 'claude' }],
    ]);
    expect(fanout.agents).toBeUndefined();
  });

  it('never empties a chain when removing its only candidate', () => {
    const onlyCandidate: PlaybookStep = { ...singleStep(), agents: ['opposing'] };
    expect(removeAgentCandidate(onlyCandidate, 0, 0).agents).toEqual(['opposing']);
  });
});

describe('playbook output references', () => {
  const steps = [
    { ...singleStep(), id: 'implement' },
    { ...singleStep(), id: 'review' },
    { ...singleStep(), id: 'address' },
  ];

  it('suggests earlier steps only', () => {
    expect(earlierOutputStepIds(steps, 'address')).toEqual(['implement', 'review']);
    expect(earlierOutputStepIds(steps, 'implement')).toEqual([]);
  });

  it('inserts a selected earlier-step output at the current selection', () => {
    expect(insertOutputToken('Use result here', 'review', 4, 10)).toEqual({
      text: 'Use {{output:review}} here',
      caret: 21,
    });
  });
});
