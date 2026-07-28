import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PlanContext } from './types';
import { buildPlanReferenceRulesSection } from './index';
import { buildResponseModesSection } from './modes';
import { PROMPT_REGISTRY_MAP } from './promptRegistry';
import { GROUNDING, CONSTRAINTS, WORKSPACE_SECTION, PLAN_SYSTEM_RULES, RESPONSE_STYLE } from './workspace';
import { focusFixture } from './__fixtures__/promptContextFixtures';

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(),
}));

vi.mock('../../kpmTools/runtimeRegistry', () => ({
  executeKpmTool: vi.fn(),
  getKpmToolDefinitions: () => [],
  runWithToolExecutionContext: (_context: unknown, run: () => unknown) => run(),
}));

import { buildCodexSystemPrompt } from '../../codex/CodexChatSession';
import { buildPiSystemPrompt } from '../../pi/PiChatSession';

const providerPromptBuilders: Record<string, (context: PlanContext) => string> = {
  Codex: buildCodexSystemPrompt,
  pi: buildPiSystemPrompt,
};

const providerFocusBaselineFiles: Record<string, string> = {
  Codex: 'codexFocusBaseline.txt',
  pi: 'piFocusBaseline.txt',
};

function readFixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    'utf8'
  ).replace(/\r?\n$/, '');
}

function makeContext(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    project: {
      id: 'project-1',
      name: 'Test Project',
      folder_path: '/tmp/project-1',
      phase: 'discovery',
      session_tokens: 0,
      session_input_tokens: 0,
      session_output_tokens: 0,
    },
    repos: [{ id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1' }],
    attachments: [],
    planItems: [],
    focusedResources: [],
    ...overrides,
  };
}

describe.each(Object.keys(providerPromptBuilders))('%s main-scope system prompt', (provider) => {
  const build = providerPromptBuilders[provider];

  it('composes the shared registry sections verbatim', () => {
    const context = makeContext();
    const prompt = build(context);

    expect(prompt).toContain(GROUNDING);
    expect(prompt).toContain(CONSTRAINTS);
    expect(prompt).toContain(WORKSPACE_SECTION);
    expect(prompt).toContain(PLAN_SYSTEM_RULES);
    expect(prompt).toContain(RESPONSE_STYLE);
    expect(prompt).toContain(buildResponseModesSection(true, context.planItems, undefined));
    expect(prompt).toContain(buildPlanReferenceRulesSection());
  });

  it('propagates a prompt override into the composed sections', () => {
    const prompt = build(makeContext({
      getPromptContent: (key) =>
        key === 'system.constraints' ? 'SENTINEL_X' : (PROMPT_REGISTRY_MAP.get(key)?.defaultContent ?? ''),
    }));

    expect(prompt).toContain('SENTINEL_X');
  });

  it('does not leak Claude built-in tool names or the Claude-only tool tree', () => {
    const prompt = build(makeContext());

    expect(prompt).not.toContain('## Tools');
    expect(prompt).not.toContain('Grep/Glob/Read');
    expect(prompt).not.toContain('Read/Grep/Glob');
  });

  it('states the conversation-wide write-consent policy honestly', () => {
    const prompt = build(makeContext());

    expect(prompt).not.toContain('edit repo files only when the user explicitly asks');
    expect(prompt).not.toContain('read-only in chat');
    expect(prompt).toContain("Direct writes need the user's consent");
  });
});

describe.each(Object.keys(providerPromptBuilders))('%s focus-scope system prompt', (provider) => {
  const build = providerPromptBuilders[provider];

  it('matches the pre-refactor focus baseline byte-for-byte', () => {
    const baseline = readFixture(providerFocusBaselineFiles[provider]);

    expect(build(focusFixture)).toBe(baseline);
  });

  it('preserves the focused document, replayed turns, and hand-rolled rules', () => {
    const prompt = build(focusFixture);

    expect(prompt).toContain('Focused Spec Document');
    expect(prompt).toContain('The focused document body describes the export boundary.');
    expect(prompt).toContain('What did we decide about exports?');
    expect(prompt).toContain('We translate at the export boundary.');
    expect(prompt).toContain('# Operating Rules');
  });

  it('does not inject main-only plan tooling or plan-structure guidance into focus scope', () => {
    const prompt = build(focusFixture);

    expect(prompt).not.toContain('modify_plan');
    expect(prompt).not.toContain('## Plan Structure');
  });
});
