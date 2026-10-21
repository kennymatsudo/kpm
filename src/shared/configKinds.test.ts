import { describe, expect, it } from 'vitest';
import { CONFIG_KIND_REGISTRY, configVersion, diffPlaybooks, type PlaybookConfigPayload } from './configKinds';
import { advancePlaybook, type RoundOutcome } from './playbookRuntime';
import { parsePlaybook, type PlaybookStep } from './playbooks';

const PROVIDERS = ['claude', 'codex', 'gemini', 'pi'];
const PROMPT_KEYS = ['agents.implementation_system', 'agents.review_system', 'agents.review_assessment'];
const context = { providerIds: PROVIDERS, promptKeys: PROMPT_KEYS };

/** The brief's acceptance example: implement, review loop, simplify, rename, prune. */
const WORKED_EXAMPLE: PlaybookConfigPayload = {
  name: 'Implement, review, simplify, tidy',
  steps: [
    { id: 'implement', session: 'main', agents: [{ useDefault: true }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt' } },
    {
      id: 'review', session: 'subagent', agents: [{ provider: 'codex' }], systemPromptKey: 'agents.review_system',
      directive: { kind: 'prompt', text: 'Review the diff.' }, verdict: 'findings',
      onFindings: { goto: 'address', maxPasses: 3, onMaxPasses: 'pause', onStall: 'pause' }, next: 'simplify_review',
    },
    { id: 'address', session: 'main', directive: { kind: 'prompt', promptKey: 'agents.review_assessment' }, next: 'review' },
    {
      id: 'simplify_review', session: 'subagent', agents: [{ provider: 'codex' }], systemPromptKey: 'agents.review_system',
      directive: { kind: 'prompt', text: 'Find anything overengineered or built on assumptions the Work Brief does not support.' },
      verdict: 'findings', onFindings: { goto: 'simplify_address', maxPasses: 1, onMaxPasses: 'proceed' }, next: 'rename',
    },
    { id: 'simplify_address', session: 'main', directive: { kind: 'prompt', text: 'Apply the simplification findings.' }, next: 'rename' },
    { id: 'rename', session: 'main', directive: { kind: 'prompt', text: 'Clean up the names this change introduced.' } },
    { id: 'prune', session: 'main', directive: { kind: 'prompt', text: 'Prune the comments this change added.' } },
  ],
};

const validate = CONFIG_KIND_REGISTRY.playbook.validate;
const clean: RoundOutcome = { hasFindings: false, hasBlockingFindings: false, madeProgress: true };
const blocking: RoundOutcome = { hasFindings: true, hasBlockingFindings: true, madeProgress: true };

function withStep(id: string, patch: Partial<PlaybookStep>): PlaybookConfigPayload {
  return { ...WORKED_EXAMPLE, steps: WORKED_EXAMPLE.steps.map((step) => step.id === id ? { ...step, ...patch } : step) };
}

describe('playbook config validation', () => {
  it('accepts the worked example', () => {
    expect(validate(WORKED_EXAMPLE, context)).toEqual([]);
  });

  it('names the step and field of a structural problem', () => {
    const { systemPromptKey: _dropped, ...reviewWithoutRole } = WORKED_EXAMPLE.steps[1];
    const payload = { ...WORKED_EXAMPLE, steps: [WORKED_EXAMPLE.steps[0], reviewWithoutRole, ...WORKED_EXAMPLE.steps.slice(2)] };

    expect(validate(payload, context)).toContain('step "review" (systemPromptKey): subagent steps require systemPromptKey');
  });

  it('rejects skill directives, which new playbooks no longer use', () => {
    const issues = validate(withStep('rename', { directive: { kind: 'skill', name: 'rename-variables' } }), context);

    expect(issues).toEqual([expect.stringContaining('step "rename": skill directives are not supported')]);
  });

  it('rejects providers and prompt keys KPM does not know', () => {
    const issues = validate(withStep('review', { agents: [{ provider: 'gpt' }], systemPromptKey: 'agents.nope' }), context);

    expect(issues).toEqual([
      'step "review": unknown provider "gpt"',
      'step "review": unknown prompt key "agents.nope"',
    ]);
  });

  it('enforces the save endpoint limits so an approved proposal cannot fail on them', () => {
    expect(validate({ ...WORKED_EXAMPLE, name: 'x'.repeat(121) }, context)).toContain('name must be at most 120 characters');
    expect(validate({ ...WORKED_EXAMPLE, name: '  ' }, context)).toContain('name is required');
  });
});

describe('worked example routing', () => {
  const playbook = parsePlaybook({ id: 'worked', builtIn: false, ...WORKED_EXAMPLE });

  it('loops review and address until clean, then simplifies, renames, and prunes', () => {
    let counts: Record<string, number> = {};
    const step = (id: string, outcome: RoundOutcome) => {
      const advance = advancePlaybook(playbook, id, outcome, counts);
      counts = advance.passCounts;
      return advance.kind === 'step' ? advance.stepId : advance.kind;
    };

    expect(step('implement', clean)).toBe('review');
    expect(step('review', blocking)).toBe('address');
    expect(step('address', clean)).toBe('review');
    expect(step('review', clean)).toBe('simplify_review');
    expect(step('simplify_review', blocking)).toBe('simplify_address');
    expect(step('simplify_address', clean)).toBe('rename');
    expect(step('rename', clean)).toBe('prune');
    expect(step('prune', clean)).toBe('complete');
  });

  it('skips simplify_address when the simplification check is clean', () => {
    expect(advancePlaybook(playbook, 'simplify_review', clean, {})).toMatchObject({ kind: 'step', stepId: 'rename' });
  });
});

describe('config version', () => {
  it('ignores key order and changes when the definition changes', () => {
    expect(configVersion({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(configVersion({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(CONFIG_KIND_REGISTRY.playbook.version(WORKED_EXAMPLE))
      .not.toBe(CONFIG_KIND_REGISTRY.playbook.version(withStep('review', { next: 'rename' })));
  });
});

describe('playbook diff', () => {
  it('lists every step as added for a new playbook', () => {
    expect(diffPlaybooks(null, WORKED_EXAMPLE).map((entry) => entry.kind)).toEqual(Array(7).fill('step-added'));
  });

  it('reports added, removed, routing, instruction, and order changes', () => {
    const [implement, review, address, , , rename, prune] = WORKED_EXAMPLE.steps;
    const before: PlaybookConfigPayload = { name: 'Old', steps: [implement, review, address, prune, rename] };
    const after: PlaybookConfigPayload = {
      name: 'New',
      steps: [
        implement,
        { ...review, next: 'rename', directive: { kind: 'prompt', text: 'Review harder.' } },
        rename,
        prune,
        { id: 'summarize', session: 'main', directive: { kind: 'prompt', text: 'Summarize.' } },
      ],
    };

    const entries = diffPlaybooks(before, after);

    expect(entries).toContainEqual({ kind: 'renamed', before: 'Old', after: 'New' });
    expect(entries).toContainEqual(expect.objectContaining({ kind: 'step-removed', stepId: 'address' }));
    expect(entries).toContainEqual(expect.objectContaining({ kind: 'step-added', stepId: 'summarize' }));
    expect(entries).toContainEqual({
      kind: 'step-changed',
      stepId: 'review',
      changes: [
        { field: 'directive.text', label: 'Instructions', format: 'text', before: 'Review the diff.', after: 'Review harder.' },
        { field: 'next', label: 'Then', format: 'value', before: 'simplify_review', after: 'rename' },
      ],
    });
    expect(entries).toContainEqual({ kind: 'reordered', before: ['implement', 'review', 'prune', 'rename'], after: ['implement', 'review', 'rename', 'prune'] });
    expect(entries.some((entry) => entry.kind === 'step-changed' && entry.stepId === 'prune')).toBe(false);
  });
});
