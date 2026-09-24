/**
 * KPM Configuration Tools
 *
 * Let chat read KPM's own configuration and propose changes to it. Proposals
 * are validated here, so the model fixes its own mistakes and the user only
 * sees valid changes, then always queue for the user's review: auto-apply
 * never covers configuration (P8). Nothing here writes a record.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import {
  CONFIG_KIND_REGISTRY,
  CONFIG_KINDS,
  type ConfigChange,
  type PlaybookConfigPayload,
} from '../../../shared/configKinds';
import type { BoardProvider, Playbook } from '../../../shared/playbooks';
import type { ServiceResult } from '../../services/result';

export interface ConfigPromptInfo {
  key: string;
  name: string;
  description: string;
  variables?: { name: string; description: string }[];
}

export interface ConfigToolDeps {
  playbooks: {
    list: () => ServiceResult<Playbook[]>;
    get: (id: string) => ServiceResult<Playbook>;
    getDefault: () => ServiceResult<string>;
  };
  listProviders: () => Promise<BoardProvider[]>;
  /** Prompts a playbook step may reference by key. */
  listStepPrompts: () => ConfigPromptInfo[];
  getPromptContent: (key: string) => ServiceResult<string>;
  onConfigChange: (change: ConfigChange) => void;
}

const READABLE_KINDS = [...CONFIG_KINDS, 'prompt'] as const;

export const PLAYBOOK_STEP_GRAMMAR = `A playbook is { name, steps[] }. Steps run in list order unless routed.
Step fields:
- id: lowercase slug (a-z, 0-9, "_" or "-"), unique within the playbook.
- session: "main" continues the implementation agent's own session in the task worktree; "subagent" is a separate agent run that reads the worktree and, unless writes is true, cannot edit it.
- agents: ordered fallback list; each entry is { provider, model?, effort? } or { useDefault: true, effort? } (the user's KPM model). Required on subagent steps and on the first main step; not allowed on later main steps, which reuse the first main step's agent.
- runs: subagent-only alternative to agents that runs several agents in parallel; each entry is an agents list. runOverrides[i] = { axis?: "standards" | "spec" | "general", systemPromptKey? } lines up with runs[i].
- systemPromptKey: the role instructions, a key from the prompt list. Required on subagent steps and the first main step; not allowed on later main steps.
- directive: { kind: "prompt", text } for inline instructions, or { kind: "prompt", promptKey } for a listed prompt. { kind: "prompt" } alone sends only the task. "{{output:<earlier step id>}}" in text inserts that step's final report.
- writes: true lets a single-run subagent step edit files.
- verdict: "findings" makes a subagent step return machine-readable findings.
- onFindings: { goto, maxPasses, onMaxPasses: "pause" | "proceed", onStall?: "pause" | "proceed" } routes to goto while findings remain, at most maxPasses times. Requires verdict "findings". onStall decides what happens when a fix pass leaves the diff unchanged.
- next: step id to run after this one. Defaults to the following step, except that a step with verdict and onFindings but no next ends the run when it has no findings.
- pauseBefore: true waits for the user before the step starts.
Rules:
- The playbook needs at least one main step, and every step must be reachable from the first.
- Every cycle must pass through a step with onFindings (which bounds it with maxPasses).
- A review loop is review { verdict: "findings", onFindings: { goto: "address", ... }, next: "<after>" } plus address { session: "main", next: "review" }. Every exit from the loop (no findings, a pass that clears everything, max passes with proceed) continues at review.next.
- A second findings check needs its own address step; pointing it at the first loop's address step sends the run back into that loop.
- A subagent reviewer should be a different agent from the implementer where possible.`;

const READ_DESCRIPTION = `Read KPM's own configuration.

- \`read_config({ kind: "playbook" })\` lists execution playbooks (summaries) plus what a step can reference: board providers and their models, prompt keys with descriptions, and the step grammar.
- \`read_config({ kind: "playbook", id })\` returns one playbook in full, with its \`version\` token and the same reference data.
- \`read_config({ kind: "prompt" })\` lists the prompt keys a step can use; \`read_config({ kind: "prompt", id: key })\` returns one prompt's full text.

Call this before \`propose_config_change\`: an update needs the playbook's current steps and \`version\`.`;

const PROPOSE_DESCRIPTION = `Propose creating or changing a KPM execution playbook. The proposal is validated first; if it has problems, this returns them so you can fix the payload and call again. A valid proposal always queues for the user's review, even when auto-apply is on, and nothing is saved until they approve it. Playbooks are global, so an approved change applies to every project.

## Parameters
- \`kind\`: "playbook".
- \`op\`: "create" or "update". There is no delete; the user deletes playbooks in Settings.
- \`id\`: the playbook to update (required for update).
- \`baseVersion\`: the \`version\` from \`read_config\` for that playbook (required for update). If the user edits the playbook before approving, the change is rejected instead of overwriting their edit.
- \`payload\`: { name, steps } — the complete playbook, not a patch. Read the step grammar from \`read_config\`.

## Rules
- Write step instructions as \`directive: { kind: "prompt", text }\` or a listed \`promptKey\`. Skill directives are not accepted; if the user wants a skill's behaviour, read the skill file and put its text in \`text\` as written.
- Updating a built-in playbook saves a customized copy; the user can reset it.
- Runs already in progress keep the playbook they started with.
- After proposing, tell the user it is waiting for their review. To revise, send a corrected proposal; the user cannot edit it in the approval panel.`;

function summarize(playbook: Playbook) {
  return {
    id: playbook.id,
    name: playbook.name,
    builtIn: playbook.builtIn,
    version: CONFIG_KIND_REGISTRY.playbook.version(playbook),
    steps: playbook.steps.map((step) => step.id),
  };
}

export function createConfigTools(deps: ConfigToolDeps) {
  const playbookReference = async () => {
    const providers = await deps.listProviders();
    return {
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        available: provider.available,
        models: provider.models.map((model) => model.isDefault ? `${model.id} (default)` : model.id),
      })),
      prompts: deps.listStepPrompts().map(({ key, description }) => ({ key, description })),
      grammar: PLAYBOOK_STEP_GRAMMAR,
    };
  };

  const readPlaybooks = async (id?: string) => {
    const reference = await playbookReference();
    if (id) {
      const result = deps.playbooks.get(id);
      if (!result.ok) return toolError(result.error);
      return jsonResult({ playbook: { ...result.data, version: CONFIG_KIND_REGISTRY.playbook.version(result.data) }, reference });
    }
    const list = deps.playbooks.list();
    if (!list.ok) return toolError(list.error);
    const defaultId = deps.playbooks.getDefault();
    return jsonResult({
      playbooks: list.data.map(summarize),
      defaultId: defaultId.ok ? defaultId.data : undefined,
      reference,
    });
  };

  const readPrompts = (key?: string) => {
    const prompts = deps.listStepPrompts();
    if (!key) return jsonResult({ prompts: prompts.map(({ key: promptKey, name, description }) => ({ key: promptKey, name, description })) });
    const info = prompts.find((prompt) => prompt.key === key);
    if (!info) return toolError(`Unknown prompt key: ${key}. Call read_config({ kind: "prompt" }) for the list.`);
    const content = deps.getPromptContent(key);
    if (!content.ok) return toolError(content.error);
    return jsonResult({ prompt: { ...info, text: content.data } });
  };

  return [
    tool(
      'read_config',
      READ_DESCRIPTION,
      {
        kind: z.enum(READABLE_KINDS).describe('"playbook" or "prompt"'),
        id: z.string().min(1).optional().describe('Playbook id or prompt key; omit to list'),
      },
      async ({ kind, id }) => (kind === 'prompt' ? readPrompts(id) : readPlaybooks(id)),
    ),
    tool(
      'propose_config_change',
      PROPOSE_DESCRIPTION,
      {
        kind: z.enum(CONFIG_KINDS).describe('Configuration kind; only "playbook" today'),
        op: z.enum(['create', 'update']).describe('"create" or "update"'),
        id: z.string().min(1).optional().describe('Playbook id to update (required for update)'),
        baseVersion: z.string().min(1).optional().describe('Version token from read_config (required for update)'),
        payload: z.object({
          name: z.string().describe('Playbook name'),
          steps: z.array(z.record(z.string(), z.unknown())).describe('Complete ordered step list; see the grammar from read_config'),
        }).describe('The complete playbook'),
      },
      async ({ kind, op, id, baseVersion, payload }) => {
        const providers = await deps.listProviders();
        const issues = CONFIG_KIND_REGISTRY[kind].validate(payload, {
          providerIds: providers.map((provider) => provider.id),
          promptKeys: deps.listStepPrompts().map((prompt) => prompt.key),
        });
        if (issues.length > 0) {
          return toolError(`The proposal was not submitted. Fix these and call again:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
        }
        const after: PlaybookConfigPayload = { name: payload.name.trim(), steps: payload.steps as unknown as PlaybookConfigPayload['steps'] };

        let before: PlaybookConfigPayload | null = null;
        if (op === 'update') {
          if (!id || !baseVersion) return toolError('update needs id and baseVersion from read_config.');
          const current = deps.playbooks.get(id);
          if (!current.ok) return toolError(current.error);
          if (CONFIG_KIND_REGISTRY.playbook.version(current.data) !== baseVersion) {
            return toolError('This playbook changed since you read it. Call read_config again and rebuild the proposal from the current version.');
          }
          before = { name: current.data.name, steps: current.data.steps };
          if (CONFIG_KIND_REGISTRY.playbook.version(after) === baseVersion) {
            return toolError('The proposal matches the current playbook; there is nothing to change.');
          }
        }

        const change: ConfigChange = {
          kind,
          op,
          ...(op === 'update' ? { targetId: id, baseVersion } : {}),
          before,
          after,
        };
        deps.onConfigChange(change);
        return jsonResult({
          proposalSubmitted: true,
          kind,
          op,
          name: after.name,
          status: 'Waiting for the user to review it in KPM. Nothing is saved until they approve.',
        });
      },
    ),
  ];
}
