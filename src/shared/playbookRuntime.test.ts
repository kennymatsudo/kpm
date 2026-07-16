import { describe, expect, it } from 'vitest';
import { BUILT_IN_PLAYBOOKS, type BoardProvider, type Playbook } from './playbooks';
import {
  advancePlaybook,
  parsePassCounts,
  renderPlaybookDirective,
  resolveCandidateChain,
  resolvePlaybookPlan,
} from './playbookRuntime';

const providers: BoardProvider[] = [
  {
    id: 'claude',
    name: 'Claude',
    available: true,
    models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }, { id: 'opus', name: 'Opus' }],
    capabilities: { nativeSkills: true, reviewSandbox: false },
  },
  {
    id: 'codex',
    name: 'Codex',
    available: true,
    models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true }],
    capabilities: { nativeSkills: false, reviewSandbox: true },
  },
];

describe('playbook runtime', () => {
  it('resolves the first available provider in an ordered fallback chain', () => {
    expect(resolveCandidateChain([{ provider: 'missing' }, { provider: 'claude' }], providers)).toMatchObject({ provider: 'claude', model: 'sonnet' });
    expect(resolveCandidateChain([{ provider: 'codex' }], providers)).toMatchObject({ provider: 'codex', model: 'gpt-5.5' });
  });

  it('follows the default model for a useDefault candidate', () => {
    expect(resolveCandidateChain([{ useDefault: true }], providers, { provider: 'claude', model: 'opus' }))
      .toMatchObject({ provider: 'claude', model: 'opus' });
    expect(resolveCandidateChain([{ useDefault: true, effort: 'high' }], providers, { provider: 'codex', model: 'gpt-5.5' }))
      .toMatchObject({ provider: 'codex', model: 'gpt-5.5', effort: 'high' });
  });

  it('degrades a useDefault model to the board provider default when the id is unknown', () => {
    // The chat codex model catalog differs from the board's; an unknown id
    // still keeps the provider and falls to that provider's default model.
    expect(resolveCandidateChain([{ useDefault: true }], providers, { provider: 'codex', model: 'gpt-5.6-sol' }))
      .toMatchObject({ provider: 'codex', model: 'gpt-5.5' });
  });

  it('falls through the chain when the default model names an unrunnable provider', () => {
    expect(resolveCandidateChain([{ useDefault: true }, { provider: 'claude', model: 'sonnet' }], providers, { provider: 'pi', model: 'auto' }))
      .toMatchObject({ provider: 'claude', model: 'sonnet' });
  });

  it('skips a useDefault candidate when no default model is known', () => {
    expect(resolveCandidateChain([{ useDefault: true }], providers)).toBeNull();
  });

  it('resolves a useDefault main step against the supplied default model', () => {
    const playbook: Playbook = {
      id: 'custom', name: 'Custom', builtIn: false,
      steps: [{ id: 'implement', session: 'main', systemPromptKey: 'agents.implementation_system', agents: [{ useDefault: true }], directive: { kind: 'prompt', text: 'go' } }],
    };
    expect(resolvePlaybookPlan(playbook, providers, { provider: 'claude', model: 'opus' }).main)
      .toMatchObject({ provider: 'claude', model: 'opus' });
  });

  it('resolves a visible provider plan for every run', () => {
    const plan = resolvePlaybookPlan(BUILT_IN_PLAYBOOKS.implementOpposingReview, providers);
    expect(plan.steps.map((step) => [step.stepId, step.runs.map((run) => run?.provider)])).toEqual([
      ['implement', ['claude']],
      ['review', ['codex']],
      ['address', ['claude']],
    ]);
  });

  it('runs the built-in main step on the user default, leaving review pinned', () => {
    const plan = resolvePlaybookPlan(BUILT_IN_PLAYBOOKS.implementOpposingReview, providers, { provider: 'codex', model: 'gpt-5.5' });
    expect(plan.steps.map((step) => [step.stepId, step.runs.map((run) => run?.provider)])).toEqual([
      ['implement', ['codex']],
      ['review', ['codex']],
      ['address', ['codex']],
    ]);
  });

  it('falls the built-in main step back to Claude when the default is unrunnable', () => {
    const plan = resolvePlaybookPlan(BUILT_IN_PLAYBOOKS.implementOpposingReview, providers, { provider: 'pi', model: 'auto' });
    expect(plan.main).toMatchObject({ provider: 'claude', model: 'sonnet' });
  });

  it('resolves a run per axis for the two-axis code-review playbook', () => {
    const plan = resolvePlaybookPlan(BUILT_IN_PLAYBOOKS.implementCodeReview, providers);
    expect(plan.steps.map((step) => [step.stepId, step.runs.map((run) => run?.provider)])).toEqual([
      ['implement', ['claude']],
      ['review', ['codex', 'codex']],
      ['address', ['claude']],
    ]);
  });

  it('routes findings through the bounded back edge and pauses at the budget', () => {
    const playbook = BUILT_IN_PLAYBOOKS.implementCodeReview;
    expect(advancePlaybook(playbook, 'review', true, {})).toEqual({ kind: 'step', stepId: 'address', passCounts: { review: 1 } });
    expect(advancePlaybook(playbook, 'review', true, { review: 2 })).toEqual({ kind: 'step', stepId: 'address', passCounts: { review: 3 } });
    expect(advancePlaybook(playbook, 'review', true, { review: 3 })).toEqual({ kind: 'pause', stepId: 'review', reason: 'max_passes', passCounts: { review: 3 } });
    expect(advancePlaybook(playbook, 'review', false, { review: 1 })).toEqual({ kind: 'complete', passCounts: { review: 1 } });
  });

  it('preserves canonical integer pass counts including zero', () => {
    expect(parsePassCounts('{"first":0,"second":2,"negative":-1,"decimal":1.5}')).toEqual({
      first: 0,
      second: 2,
    });
  });

  it('expands earlier output references and invokes native skills at message start', () => {
    const playbook: Playbook = {
      id: 'custom', name: 'Custom', builtIn: false,
      steps: [{ id: 'implement', session: 'main', systemPromptKey: 'agents.implementation_system', directive: { kind: 'skill', name: 'tdd', args: 'Use {{output:plan}}' } }],
    };
    expect(renderPlaybookDirective(playbook.steps[0], { plan: ['first', 'second'] }, { nativeSkills: true, taskContext: 'TASK' }))
      .toBe('/tdd Use Run 1:\nfirst\n\nRun 2:\nsecond\n\nTASK');
  });
});
