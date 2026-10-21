import { describe, expect, it, vi } from 'vitest';
import { createConfigTools } from './config';
import { CONFIG_KIND_REGISTRY } from '../../../shared/configKinds';
import { BUILT_IN_PLAYBOOKS, type Playbook } from '../../../shared/playbooks';

const existing: Playbook = { ...BUILT_IN_PLAYBOOKS.implementOpposingReview, id: 'custom-1', name: 'Mine', builtIn: false };

function makeTools() {
  const onConfigChange = vi.fn();
  const [readTool, proposeTool] = createConfigTools({
    playbooks: {
      list: () => ({ ok: true, data: [existing] }),
      get: (id) => id === existing.id ? { ok: true, data: existing } : { ok: false, error: `Playbook not found: ${id}` },
      getDefault: () => ({ ok: true, data: existing.id }),
    },
    listProviders: async () => [
      { id: 'claude', name: 'Claude', available: true, models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }], capabilities: { nativeSkills: true, reviewSandbox: false } },
      { id: 'codex', name: 'Codex', available: true, models: [], capabilities: { nativeSkills: false, reviewSandbox: true } },
      { id: 'gemini', name: 'Gemini', available: false, models: [], capabilities: { nativeSkills: false, reviewSandbox: false } },
    ],
    listStepPrompts: () => ['agents.implementation_system', 'agents.review_system', 'agents.review_assessment']
      .map((key) => ({ key, name: key, description: `About ${key}` })),
    getPromptContent: (key) => ({ ok: true, data: `Text of ${key}` }),
    onConfigChange,
  });
  const call = (tool: unknown, args: Record<string, unknown>) =>
    (tool as { handler: (args: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> }).handler(args, {});
  return { read: (args: Record<string, unknown>) => call(readTool, args), propose: (args: Record<string, unknown>) => call(proposeTool, args), onConfigChange };
}

const newPlaybook = {
  name: 'Implement only, tidy',
  steps: [
    { id: 'implement', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt' } },
    { id: 'prune', session: 'main', directive: { kind: 'prompt', text: 'Prune the comments this change added.' } },
  ],
};

describe('propose_config_change', () => {
  it('returns validation issues to the model instead of proposing', async () => {
    const { propose, onConfigChange } = makeTools();

    const result = await propose({
      kind: 'playbook',
      op: 'create',
      payload: { name: 'Broken', steps: [{ ...newPlaybook.steps[0], onFindings: { goto: 'nowhere', maxPasses: 1, onMaxPasses: 'pause' } }] },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('onFindings requires verdict: findings');
    expect(result.content[0].text).toContain('Unknown target step: nowhere');
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('proposes a valid new playbook with no base', async () => {
    const { propose, onConfigChange } = makeTools();

    const result = await propose({ kind: 'playbook', op: 'create', payload: newPlaybook });

    expect(result.isError).toBeUndefined();
    expect(onConfigChange).toHaveBeenCalledWith({ kind: 'playbook', op: 'create', before: null, after: newPlaybook });
  });

  it('carries the current definition and version on an update', async () => {
    const { propose, onConfigChange } = makeTools();
    const baseVersion = CONFIG_KIND_REGISTRY.playbook.version(existing);

    await propose({ kind: 'playbook', op: 'update', id: existing.id, baseVersion, payload: newPlaybook });

    expect(onConfigChange).toHaveBeenCalledWith({
      kind: 'playbook',
      op: 'update',
      targetId: existing.id,
      baseVersion,
      before: { name: existing.name, steps: existing.steps },
      after: newPlaybook,
    });
  });

  it('refuses an update drafted against an older version', async () => {
    const { propose, onConfigChange } = makeTools();

    const result = await propose({ kind: 'playbook', op: 'update', id: existing.id, baseVersion: 'stale', payload: newPlaybook });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('changed since you read it');
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('refuses an update without a base version', async () => {
    const { propose, onConfigChange } = makeTools();

    const result = await propose({ kind: 'playbook', op: 'update', id: existing.id, payload: newPlaybook });

    expect(result.isError).toBe(true);
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});

describe('read_config', () => {
  it('lists playbooks with version tokens and what a step can reference', async () => {
    const { read } = makeTools();

    const result = JSON.parse((await read({ kind: 'playbook' })).content[0].text);

    expect(result.playbooks).toEqual([expect.objectContaining({ id: existing.id, version: CONFIG_KIND_REGISTRY.playbook.version(existing) })]);
    expect(result.reference.providers.map((provider: { id: string }) => provider.id)).toEqual(['claude', 'codex', 'gemini']);
    expect(result.reference.prompts).toContainEqual({ key: 'agents.review_system', description: 'About agents.review_system' });
    expect(result.reference.grammar).toContain('onFindings');
  });

  it('returns one prompt in full only when asked by key', async () => {
    const { read } = makeTools();

    const listed = JSON.parse((await read({ kind: 'prompt' })).content[0].text);
    const single = JSON.parse((await read({ kind: 'prompt', id: 'agents.review_system' })).content[0].text);

    expect(listed.prompts[0]).not.toHaveProperty('text');
    expect(single.prompt.text).toBe('Text of agents.review_system');
  });
});
